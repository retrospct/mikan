import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'path'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import { userDataDir } from '../runtime/paths'
import { getSyncConfig } from './sync-config'
import { buildReplicaWithRecovery, migrateUserData } from './migrate'

/**
 * Local-first data layer on libSQL (a SQLite fork). For now this is a plain
 * on-device `file:` database in the per-user `userData` dir — protected by the
 * OS account (Tier 1: no app-level lock yet).
 *
 * This module runs in the utilityProcess (a plain Node child, no `electron.app`),
 * so the data dir comes from the env the parent sets — see runtime/paths.
 *
 * libSQL is deliberate: the same driver later turns this local file into a
 * Turso *embedded replica* that syncs to the cloud, without rewriting the data
 * layer. Sync stays opt-in (and will only ever push encrypted data).
 *
 * Opt-in sync: set NEEME_SYNC=on + NEEME_SYNC_URL + NEEME_SYNC_AUTH_TOKEN.
 * When the flag is off (the default, and in every test), this module behaves
 * identically to before — a bare file: client, no network calls whatsoever.
 */
const dbPath = join(userDataDir(), 'neeme.db')

const syncConfig = getSyncConfig()

/** libSQL writes these sidecars next to the db file; move/remove them together. */
const DB_SIDECARS = ['', '-wal', '-shm', '-journal', '-info', '-client_wal_index'] as const

/** Path of a pre-sync (plain) DB moved aside so the replica could bootstrap; its
 *  rows are migrated in after the first successful sync. null when no migration. */
let preSyncBackupPath: string | null = null

function buildReplicaClient(): Client {
  return createClient({
    url: `file:${dbPath}`,
    syncUrl: syncConfig.syncUrl,
    authToken: syncConfig.authToken,
    // Periodic background pull in addition to the worker's explicit syncNow() calls.
    syncInterval: syncConfig.syncIntervalMs / 1000
  })
}

function moveDbAside(from: string, to: string): void {
  for (const ext of DB_SIDECARS) {
    if (existsSync(`${from}${ext}`)) renameSync(`${from}${ext}`, `${to}${ext}`)
  }
}

/**
 * Find a pre-sync backup left by a prior boot whose migration didn't finish
 * (e.g. the network dropped mid-migration). Lets a later boot retry instead of
 * orphaning the offline data. The Date.now() suffix sorts chronologically.
 */
function findOrphanedPreSyncBackup(): string | null {
  let names: string[]
  try {
    names = readdirSync(userDataDir())
  } catch {
    return null
  }
  const backups = names.filter((n) => /^neeme\.db\.pre-sync-\d+$/.test(n)).sort()
  const latest = backups[backups.length - 1]
  return latest ? join(userDataDir(), latest) : null
}

/**
 * Build the libSQL client. Sync off → a bare file: client (unchanged — used by
 * every test). Sync on → an embedded replica. If a plain (sync-off) DB already
 * exists at the path, libSQL refuses to open it as a replica ("invalid local
 * state: db file exists but metadata file does not"); we back it up, bootstrap a
 * fresh replica from the primary, and remember the backup so the worker can
 * migrate its rows in after the first sync (reimportPreSyncBackup).
 */
function buildClient(): Client {
  if (!syncConfig.enabled) return createClient({ url: `file:${dbPath}` })
  const { client: replica, backupPath } = buildReplicaWithRecovery({
    makeReplica: buildReplicaClient,
    dbExists: () => existsSync(dbPath),
    backupAside: (backup) => moveDbAside(dbPath, backup),
    restoreBackup: (backup) => moveDbAside(backup, dbPath),
    dbPath
  })
  if (backupPath) {
    preSyncBackupPath = backupPath
    console.warn(
      `[sync] existing local DB is not an embedded replica — backed it up to ${backupPath} and ` +
        'bootstrapped a fresh replica from the primary; its data migrates in after first sync'
    )
  } else {
    // No fresh backup this boot, but a prior boot may have backed one up and
    // failed to migrate it — adopt it so the worker retries after first sync.
    preSyncBackupPath = findOrphanedPreSyncBackup()
    if (preSyncBackupPath) {
      console.warn(
        `[sync] found pending pre-sync backup ${preSyncBackupPath} — will retry migration`
      )
    }
  }
  return replica
}

