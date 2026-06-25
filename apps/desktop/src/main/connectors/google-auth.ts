/**
 * Standalone Google OAuth client for the nimi connectors (Gmail + Google Calendar).
 *
 * Architecture:
 *   - Decoupled from Logto (ADR 0002): Logto authenticates *who the user is* to nimi;
 *     this module grants nimi *read access to the user's Google data* — separate concern,
 *     separate client, separate tokens.
 *   - Inert until `MAIN_VITE_GOOGLE_CLIENT_ID` is set.
 *   - Redirect: Google Desktop-app OAuth clients reject custom schemes, so we use a
 *     **loopback redirect** (`http://127.0.0.1:<port>`). An ephemeral `http.createServer`
 *     runs only during the flow (listening for the `?code` callback), then closes.
 *   - Tokens: refresh token sealed in OS keychain via `safeStorage`, held in the shared
 *     secrets vault (`../secrets/store`). Access tokens (short-lived) stay in memory only.
 *   - PKCE helpers reused from `../auth/oidc.ts` (provider-agnostic; see PR #35 notes).
 *
 * Env knobs (MAIN_VITE_* are baked by electron-vite; NEEME_* are runtime process.env):
 *   MAIN_VITE_GOOGLE_CLIENT_ID      — required; Desktop OAuth client id
 *   MAIN_VITE_GOOGLE_CLIENT_SECRET  — required; Desktop OAuth client secret (non-confidential)
 *   MAIN_VITE_GOOGLE_SCOPES         — optional scope override (default: gmail.readonly + calendar.readonly)
 *
 * Note on `access_type=offline`: required to receive a refresh_token on first consent.
 * Combined with `prompt=consent`, this reliably re-issues the refresh token even for
 * previously-authorized clients, which matters for developer iteration.
 */
import { shell } from 'electron'
import { createServer } from 'node:http'
import * as secrets from '../secrets/store'
import { randomVerifier, pkceChallenge, randomState } from '../auth/oidc'
import type { ConnectorId, ConnectorsState, ProviderState } from '@nimi/contract/ipc'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DEFAULT_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
].join(' ')

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

interface ProviderSession {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

// In-memory sessions — only access tokens; refresh tokens persist via safeStorage.
const sessions = new Map<ConnectorId, ProviderSession>()

// Pending PKCE flow state (one at a time per provider).
let pending: { provider: ConnectorId; verifier: string; state: string; port: number } | null = null

export function isConfigured(): boolean {
  return Boolean(
    import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID && import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET
  )
}

function clientId(): string {
  return import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? ''
}
function clientSecret(): string {
  return import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
}
function scopes(): string {
  return import.meta.env.MAIN_VITE_GOOGLE_SCOPES ?? DEFAULT_SCOPES
}

// ── Persistence (refresh tokens only) ──────────────────────────────────────

interface PersistedData {
  gmail?: { refreshToken: string }
  gcal?: { refreshToken: string }
}

async function loadPersisted(): Promise<PersistedData> {
  // From the in-memory vault (loaded once at startup — no Keychain touch here).
  return secrets.get('connectors') ?? {}
}

async function savePersisted(): Promise<void> {
  const data: PersistedData = {}
  const gmailSession = sessions.get('gmail')
  const gcalSession = sessions.get('gcal')
  if (gmailSession) data.gmail = { refreshToken: gmailSession.refreshToken }
  if (gcalSession) data.gcal = { refreshToken: gcalSession.refreshToken }
  await secrets.set('connectors', data.gmail || data.gcal ? data : undefined)
}

// ── Token exchange + refresh ────────────────────────────────────────────────

async function exchangeCode(
  code: string,
  redirectUri: string,
  verifier: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) throw new Error(`Google token exchange failed (HTTP ${res.status})`)
  return res.json() as Promise<TokenResponse>
}

async function refreshAccessToken(provider: ConnectorId, refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token'
  })
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!res.ok) throw new Error(`Google token refresh failed (HTTP ${res.status})`)
  const t = (await res.json()) as TokenResponse
  const session = sessions.get(provider)
  if (session) {
    session.accessToken = t.access_token
    session.expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000
    if (t.refresh_token) session.refreshToken = t.refresh_token
    await savePersisted()
  }
  return t.access_token
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Restore persisted sessions on startup (silent refresh).
 * Called once from main/index.ts after `startWorker()`.
 */
