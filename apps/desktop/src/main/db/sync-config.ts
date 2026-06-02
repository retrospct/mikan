/**
 * Sync configuration seam — reads environment variables and resolves whether the
 * Turso embedded-replica sync path is active. When disabled (the default), the DB
 * layer builds a plain `file:` libSQL client identical to today; no network calls
 * are ever made. See docs/plans/sync-cloud-offload.plan.md.
 *
 * Environment variables:
 *   NEEME_SYNC              "on" to enable (anything else = off)
 *   NEEME_SYNC_URL          libSQL sync URL (e.g. libsql://<db>.turso.io)
 *   NEEME_SYNC_AUTH_TOKEN   DB-scoped auth token (short-lived; main fetches from broker)
 *   NEEME_SYNC_INTERVAL_S   Periodic sync interval in seconds (default 300 = 5 min)
 *   NEEME_SYNC_ENCRYPTION_KEY  64-hex AES-256-GCM key — REQUIRED to enable sync
 *
 * Encryption at rest is mandatory: when sync is requested but no valid encryption
 * key is present, sync is refused (stays local-first) so plaintext content is
 * never written to the cloud primary. See db/crypto.ts and ADR 0001.
 */
import { hasValidEncryptionKey } from './crypto'

export interface SyncConfig {
  /** True only when NEEME_SYNC=on, NEEME_SYNC_URL is present, and a valid key is set. */
  enabled: boolean
  /** libSQL sync URL, e.g. libsql://<db>.turso.io */
  syncUrl?: string
  /** DB-scoped auth token for the remote primary. */
  authToken?: string
  /** Sync interval in milliseconds. Default 300 000 (5 minutes). */
  syncIntervalMs: number
  /** When NEEME_SYNC=on but sync was refused, why (for logs + SyncStatus.error). */
  disabledReason?: 'missing-url' | 'missing-or-invalid-key'
}

const MIN_INTERVAL_S = 10
const DEFAULT_INTERVAL_S = 300

/**
 * Resolve sync configuration from environment variables. Called once at module
 * load (db/index.ts) so the client is built with the right options.
 *
 * When NEEME_SYNC is not "on", returns { enabled: false } — the libSQL client
 * is built as a bare file: client, exactly as before. All tests depend on this.
 */
export function getSyncConfig(): SyncConfig {
  const rawInterval = parseInt(process.env.NEEME_SYNC_INTERVAL_S ?? String(DEFAULT_INTERVAL_S), 10)
  const syncIntervalMs =
    (isNaN(rawInterval) || rawInterval < MIN_INTERVAL_S ? DEFAULT_INTERVAL_S : rawInterval) * 1000

  if (process.env.NEEME_SYNC !== 'on') {
    return { enabled: false, syncIntervalMs }
  }

  const syncUrl = process.env.NEEME_SYNC_URL
  if (!syncUrl) {
    console.warn('[sync] NEEME_SYNC=on but NEEME_SYNC_URL is not set — sync disabled')
    return { enabled: false, syncIntervalMs, disabledReason: 'missing-url' }
  }

  // Encryption at rest is required: never push plaintext content to the cloud.
  // If the key is missing or malformed, fail closed — stay fully local-first.
  if (!hasValidEncryptionKey()) {
    console.error(
      '[sync] refusing to enable sync without a valid NEEME_SYNC_ENCRYPTION_KEY ' +
        '(64 hex chars) — staying local-first so plaintext is never written to the cloud'
    )
    return { enabled: false, syncIntervalMs, disabledReason: 'missing-or-invalid-key' }
  }

  return {
    enabled: true,
    syncUrl,
    authToken: process.env.NEEME_SYNC_AUTH_TOKEN,
    syncIntervalMs
  }
}
