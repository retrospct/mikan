import { openDb, setCurrentKey, getDb } from './client'
import { getSyncKey, saveSyncCredentials, getSyncCredentials } from './key-store'

const BROKER_URL = process.env.EXPO_PUBLIC_BROKER_URL ?? 'https://token-broker.vercel.app'

/**
 * Exchange a Logto access token with the token broker for per-user Turso
 * credentials, then open the local embedded replica (ADR 0008 + 0009).
 *
 * Also loads the shared content-encryption key from SecureStore and injects it
 * into the DB module state so encrypt/decrypt calls work without needing the
 * key as a function argument in every screen.
 *
 * Shared by app startup (_layout, when a token is already persisted) and the
 * post-login flow (login screen, right after a fresh sign-in) so the DB is
 * ready immediately — no app restart needed.
 *
 * On success the Turso credentials are cached in SecureStore so reopenDbIfNeeded
 * can restore the connection after a hot reload or app re-foreground without a
 * broker round-trip.
 */
export async function bootstrapDb(accessToken: string): Promise<void> {
  const res = await fetch(`${BROKER_URL}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Broker ${res.status}`)
  const { syncUrl, authToken } = (await res.json()) as {
    syncUrl: string
    authToken: string
    expiresAt: number
  }
  // Cache credentials before opening so a crash during openDb can still be
  // retried with reopenDbIfNeeded.
  await saveSyncCredentials(syncUrl, authToken)
  // Load the content-encryption key (may be null if not yet set by the user).
  const key = await getSyncKey()
  setCurrentKey(key)

  await openDb({ syncUrl, authToken })
}

/**
 * Reopen the DB using cached Turso credentials if it is currently closed.
 *
 * Call this from screens on focus to recover from a hot reload (which resets
 * JS module state) or an app re-foreground without needing a broker round-trip.
 * Also re-hydrates the encryption key from SecureStore.
 *
 * Returns true if the DB is (or was already) open, false if no credentials are
 * cached (user needs to log in).
 */
export async function reopenDbIfNeeded(): Promise<boolean> {
  try {
    getDb() // already open — nothing to do
    return true
  } catch {
    // DB not open — try to restore from cached credentials.
  }
  const creds = await getSyncCredentials()
  if (!creds) return false
  const key = await getSyncKey()
  setCurrentKey(key)
  await openDb(creds)
  return true
}
