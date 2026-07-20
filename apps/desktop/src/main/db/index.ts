import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'path'
import { userDataDir } from '../runtime/paths'
import { buildReplicaWithRecovery, migrateUserData } from './migrate'
import * as schema from './schema'
import { getSyncConfig } from './sync-config'

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
// query builder doesn't model the F32_BLOB type. `let`, not `const`: every
// caller dereferences these at call time, so reconfigureSyncAuth (below) can
// swap them for a refreshed-token replica client without re-forking the worker.
export let client = buildClient()

export let db = drizzle(client, { schema })

/**
 * Swap the replica client to a freshly-refreshed Turso token, in place — no
 * worker re-fork. Pushed from main when the broker proactively refreshes the
 * sync token ahead of expiry (see src/main/sync/sync-control.ts).
 *
 * Returns false when this worker forked without an active replica (sync
 * disabled, or no broker credentials were available at boot): a token push
 * can't turn sync on for a bare `file:` client — only prepareSyncEnv() +
 * restartWorker() can. The local db file already has valid replica metadata
 * at this point (buildClient() succeeded at boot), so this is a plain
 * reconnect, not the first-boot backup/recovery dance in buildClient().
 */
export async function reconfigureSyncAuth(syncUrl: string, authToken: string): Promise<boolean> {
  if (!syncConfig.enabled) return false
  const old = client
  client = createClient({
    url: `file:${dbPath}`,
    syncUrl,
    authToken,
    syncInterval: syncConfig.syncIntervalMs / 1000
  })
  db = drizzle(client, { schema })
  try {
    old.close()
  } catch {
    // best-effort — a call in flight on the old handle may already be closing it
  }
  return true
}

/**
 * Local-only SQLite client for the vector index (chunks table).
 *
 * Kept in a separate file (neeme-vec.db) and never given a syncUrl so it is
 * completely invisible to the Turso primary and to mobile. This is required
 * because @tursodatabase/sync-react-native's embedded SQLite cannot parse the
 * `libsql_vector_idx(embedding)` syntax used by the desktop's vector index —
 * if chunks were in the synced DB, every mobile db.pull() would crash.
 *
 * The vector index is a rebuildable, local-only artifact derived from items.text;
 * it has no value on another device (mobile has no embedder) and can be
 * regenerated from scratch by reindexAll() at any time.
 */
