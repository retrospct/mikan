/**
 * Runtime sync orchestration (ADR 0008 + ROADMAP #10).
 *
 * The data worker reads getSyncConfig() (NEEME_SYNC*) exactly once at module load,
 * so all runtime sync changes are "set env → restart worker". This module owns:
 *   - prepareSyncEnv(): resolve env from saved prefs + keychain BEFORE the first fork
 *   - setSyncEnabled(): the Settings toggle (persist + re-resolve + restart)
 *   - importRecoveryKey(): adopt another device's key (persist + restart)
 *   - getSyncSettings()/getRecoveryKey(): read-only surface for the renderer
 *
 * Encryption-at-rest is sticky: once a device has a key it's always injected, so
 * previously-encrypted local rows keep decrypting even when the replica is off.
 */
import type { BrokerTokenResponse, SyncSettings } from '@mikan/contract/ipc'
import { IPC } from '@mikan/contract/ipc'
import * as auth from '../auth/logto'
import { call, restartWorker } from '../worker/client'
import { getSyncToken, isBrokerConfigured, refreshSyncToken } from './broker'
import * as prefs from './sync-prefs'

/**
 * Fetch + inject the broker sync URL/token when broker mode is configured and we
 * have a Logto session. Best-effort: on any failure (offline, not logged in) the
 * URL/token are left unset and the caller backs off to local-only for this boot.
 */
async function injectBrokerToken(): Promise<void> {
  if (!isBrokerConfigured()) return
  const logtoToken = await auth.getAccessToken().catch(() => undefined)
  if (!logtoToken) {
    console.log('[sync] no Logto session yet — worker stays local-only until login')
    return
  }
  try {
    const token = await getSyncToken(logtoToken)
    if (token) {
      process.env.NEEME_SYNC_URL = token.syncUrl
      process.env.NEEME_SYNC_AUTH_TOKEN = token.authToken
      console.log(
        '[sync] broker credentials injected (expires',
        new Date(token.expiresAt).toISOString(),
        ')'
      )
      scheduleTokenRefresh(token)
    }
  } catch (err) {
    console.warn('[sync] broker token fetch failed; worker stays local-only:', err)
  }
}

// ── Proactive token refresh ──────────────────────────────────────────────
//
// The broker mints short-lived tokens. Rather than waiting for the worker to
// hit an auth failure, main refreshes ahead of expiry and pushes the new
// token to the worker over RPC (sync:set-auth) so it can swap its replica
// client in place — see reconfigureSyncAuth in db/index.ts. No re-fork, no
// interrupted in-flight work, no renderer invalidation needed for this path.

const REFRESH_EARLY_MS = 120_000 // refresh ~2 min before expiry (> broker's 60s buffer)
const REFRESH_MIN_DELAY_MS = 30_000
const REFRESH_RETRY_MS = 60_000

let refreshTimer: NodeJS.Timeout | null = null

/** Pure — exported for tests. Clamped to a floor so an already-near-expiry
 *  token still gets a short, non-zero delay instead of firing immediately. */
export function computeRefreshDelay(expiresAt: number, now: number): number {
  return Math.max(REFRESH_MIN_DELAY_MS, expiresAt - now - REFRESH_EARLY_MS)
}

/** Cancel any pending proactive refresh. Call on logout. */
export function cancelTokenRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

/** Schedule the next proactive refresh ahead of `token`'s expiry. */
export function scheduleTokenRefresh(token: BrokerTokenResponse): void {
  cancelTokenRefresh()
  refreshTimer = setTimeout(
    () => void refreshAndPush(),
    computeRefreshDelay(token.expiresAt, Date.now())
  )
  refreshTimer.unref()
}

/**
 * Refresh the sync token at the broker and push it to the worker. Reschedules
 * itself on both success and a soft failure (flat retry) so a long-running
 * session never silently stops refreshing.
 */
async function refreshAndPush(): Promise<void> {
  try {
    const logtoToken = await auth.getAccessToken()
    if (!logtoToken) {
      // Signed out or offline right now — try again shortly rather than going
      // silent until the next login/boot re-triggers injectBrokerToken.
      refreshTimer = setTimeout(() => void refreshAndPush(), REFRESH_RETRY_MS)
      refreshTimer.unref()
      return
    }
    const token = await refreshSyncToken(logtoToken)
    const applied = await call<boolean>(IPC.syncSetAuth, [token]).catch(() => false)
    if (!applied) {
      console.log('[sync] worker is local-only — refreshed token cached for the next fork')
    }
    scheduleTokenRefresh(token)
  } catch (err) {
    console.warn('[sync] proactive token refresh failed; retrying in 60s:', err)
    refreshTimer = setTimeout(() => void refreshAndPush(), REFRESH_RETRY_MS)
    refreshTimer.unref()
  }
}

