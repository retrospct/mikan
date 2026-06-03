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
import type { SyncSettings } from '@nimi/contract/ipc'
import * as auth from '../auth/logto'
import { restartWorker } from '../worker/client'
import { getSyncToken, isBrokerConfigured } from './broker'
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
      console.log('[sync] broker credentials injected (expires', new Date(token.expiresAt).toISOString(), ')')
    }
  } catch (err) {
    console.warn('[sync] broker token fetch failed; worker stays local-only:', err)
  }
}

/** True once the env has a usable replica target (broker token injected, or a
 *  direct NEEME_SYNC_URL provided via the runbook/spike path). */
function hasReplicaTarget(): boolean {
  return Boolean(process.env.NEEME_SYNC_URL)
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