// Exported so the pipeline can use libSQL's native vector functions
// (vector32 / vector_distance_cos / libsql_vector_idx) via raw SQL — Drizzle's
// query builder doesn't model the F32_BLOB type.
export const client = buildClient()

export const db = drizzle(client, { schema })

/** Embedding dimension for the chunk vector column (matches the embedder seam). */
export const EMBED_DIM = 384

/**
 * Trigger an immediate sync against the cloud primary (embedded-replica mode only).
 *
 * Safe to call unconditionally — returns immediately when sync is disabled so the
 * worker never needs to branch on NEEME_SYNC. Sync failures should be caught by the
 * caller: they must never crash or block the local-first data path.
 */
export async function syncNow(): Promise<void> {
  if (!syncConfig.enabled) return
  await client.sync()
}

/**
 * Migrate rows from a pre-sync backup DB (see buildClient) into the live replica,
 * re-encrypting content under the active key so the cloud primary holds ciphertext.
 * Call AFTER the first successful sync. No-op when there is no backup. The backup
 * is deleted only on success and kept on failure, so offline data is never lost.
 */
export async function reimportPreSyncBackup(): Promise<number> {
  if (!preSyncBackupPath) return 0
  const backup = preSyncBackupPath
  const src = createClient({ url: `file:${backup}` })
  try {
    const n = await migrateUserData(src, client)
    src.close()
    for (const ext of DB_SIDECARS) {
      if (existsSync(`${backup}${ext}`)) rmSync(`${backup}${ext}`)
    }
    preSyncBackupPath = null
    return n
  } catch (err) {
    src.close()
    throw err // keep preSyncBackupPath + backup files so a later boot can retry
  }
}

/**
 * Bootstrap the schema. For the first slice we create tables directly; once the
 * schema stabilizes we switch to drizzle-kit generated migrations applied here.
 */
export async function initDb(): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      source_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      stored_path TEXT,
      text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS chunks (
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      chunk_idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding F32_BLOB(${EMBED_DIM}),
      PRIMARY KEY (item_id, chunk_idx)
    );
    CREATE INDEX IF NOT EXISTS chunks_vec_idx ON chunks (libsql_vector_idx(embedding));
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      day TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS todos_day_idx ON todos (day, position);
    CREATE TABLE IF NOT EXISTS todo_context (
      todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      score REAL,
      source_name TEXT,
      content_type TEXT,
      excerpt TEXT,
      state TEXT NOT NULL DEFAULT 'surfaced',
      first_surfaced_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_surfaced_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (todo_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS todo_context_idx ON todo_context (todo_id, state);
    CREATE TABLE IF NOT EXISTS todo_ai (
      todo_id TEXT PRIMARY KEY REFERENCES todos(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'gathered',
      brief TEXT,
      draft TEXT,
      draft_note TEXT,
      note TEXT,
      note_kind TEXT,
      conf REAL,
      meta TEXT,
      inputs_hash TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // connector_state: tracks per-provider sync cursors (Gmail historyId / Calendar syncToken).
  await client.execute(`
    CREATE TABLE IF NOT EXISTS connector_state (
      provider TEXT PRIMARY KEY,
      cursor TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      last_sync_at INTEGER
    )
  `)

  // Additive migrations: add columns that may not exist on older DBs.
  // Each is guarded so it's a no-op if the column already exists.
  await addColumnIfMissing('todo_context', 'why', 'TEXT')
  // Connector provenance on items (additive, null for manual captures).
  await addColumnIfMissing('items', 'connector', 'TEXT')
  await addColumnIfMissing('items', 'external_id', 'TEXT')
  await addColumnIfMissing('items', 'uri', 'TEXT')
  // Unique index on external_id — SQLite allows multiple NULLs in a unique index
  // so existing manual items are unaffected.
  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS items_external_id_idx ON items (external_id) WHERE external_id IS NOT NULL`
  )
}

/** Add a column to an existing table only if it doesn't already exist. */
async function addColumnIfMissing(table: string, column: string, type: string): Promise<void> {
  const info = await client.execute(`PRAGMA table_info(${table})`)
  const exists = info.rows.some((r) => r['name'] === column)
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}
