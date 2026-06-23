/**
 * Logto authentication for the Electron desktop client (main process).
 *
 * Logto is a standard OIDC provider, so this is a textbook native-app flow —
 * Authorization Code + PKCE in the *system browser*, with a custom-scheme
 * redirect (`<brand-scheme>://callback`, e.g. mikan://callback). No Logto SDK
 * needed; we drive the discovered
 * OIDC endpoints directly. Running it in main (not the renderer) means:
 *   - credentials only ever live in the user's real browser,
 *   - the refresh token is sealed in the OS keychain via `safeStorage`,
 *   - only the short-lived access token is handed to the renderer for requests,
 *   - and the renderer needs no CSP changes (it never talks to Logto).
 *
 * Inert until configured: with no MAIN_VITE_LOGTO_ENDPOINT / _APP_ID, every
 * entry point no-ops or throws a friendly error, and the app stays unauthenticated
 * (local-first; auth is deferred behind sync — see docs/adr/0002-authentication.md).
 *
 * The id_token is signature-verified against Logto's JWKS (iss/aud/exp + the
 * nonce we bind on the authorize request) before its display claims are trusted
 * — see ./oidc.ts. The access token is opaque to us; our backend remains the
 * trust boundary that verifies it (still deferred — no backend yet).
 */
import { brand } from '@nimi/brand'
import type { AuthClaims, AuthState } from '@nimi/contract/ipc'
import { app, safeStorage, shell } from 'electron'
import { createRemoteJWKSet } from 'jose'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildAuthorizeUrl,
  claimsFromPayload,
  pkceChallenge,
  randomNonce,
  randomState,
  randomVerifier,
  verifyIdToken
} from './oidc'

const REDIRECT_URI = `${brand.scheme}://callback`
const SCOPE = 'openid profile email offline_access'

type Listener = (state: AuthState, accessToken?: string) => void
type JwksResolver = ReturnType<typeof createRemoteJWKSet>

interface OidcConfig {
  authorization_endpoint: string
  token_endpoint: string
  end_session_endpoint?: string
  jwks_uri: string
  issuer: string
}
interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
}
interface Session {
  accessToken: string
  refreshToken?: string
  expiresAt: number // epoch ms
  claims: AuthClaims | null
}

const endpoint = (import.meta.env.MAIN_VITE_LOGTO_ENDPOINT ?? '').replace(/\/+$/, '')
const appId = import.meta.env.MAIN_VITE_LOGTO_APP_ID ?? ''
const resource = import.meta.env.MAIN_VITE_LOGTO_RESOURCE || undefined

let discovery: OidcConfig | null = null
let jwks: JwksResolver | null = null
let session: Session | null = null
let pending: { verifier: string; state: string; nonce: string } | null = null
let listener: Listener | null = null
// Last plaintext written to (or read from) the session file. Lets persist() skip a
// redundant re-seal — a macOS Keychain touch — when nothing actually changed.
let lastPersisted: string | null = null

export function isConfigured(): boolean {
  return Boolean(endpoint && appId)
}

function sessionFile(): string {
  return join(app.getPath('userData'), 'neeme-auth.bin')
}

async function persist(): Promise<void> {
  if (!session?.refreshToken) {
    lastPersisted = null
    await rm(sessionFile(), { force: true }).catch(() => {})
    return
  }
  // Only the refresh token + display claims are persisted; access tokens stay in memory.
  const plain = JSON.stringify({ refreshToken: session.refreshToken, claims: session.claims })
  // Skip the re-seal when nothing changed — e.g. a boot refresh that returns the
  // SAME refresh token. encryptString is a Keychain access; an unsigned dev build
  // re-prompts for each one, so eliding the no-op write halves the boot prompts.
  // In a signed release it just avoids a pointless disk write.
  if (plain === lastPersisted) return
  const blob = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plain)
    : Buffer.from(plain, 'utf8') // fallback (e.g. Linux w/o keyring); still inside userData
  await writeFile(sessionFile(), blob)
  lastPersisted = plain
}

async function discover(): Promise<OidcConfig> {
  if (discovery) return discovery
  // OIDC carries bearer/refresh tokens — require TLS so discovery + token exchange
  // can't be MITM'd by a plaintext endpoint. The endpoint is env-configured
  // (trusted), so this just guards against a misconfiguration, not a live attacker.
  if (!endpoint.startsWith('https://')) {
    throw new Error('Logto endpoint must be https:// (refusing to use a non-TLS OIDC endpoint)')
  }
  const res = await fetch(`${endpoint}/oidc/.well-known/openid-configuration`)
  if (!res.ok) throw new Error(`Logto OIDC discovery failed (HTTP ${res.status})`)
  discovery = (await res.json()) as OidcConfig
  return discovery
}

/** Lazily build (and cache) the remote JWKS resolver — it handles key rotation. */
function getJwks(cfg: OidcConfig): JwksResolver {
  if (!jwks) jwks = createRemoteJWKSet(new URL(cfg.jwks_uri))
  return jwks
}