/** True once the env has a usable replica target (broker token injected, or a
 *  direct NEEME_SYNC_URL provided via the runbook/spike path). */
function hasReplicaTarget(): boolean {
  return Boolean(process.env.NEEME_SYNC_URL)
}

/** True when the *current worker fork* has a live replica target — as opposed
 *  to the persisted toggle intent (see SyncSettings.enabled vs SyncStatus). */
function replicaActive(): boolean {
  return process.env.NEEME_SYNC === 'on' && hasReplicaTarget()
}

/**
 * Called by main when a user logs in after boot (auth.onChange). A worker that
 * forked before login had no Logto session to fetch a broker token with, so it
 * stayed local-only even with the sync pref on (APP-GAPS.md §3). Re-resolve
 * the env now that a session exists, and restart the worker if that actually
 * produced a replica target. No-op when a replica is already active (nothing
 * to do) or the pref is off / broker unconfigured (nothing to enable).
 */
export async function onLoginEnableSync(): Promise<void> {
  if (replicaActive()) return
  const wantSync = process.env.NEEME_SYNC === 'on' || (await prefs.isSyncEnabled())
  if (!wantSync || !isBrokerConfigured()) return
  await prepareSyncEnv()
  if (replicaActive()) await restartWorker()
}

/**
 * Resolve NEEME_SYNC* env from persisted prefs + keychain before the worker is
 * (re)forked. Honors an explicit NEEME_SYNC=on from the shell (dev/tests/runbook)
 * and never downgrades it.
 */
export async function prepareSyncEnv(): Promise<void> {
  // Sticky key: inject any existing device key regardless of the toggle so
  // at-rest encrypted rows stay readable even with the replica off.
  if (!process.env.NEEME_SYNC_ENCRYPTION_KEY) {
    const key = await prefs.getExistingKey()
    if (key) process.env.NEEME_SYNC_ENCRYPTION_KEY = key
  }

  const wantSync = process.env.NEEME_SYNC === 'on' || (await prefs.isSyncEnabled())
  if (!wantSync) return

  process.env.NEEME_SYNC = 'on'
  if (!process.env.NEEME_SYNC_ENCRYPTION_KEY) {
    process.env.NEEME_SYNC_ENCRYPTION_KEY = await prefs.getOrCreateKey()
  }
  await injectBrokerToken()

  // Broker mode but no token this boot (offline / not yet logged in): back off to
  // local-only for this session instead of surfacing a "missing URL" sync error.
  // The pref stays on; the next online boot or toggle injects the token.
  if (isBrokerConfigured() && !hasReplicaTarget()) {
    delete process.env.NEEME_SYNC
  }
}

/**
 * Settings toggle: turn the cloud replica on or off, persist the intent, and
 * restart the worker so getSyncConfig() is re-read.
 */
export async function setSyncEnabled(enabled: boolean): Promise<SyncSettings> {
  await prefs.setSyncEnabledPref(enabled)

  if (enabled) {
    process.env.NEEME_SYNC = 'on'
    if (!process.env.NEEME_SYNC_ENCRYPTION_KEY) {
      process.env.NEEME_SYNC_ENCRYPTION_KEY = await prefs.getOrCreateKey()
    }
    await injectBrokerToken()
    if (isBrokerConfigured() && !hasReplicaTarget()) delete process.env.NEEME_SYNC
  } else {
    // Stop the network replica but keep the encryption key in env so existing
    // at-rest encrypted rows stay readable locally.
    delete process.env.NEEME_SYNC
    delete process.env.NEEME_SYNC_URL
    delete process.env.NEEME_SYNC_AUTH_TOKEN
  }

  await restartWorker()
  return getSyncSettings()
}

/** Import a recovery key from another device, then restart so it takes effect. */
export async function importRecoveryKey(hex: string): Promise<SyncSettings> {
  await prefs.setRecoveryKey(hex)
  process.env.NEEME_SYNC_ENCRYPTION_KEY = hex.trim().toLowerCase()
  await restartWorker()
  return getSyncSettings()
}

/** The 64-hex device key (live env wins, then keychain), or null if none. */
export async function getRecoveryKey(): Promise<string | null> {
  return process.env.NEEME_SYNC_ENCRYPTION_KEY ?? (await prefs.getExistingKey())
}

/** Read-only settings surface for the renderer (toggle intent + key + availability). */
export async function getSyncSettings(): Promise<SyncSettings> {
  const [enabled, key] = await Promise.all([prefs.isSyncEnabled(), getRecoveryKey()])
  return {
    enabled: enabled || process.env.NEEME_SYNC === 'on',
    hasKey: key != null,
    available: isBrokerConfigured()
  }
}
