// Spike: validates that @tursodatabase/sync-react-native works on iOS with
// embedded-replica offline sync. Run via expo dev client (not Expo Go —
// native modules require a custom build).
//
// How to test:
//   1. Copy .env.example → .env.local, fill EXPO_PUBLIC_BROKER_URL
//   2. npx expo run:ios   (NOT expo start — needs dev client)
//   3. Open the DB Spike tab, write a record, go offline, come back online
//   4. Verify the record appears on the desktop (same Turso DB)

import { open } from '@tursodatabase/sync-react-native'
import { CREATE_TABLES } from './schema.js'

export type DbClient = Awaited<ReturnType<typeof openDb>>

let _db: DbClient | null = null

export async function openDb(opts: {
  syncUrl: string
  authToken: string
  encryptionKey?: string
}) {
  const db = await open({
    dbPath: 'nimi.db',
    syncUrl: opts.syncUrl,
    authToken: opts.authToken,
    encryptionKey: opts.encryptionKey,
  })

  // Create tables on first open (idempotent)
  await db.executeMultiple(CREATE_TABLES)

  // Pull latest from Turso before returning
  await db.sync()

  _db = db
  return db
}

export function getDb(): DbClient {
  if (!_db) throw new Error('DB not open — call openDb() first in the root layout')
  return _db
}

export async function closeDb() {
  if (_db) {
    await _db.close()
    _db = null
  }
}
