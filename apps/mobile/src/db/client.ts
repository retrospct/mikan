// Spike: validates that @tursodatabase/sync-react-native works on iOS with
// embedded-replica offline sync. Run via expo dev client (not Expo Go —
// native modules require a custom build).
//
// How to test:
//   1. Copy .env.example → .env.local, fill EXPO_PUBLIC_BROKER_URL
//   2. npx expo run:ios   (NOT expo start — needs dev client)
//   3. Open the DB Spike tab, write a record, go offline, come back online
//   4. Verify the record appears on the desktop (same Turso DB)

import { connect } from '@tursodatabase/sync-react-native'
import { CREATE_TABLES } from './schema'

export type DbClient = Awaited<ReturnType<typeof openDb>>

let _db: DbClient | null = null

// The shared AES-256-GCM key received from the desktop's recovery-key flow.
// Stored in key-store and loaded at bootstrap time. Screens read it via
// getCurrentKey() to encrypt writes and decrypt reads.
let _syncKey: string | null = null

export function getCurrentKey(): string | null {
  return _syncKey
}

export function setCurrentKey(hexKey: string | null): void {
  _syncKey = hexKey
}

export async function openDb(opts: {
  syncUrl: string
  authToken: string
}) {
  const db = await connect({
    path: 'mikan.db',
    url: opts.syncUrl,
    authToken: opts.authToken,
    // remoteEncryption is intentionally absent: the shared content key encrypts
    // individual fields (enc:<iv>:<tag>:<ct>) at the application layer — the same
    // approach as the desktop (apps/desktop/src/main/db/crypto.ts). Turso-level
    // at-rest encryption would use a different, per-device key and break
    // cross-device interop.
  })

  // Create tables on first open (idempotent). The RN binding's exec() runs a
  // SINGLE statement, so split the multi-statement schema and run each.
  for (const statement of CREATE_TABLES.split(';')) {
    const sql = statement.trim()
    if (sql) await db.exec(sql)
  }

  // Pull latest from Turso before returning.
  await db.pull()

  _db = db
  return db
}

export function getDb(): DbClient {
  if (!_db) throw new Error('DB not open — call openDb() first in the root layout')
  return _db
}

export function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}
