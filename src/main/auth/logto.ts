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
 * NOTE: the access token is consumed by our own backend, which verifies it via
 * Logto's JWKS. We intentionally don't cryptographically validate the id_token
 * here (it's used only for display claims); harden with a JWKS check or swap in
 * `openid-client` if this graduates past a scaffold.
 */
import { app, safeStorage, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { AuthClaims, AuthState } from '../../shared/ipc'

const REDIRECT_URI = 'neeme://callback'
const SCOPE = 'openid profile offline_access'

type Listener = (state: AuthState, accessToken?: string) => void

interface OidcConfig {
  authorization_endpoint: string
  token_endpoint: string
  end_session_endpoint?: string
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
let session: Session | null = null
let pending: { verifier: string; state: string } | null = null
let listener: Listener | null = null

export function isConfigured(): boolean {
  return Boolean(endpoint && appId)
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeClaims(idToken?: string): AuthClaims | null {
  if (!idToken) return null
  try {
    const json = Buffer.from(
      idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')
    const c = JSON.parse(json) as Record<string, string>
    return { sub: c.sub, email: c.email, name: c.name, picture: c.picture }
  } catch {
    return null
  }
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

async function exchange(body: URLSearchParams): Promise<void> {
  const cfg = await discover()
  if (resource) body.set('resource', resource)
  const res = await fetch(cfg.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) throw new Error(`Logto token request failed (HTTP ${res.status})`)
  const t = (await res.json()) as TokenResponse
  session = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? session?.refreshToken,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    claims: decodeClaims(t.id_token) ?? session?.claims ?? null
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
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))
  pending = { verifier, state }

  const url = new URL(cfg.authorization_endpoint)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'consent')
  if (resource) url.searchParams.set('resource', resource)
  await shell.openExternal(url.toString())
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
    })
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