export async function init(): Promise<void> {
  if (!isConfigured()) return
  const data = await loadPersisted()
  const providers: ConnectorId[] = ['gmail', 'gcal']
  for (const provider of providers) {
    const saved = data[provider]
    if (!saved?.refreshToken) continue
    try {
      const accessToken = await refreshAccessToken(provider, saved.refreshToken)
      sessions.set(provider, {
        accessToken,
        refreshToken: saved.refreshToken,
        expiresAt: Date.now() + 3600 * 1000
      })
      console.log(`[connectors] restored ${provider} session`)
    } catch (err) {
      console.warn(`[connectors] ${provider} refresh failed on startup — disconnected`, err)
    }
  }
}

/**
 * Return a valid access token for the given provider, refreshing if near expiry.
 * Returns undefined if not connected.
 */
export async function getAccessToken(provider: ConnectorId): Promise<string | undefined> {
  const session = sessions.get(provider)
  if (!session) return undefined
  if (Date.now() < session.expiresAt - 60_000) return session.accessToken
  try {
    return await refreshAccessToken(provider, session.refreshToken)
  } catch {
    sessions.delete(provider)
    await savePersisted()
    return undefined
  }
}

/**
 * Start the OAuth PKCE flow for a provider: open the system browser to Google's
 * authorize URL, then listen on a random loopback port for the `?code` callback.
 * Resolves once tokens are stored (or rejects on error/timeout).
 */
export async function connect(provider: ConnectorId): Promise<void> {
  if (!isConfigured())
    throw new Error(
      'Google OAuth is not configured (set MAIN_VITE_GOOGLE_CLIENT_ID + _SECRET in .env)'
    )

  return new Promise<void>((resolve, reject) => {
    // Spin up an ephemeral loopback server on a random OS-assigned port.
    const server = createServer((req, res) => {
      if (!req.url?.startsWith('/?')) {
        res.writeHead(400)
        res.end('Bad request')
        return
      }
      const params = new URL(req.url, 'http://127.0.0.1').searchParams
      const code = params.get('code')
      const stateParam = params.get('state')
      const error = params.get('error')

      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(
        '<html><head><meta charset="utf-8"></head><body><h2>Connected to nimi &#8212; you can close this tab.</h2></body></html>'
      )
      server.close()

      if (!pending || stateParam !== pending.state || pending.provider !== provider) {
        reject(new Error('OAuth callback: state mismatch or no pending flow'))
        return
      }
      if (error) {
        reject(new Error(`Google OAuth error: ${error}`))
        return
      }
      if (!code) {
        reject(new Error('Google OAuth callback: missing code'))
        return
      }

      const { verifier, port } = pending
      pending = null
      const redirectUri = `http://127.0.0.1:${port}`

      exchangeCode(code, redirectUri, verifier)
        .then((t) => {
          if (!t.refresh_token) {
            throw new Error(
              'Google did not return a refresh_token — ensure access_type=offline and prompt=consent'
            )
          }
          sessions.set(provider, {
            accessToken: t.access_token,
            refreshToken: t.refresh_token,
            expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000
          })
          return savePersisted()
        })
        .then(resolve)
        .catch(reject)
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        server.close()
        reject(new Error('Failed to bind loopback server'))
        return
      }
      const port = addr.port
      const verifier = randomVerifier()
      const challenge = pkceChallenge(verifier)
      const state = randomState()
      const redirectUri = `http://127.0.0.1:${port}`

      pending = { provider, verifier, state, port }

      const url = new URL(GOOGLE_AUTH_URL)
      url.searchParams.set('client_id', clientId())
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', scopes())
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('state', state)
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')

      shell.openExternal(url.toString()).catch(reject)
    })

    // Timeout after 5 minutes if the user doesn't complete the flow.
    setTimeout(
      () => {
        if (pending?.provider === provider) {
          pending = null
          server.close()
          reject(new Error('Google OAuth flow timed out (5 min)'))
        }
      },
      5 * 60 * 1000
    )
  })
}

/** Revoke the session and clear persisted tokens for a provider. */
export async function disconnect(provider: ConnectorId): Promise<void> {
  sessions.delete(provider)
  await savePersisted()
}

/** Snapshot of connector state for all providers. */
export function getState(): Pick<ConnectorsState, 'configured' | 'gmail' | 'gcal'> {
  const providerState = (id: ConnectorId): ProviderState => ({
    connected: sessions.has(id),
    lastSyncAt: null, // filled in by main/index.ts from worker DB state
    itemCount: 0
  })
  return {
    configured: isConfigured(),
    gmail: providerState('gmail'),
    gcal: providerState('gcal')
  }
}
