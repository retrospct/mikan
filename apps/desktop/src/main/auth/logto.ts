/**
 * Logto authentication for the Electron desktop client (main process).
 *
 * Logto is a standard OIDC provider, so this is a textbook native-app flow —
 * Authorization Code + PKCE in the *system browser*, with a custom-scheme
 * redirect (`neeme://callback`). No Logto SDK needed; we drive the discovered
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
import { app, safeStorage, shell } from 'electron'
import { createRemoteJWKSet } from 'jose'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AuthClaims, AuthState } from '@nimi/contract/ipc'
import {
  buildAuthorizeUrl,
  claimsFromPayload,
  pkceChallenge,
  randomNonce,
  randomState,
  randomVerifier,
  verifyIdToken
} from './oidc'

const REDIRECT_URI = 'neeme://callback'
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

export function isConfigured(): boolean {
  return Boolean(endpoint && appId)
}

function sessionFile(): string {
  return join(app.getPath('userData'), 'neeme-auth.bin')
}

async function persist(): Promise<void> {
  if (!session?.refreshToken) {
    await rm(sessionFile(), { force: true }).catch(() => {})
    return
  }
  // Only the refresh token + display claims are persisted; access tokens stay in memory.
  const plain = JSON.stringify({ refreshToken: session.refreshToken, claims: session.claims })
  const blob = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plain)
    : Buffer.from(plain, 'utf8') // fallback (e.g. Linux w/o keyring); still inside userData
  await writeFile(sessionFile(), blob)
}

async function discover(): Promise<OidcConfig> {
  if (discovery) return discovery
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
  if (!res.ok) throw new Error(`Logto token request failed (HTTP ${res.status})`)
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

/** Handle the `neeme://callback?code=...&state=...` deep link from the browser. */
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
  } catch {
    session = null
    await persist()
    emit()
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
    const parsed = JSON.parse(plain) as { refreshToken?: string; claims?: AuthClaims | null }
    if (parsed.refreshToken) {
      session = {
        accessToken: '',
        refreshToken: parsed.refreshToken,
        expiresAt: 0,
        claims: parsed.claims ?? null
      }
      await refresh().catch(() => {
        session = null
      })
    }
  } catch {
    /* no stored session */
  }
}
