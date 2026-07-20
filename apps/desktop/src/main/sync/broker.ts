/**
 * Desktop-side token broker client (ADR 0008).
 *
 * Main fetches a short-lived, DB-scoped Turso sync token from the broker service
 * on behalf of the authenticated user. The token is:
 *   - cached in Electron `safeStorage` (OS keychain on macOS/Windows), same
 *     approach as the Logto refresh token in auth/logto.ts
 *   - refreshed proactively ~60 s before it expires
 *   - never handed to the renderer (only main + worker touch it)
 *
 * When no broker URL is configured, all functions are no-ops, preserving the
 * existing static NEEME_SYNC_AUTH_TOKEN spike path.
 *
 * Config (two layers, runtime wins):
 *   - process.env.NEEME_SYNC_BROKER_URL — runtime override for dev / tests /
 *     cloud agents that export the var into the shell.
 *   - import.meta.env.MAIN_VITE_NEEME_SYNC_BROKER_URL — build-time value inlined
 *     by electron-vite, so packaged releases (no shell env) still find the broker.
 *   e.g. https://sync.getmikan.com
 */
import type { BrokerTokenResponse } from '@mikan/contract/ipc'
import * as secrets from '../secrets/store'

const REFRESH_BUFFER_MS = 60_000 // refresh when < 60 s from expiry

let cached: BrokerTokenResponse | null = null

function brokerUrl(): string | undefined {
  // Runtime override (dev/tests/cloud agents) takes priority over the build-time
  // value inlined into packaged releases.
  const url = process.env.NEEME_SYNC_BROKER_URL || import.meta.env.MAIN_VITE_NEEME_SYNC_BROKER_URL
  return url?.replace(/\/+$/, '')
}

/** True when broker mode is configured (NEEME_SYNC_BROKER_URL is set). */
export function isBrokerConfigured(): boolean {
  return Boolean(brokerUrl())
}

/** True when the cached token is still valid (has > REFRESH_BUFFER_MS remaining). */
function isTokenFresh(token: BrokerTokenResponse): boolean {
  return token.expiresAt - Date.now() > REFRESH_BUFFER_MS
}

/** Persist the token to the secrets vault (OS keychain via safeStorage). */
async function persist(token: BrokerTokenResponse): Promise<void> {
  await secrets.set('broker', token)
}

/** Remove the cached token from the vault. */
async function clearPersisted(): Promise<void> {
  await secrets.set('broker', undefined)
  cached = null
}

/** Restore a persisted token from the vault (called at startup; no Keychain touch). */
export async function restoreCachedToken(): Promise<void> {
  if (!isBrokerConfigured()) return
  const token = secrets.get('broker')
  // Expired tokens are ignored; a fresh fetch will happen at first use.
  if (token && isTokenFresh(token)) {
    cached = token
  }
}

/**
 * Fetch a fresh token from the broker using the caller's Logto access token.
 * Throws on HTTP errors or network failures.
 */
async function fetchFromBroker(logtoAccessToken: string): Promise<BrokerTokenResponse> {
  const url = brokerUrl()
  if (!url) throw new Error('NEEME_SYNC_BROKER_URL is not set')

  const res = await fetch(`${url}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${logtoAccessToken}` }
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Broker returned HTTP ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<BrokerTokenResponse>
}

/**
 * Get a valid sync token, using the cache when possible.
 *
 * @param logtoAccessToken — fresh Logto access token from auth.getAccessToken()
 * @returns the broker token, or null if the broker is not configured
 *
 * Errors from the broker are logged and rethrown; callers should catch and
 * fall back to the static NEEME_SYNC_AUTH_TOKEN path if present.
 */
export async function getSyncToken(logtoAccessToken: string): Promise<BrokerTokenResponse | null> {
  if (!isBrokerConfigured()) return null

  if (cached && isTokenFresh(cached)) {
    return cached
  }

  const token = await fetchFromBroker(logtoAccessToken)
  cached = token
  await persist(token).catch((err) =>
    console.warn('[broker-client] failed to persist sync token:', err)
  )
  return token
}

/**
 * Clear the in-memory and on-disk cached token.
 * Call on logout so the next login gets a fresh token.
 */
export async function clearSyncToken(): Promise<void> {
  cached = null
  await clearPersisted()
}

/**
 * Force-fetch a fresh token from the broker, bypassing the freshness check.
 * Used by the proactive refresh scheduler (sync-control.ts), which calls this
 * deliberately ahead of expiry — waiting for `isTokenFresh()` to go stale
 * would defeat the point of refreshing early.
 */
export async function refreshSyncToken(logtoAccessToken: string): Promise<BrokerTokenResponse> {
  const token = await fetchFromBroker(logtoAccessToken)
  cached = token
  await persist(token).catch((err) =>
    console.warn('[broker-client] failed to persist sync token:', err)
  )
  return token
}

/** The currently cached token (may be stale), or null if none. */
export function getCachedToken(): BrokerTokenResponse | null {
  return cached
}
