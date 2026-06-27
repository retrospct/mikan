/**
 * Secure storage for the shared AES-256-GCM content encryption key.
 *
 * The key is the desktop's NEEME_SYNC_ENCRYPTION_KEY (64 hex chars, 32 bytes).
 * Users obtain it from the desktop's "Reveal recovery key" UI and paste it
 * into the mobile Settings tab. Storage: expo-secure-store (OS keychain,
 * mirrors the desktop's safeStorage approach in sync-prefs.ts).
 *
 * A null return means no key has been set on this device; write/read operations
 * degrade to plaintext (safe — the desktop passes non-enc: rows through).
 *
 * Also manages the cached Turso credentials (syncUrl + authToken) so the DB
 * can be reopened after a hot reload or app re-foreground without a broker round-trip.
 */
import * as SecureStore from 'expo-secure-store'

const STORE_KEY = 'mikan_sync_encryption_key'
const SYNC_URL_KEY = 'mikan_sync_url'
const SYNC_AUTH_KEY = 'mikan_sync_auth_token'
const KEY_HEX_RE = /^[0-9a-f]{64}$/i

/** Retrieve the stored key (normalized lowercase), or null if not set. */
export async function getSyncKey(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(STORE_KEY)
  if (!raw) return null
  const hex = raw.trim().toLowerCase()
  return KEY_HEX_RE.test(hex) ? hex : null
}

/**
 * Persist a new recovery key. Validates and normalizes to lowercase hex.
 * Throws if the value is not a valid 64-hex string.
 */
export async function setSyncKey(hex: string): Promise<void> {
  const norm = hex.trim().toLowerCase()
  if (!KEY_HEX_RE.test(norm)) {
    throw new Error('Recovery key must be exactly 64 hexadecimal characters (32 bytes).')
  }
  await SecureStore.setItemAsync(STORE_KEY, norm)
}

/** Remove the stored key. Subsequent encrypt/decrypt calls degrade to plaintext. */
export async function clearSyncKey(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY)
}

/** Cache Turso credentials so the DB can be reopened without a broker round-trip. */
export async function saveSyncCredentials(syncUrl: string, authToken: string): Promise<void> {
  await SecureStore.setItemAsync(SYNC_URL_KEY, syncUrl)
  await SecureStore.setItemAsync(SYNC_AUTH_KEY, authToken)
}

/** Retrieve cached Turso credentials, or null if not yet stored. */
export async function getSyncCredentials(): Promise<{ syncUrl: string; authToken: string } | null> {
  const syncUrl = await SecureStore.getItemAsync(SYNC_URL_KEY)
  const authToken = await SecureStore.getItemAsync(SYNC_AUTH_KEY)
  if (!syncUrl || !authToken) return null
  return { syncUrl, authToken }
}

/** Clear cached credentials (call on logout). */
export async function clearSyncCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(SYNC_URL_KEY)
  await SecureStore.deleteItemAsync(SYNC_AUTH_KEY)
}