const vecPath = join(userDataDir(), 'neeme-vec.db')
export const vecClient = createClient({ url: `file:${vecPath}` })

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
    CREATE TABLE IF NOT EXISTS todo_run (
      todo_id TEXT PRIMARY KEY REFERENCES todos(id) ON DELETE CASCADE,
      state TEXT NOT NULL DEFAULT 'listed',
      ran_on_device INTEGER NOT NULL DEFAULT 1,
      duration_ms INTEGER,
      touched TEXT,
      sent_anything INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER,
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

  // Additive migrations: add columns that may not exist on older DBs — or that the
  // mobile bootstrap created the shared Turso primary's tables without. Each is
  // guarded by PRAGMA table_info, so it's a no-op when the column already exists;
  // when it's missing, the ALTER is proxied to the primary by the embedded replica.
  await addColumnIfMissing('todo_context', 'why', 'TEXT')
  // Connector provenance on items (additive, null for manual captures).
  await addColumnIfMissing('items', 'connector', 'TEXT')
  await addColumnIfMissing('items', 'external_id', 'TEXT')
  await addColumnIfMissing('items', 'uri', 'TEXT')
  // stored_path + position: the mobile bootstrap schema omits these (mobile only
  // captures text), so when mobile creates items/todos on the shared Turso primary
  // first, desktop's CREATE TABLE IF NOT EXISTS is a no-op and the columns are
  // missing. Backfill them before any query references them.
  await addColumnIfMissing('items', 'stored_path', 'TEXT')
  await addColumnIfMissing('todos', 'position', 'INTEGER NOT NULL DEFAULT 0')
  // mode: the Group 03 auto switch — additive, defaults existing rows to 'plan'.
  await addColumnIfMissing('todos', 'mode', "TEXT NOT NULL DEFAULT 'plan'")
  // todos_day_idx references position, so it's created HERE (after the backfill
  // guarantees the column exists) rather than in the executeMultiple block above —
  // otherwise the primary rejects it with "no such column: position" when mobile
  // bootstrapped todos without that column.
  await client.execute(`CREATE INDEX IF NOT EXISTS todos_day_idx ON todos (day, position)`)
  // Unique index on external_id — SQLite allows multiple NULLs in a unique index
  // so existing manual items are unaffected.
  await client.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS items_external_id_idx ON items (external_id) WHERE external_id IS NOT NULL`
  )

  // Evict chunks from the synced primary. Chunks are a local-only vector artifact
  // that must never be on the primary: @tursodatabase/sync-react-native's SQLite
  // cannot parse `libsql_vector_idx(embedding)`, so any mobile db.pull() that sees
  // this schema crashes with "invalid expression in CREATE INDEX". Drop them here
  // (goes to the Turso primary via the embedded replica client) so future pulls are
  // clean. The vector data lives in neeme-vec.db via vecClient instead.
  await client.execute(`DROP INDEX IF EXISTS chunks_vec_idx`).catch(() => {})
  await client.execute(`DROP TABLE IF EXISTS chunks`).catch(() => {})

  // The chunks table uses libSQL's F32_BLOB type and a vector index — both are
  // local-only, rebuildable artifacts. They are NOT part of the synced schema:
  //   - Turso remote primaries reject libsql_vector_idx on a non-F32_BLOB column
  //     (the mobile bootstrap may have created chunks with plain BLOB type).
  //   - We intentionally keep vector data off the cloud primary (local performance
  //     artifact, never needed on another device).
  // Execute separately so a failure here never blocks the core schema or sync init.
  await createChunksLocal()
}

/**
 * Create the chunks table and its vector index in the local-only neeme-vec.db.
 *
 * Uses vecClient (no syncUrl) so the schema never reaches the Turso primary or
 * mobile. Non-fatal: a failure here degrades semantic search to full-scan but
 * never blocks sync or the rest of startup.
 */
async function createChunksLocal(): Promise<void> {
  try {
    await vecClient.execute(`
      CREATE TABLE IF NOT EXISTS chunks (
        item_id TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding F32_BLOB(${EMBED_DIM}),
        PRIMARY KEY (item_id, chunk_idx)
      )
    `)
    await vecClient.execute(
      `CREATE INDEX IF NOT EXISTS chunks_vec_idx ON chunks (libsql_vector_idx(embedding))`
    )
  } catch (err) {
    console.warn('[db] chunks vector schema unavailable (degraded search):', err)
  }
}

/**
 * Drop and recreate the chunks table + vector index in neeme-vec.db.
 *
 * A plain DELETE FROM chunks leaves the libsql_vector_idx shadow tables in an
 * inconsistent state, causing subsequent INSERTs to fail. Drop+recreate is the
 * safe reset for tests and any other caller that needs a clean slate.
 */
export async function resetVecChunks(): Promise<void> {
  await vecClient.execute('DROP INDEX IF EXISTS chunks_vec_idx').catch(() => {})
  await vecClient.execute('DROP TABLE IF EXISTS chunks').catch(() => {})
  await createChunksLocal()
}

/**
 * Add a column to an existing table only if it doesn't already exist.
 *
 * SQLite can't parameterize identifiers, so table/column/type are interpolated.
 * Every caller passes hardcoded literals today; the asserts make that a guarantee
 * rather than a convention, so this can never become an injection sink if a future
 * caller wires in dynamic input.
 */
const SQL_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
// Allows a quoted string DEFAULT literal (e.g. "TEXT NOT NULL DEFAULT 'plan'") in addition to the
// bare-word/paren types used elsewhere. Safe because every caller passes a hardcoded literal.
const SQL_COL_TYPE = /^[A-Za-z0-9_ ()']+$/
async function addColumnIfMissing(table: string, column: string, type: string): Promise<void> {
  if (!SQL_IDENT.test(table) || !SQL_IDENT.test(column) || !SQL_COL_TYPE.test(type)) {
    throw new Error(`addColumnIfMissing: unsafe identifier (${table}.${column} ${type})`)
  }
  const info = await client.execute(`PRAGMA table_info(${table})`)
  const exists = info.rows.some((r) => r['name'] === column)
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}