/**
 * Run a token grant, then (when an id_token is returned) verify it before
 * trusting its claims. `expectedNonce` is the nonce from the authorize request
 * on the code grant; refresh grants pass none (and often omit the id_token).
 */
async function exchange(body: URLSearchParams, expectedNonce?: string): Promise<void> {
  const cfg = await discover()
  if (resource) body.set('resource', resource)
  const res = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) {
    const err = new Error(`Logto token request failed (HTTP ${res.status})`)
    ;(err as { status?: number }).status = res.status
    throw err
  }
  const t = (await res.json()) as TokenResponse
  let claims: AuthClaims | null = session?.claims ?? null
  if (t.id_token) {
    const payload = await verifyIdToken(t.id_token, {
      jwks: getJwks(cfg),
      issuer: cfg.issuer,
      audience: appId,
      nonce: expectedNonce
    })
    claims = claimsFromPayload(payload)
  }
  session = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? session?.refreshToken,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    claims
  }
  await persist()
  emit()
}

async function refresh(): Promise<void> {
  if (!session?.refreshToken) throw new Error('no refresh token')
  await exchange(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: appId
    })
  )
}

/**
 * True only when the auth server actively *rejected* our refresh token (HTTP
 * 400/401 — e.g. `invalid_grant` after revocation/expiry). Network failures,
 * timeouts, and 5xx are transient: offline at launch must NOT log a returning
 * user out, otherwise a hard login gate would lock them out of their own
 * local-first data with no network. Those cases keep the cached session (sync
 * just goes without a fresh token until connectivity returns).
 */
function isAuthRejection(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  return status === 400 || status === 401
}

/** Kick off interactive login by opening the system browser to Logto. */
export async function startLogin(): Promise<void> {
  if (!isConfigured()) {
    throw new Error(
      'Logto is not configured (set MAIN_VITE_LOGTO_ENDPOINT and MAIN_VITE_LOGTO_APP_ID).'
    )
  }
  const cfg = await discover()
  const verifier = randomVerifier()
  const state = randomState()
  const nonce = randomNonce()
  pending = { verifier, state, nonce }

  const url = buildAuthorizeUrl({
    authorizationEndpoint: cfg.authorization_endpoint,
    clientId: appId,
    redirectUri: REDIRECT_URI,
    scope: SCOPE,
    challenge: pkceChallenge(verifier),
    state,
    nonce,
    resource
  })
  await shell.openExternal(url)
}

/** Handle the `<scheme>://callback?code=...&state=...` deep link from the browser. */
export async function handleCallback(callbackUrl: string): Promise<void> {
  if (!pending) return
  const u = new URL(callbackUrl)
  const code = u.searchParams.get('code')
  const state = u.searchParams.get('state')
  const expected = pending
  pending = null
  if (!code || state !== expected.state) {
    throw new Error('Logto callback: missing code or state mismatch')
  }
  await exchange(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: appId,
      code_verifier: expected.verifier
    }),
    expected.nonce
  )
}

/** Return a valid access token, refreshing if near expiry. `undefined` if signed out. */
export async function getAccessToken(): Promise<string | undefined> {
  if (!session) return undefined
  if (session.accessToken && Date.now() < session.expiresAt - 60_000) return session.accessToken
  try {
    await refresh()
    return session?.accessToken
  } catch (err) {
    // Only sign out on a hard rejection of the refresh token. On a transient
    // failure (offline / 5xx) keep the session: the user stays signed in and
    // simply has no fresh access token until they're back online.
    if (isAuthRejection(err)) {
      session = null
      await persist()
      emit()
    }
    return undefined
  }
}

export async function logout(): Promise<void> {
  session = null
  await persist()
  emit()
}

export function getState(): AuthState {
  return {
    configured: isConfigured(),
    isAuthenticated: Boolean(session),
    claims: session?.claims ?? null
  }
}

/** Register the single listener (main broadcasts changes to the renderer). */
export function onChange(cb: Listener): void {
  listener = cb
}

function emit(): void {
  listener?.(getState(), session?.accessToken)
}

/** Restore a persisted session on startup (silent refresh). Safe when unconfigured. */
export async function init(): Promise<void> {
  if (!isConfigured()) return
  try {
    const blob = await readFile(sessionFile())
    const plain = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(blob)
      : blob.toString('utf8')
    // Remember what's already sealed on disk so a boot refresh that returns the
    // same refresh token + claims won't trigger a redundant re-seal (Keychain touch).
    lastPersisted = plain
    const parsed = JSON.parse(plain) as { refreshToken?: string; claims?: AuthClaims | null }
    if (parsed.refreshToken) {
      session = {
        accessToken: '',
        refreshToken: parsed.refreshToken,
        expiresAt: 0,
        claims: parsed.claims ?? null
      }
      // Silent refresh on boot. If it fails only because we're offline (or the
      // server is briefly down), keep the restored session so the login gate
      // still opens to the user's local data; only a real auth rejection drops it.
      await refresh().catch((err) => {
        if (isAuthRejection(err)) session = null
      })
    }
  } catch {
    /* no stored session */
  }
}
