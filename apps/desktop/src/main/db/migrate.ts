/**
 * One-time migration of a pre-sync (plain, sync-off) database into a freshly
 * bootstrapped embedded replica.
 *
 * Why this exists: when sync is first enabled on a device that already has a
 * plain local DB, libSQL cannot open that file as a replica ("invalid local
 * state: db file exists but metadata file does not"). db/index.ts buildClient()
 * recovers by moving the plain DB aside and bootstrapping a fresh replica from
 * the primary; these helpers then copy the user's rows from the backup into the
 * replica, re-encrypting content under the active key so the cloud primary only
 * ever receives ciphertext.
 */
import type { Client, InValue, Row } from '@libsql/client'
import { encrypt } from './crypto'

/**
 * User-data tables worth migrating. `chunks` is intentionally omitted — it's a
 * rebuildable vector index that reindexAll() regenerates from items.text after
 * migration. `meta`/`connector_state` are omitted too: they hold the embedder
 * identity + sync cursors, and carrying stale values across would suppress the
 * post-migration reindex / confuse connector resync.
 */
export const MIGRATABLE_TABLES = ['items', 'memories', 'todos', 'todo_context', 'todo_ai'] as const

/** Per-table content columns that must be encrypted at rest before syncing. */
const ENCRYPTED_COLUMNS: Record<string, readonly string[]> = {
  items: ['text'],
  todos: ['title', 'notes']
}

/** libSQL rejects opening a plain DB as a replica with this class of message. */
export function isReplicaStateMismatch(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /invalid local state|metadata file/i.test(msg)
}

export interface ReplicaRecoveryOps {
  /** Construct the embedded-replica client (may throw on a state mismatch). */
  makeReplica: () => Client
  /** Does a (plain) DB already exist at the target path? */
  dbExists: () => boolean
  /** Move the existing plain DB (+ sidecars) aside to `backupPath`. */
  backupAside: (backupPath: string) => void
  /** Restore a backup moved aside by backupAside (called when second makeReplica fails). */
  restoreBackup: (backupPath: string) => void
  /** Target DB path, used to derive the backup path. */
  dbPath: string
  /** Injectable clock for deterministic backup names in tests. */
  now?: () => number
}

/**
 * Build the embedded replica, recovering from the one expected, recoverable
 * failure: a plain (sync-off) DB already exists and libSQL refuses to open it as
 * a replica. In that case we move the plain DB aside and bootstrap a fresh
 * replica from the primary, returning the backup path so its rows can be migrated
 * after the first sync.
 *
 * If the second makeReplica() call also fails (e.g. a transient network error
 * after the plain DB was already moved aside), we restore the backup so the user
 * is left in a valid local-first state instead of a broken one, then re-throw.
 *
 * Any other first-call construction error (e.g. a network failure when no DB
 * exists yet) is re-thrown unchanged — the caller decides how to handle it.
 */
export function buildReplicaWithRecovery(ops: ReplicaRecoveryOps): {
  client: Client
  backupPath: string | null
} {
  try {
    return { client: ops.makeReplica(), backupPath: null }
  } catch (err) {
    if (!isReplicaStateMismatch(err) || !ops.dbExists()) throw err
    const backupPath = `${ops.dbPath}.pre-sync-${(ops.now ?? Date.now)()}`
    ops.backupAside(backupPath)
    try {
      return { client: ops.makeReplica(), backupPath }
    } catch (err2) {
      // The plain DB was moved aside but the replica still can't be built
      // (e.g. network is down). Restore the backup so the user isn't left
      // with neither a working local DB nor a replica.
      ops.restoreBackup(backupPath)
      throw err2
    }
  }
}

/**
 * Plaintext → ciphertext under the active key; already-encrypted values pass
 * through unchanged (same key assumed). encrypt() is a no-op without a key, but
 * migration only runs with sync on, where a valid key is required.
 */
function toStoredContent(value: InValue, encryptCol: boolean): InValue {
  if (!encryptCol || typeof value !== 'string') return value
  return value.startsWith('enc:') ? value : encrypt(value)
}

function isMissingTableError(err: unknown, table: string): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return new RegExp(`no such table:\\s*(?:main\\.)?${table}\\b`, 'i').test(msg)
}

/**
 * Copy all rows from `table` in `src` into `dest` within a single transaction
 * (atomic per-table, idempotent via INSERT OR IGNORE). Column names are
 * double-quoted to handle any reserved-word collisions. Returns the number of
 * rows actually inserted (rowsAffected, not the total selected).
 */
async function copyTable(src: Client, dest: Client, table: string): Promise<number> {
  let res: Awaited<ReturnType<Client['execute']>>
  try {
    res = await src.execute(`SELECT * FROM "${table}"`)
  } catch (err) {
    if (isMissingTableError(err, table)) return 0
    throw err
  }
  if (res.rows.length === 0) return 0
  const encCols = ENCRYPTED_COLUMNS[table] ?? []
  let inserted = 0
  await dest.execute('BEGIN')
  try {
    for (const row of res.rows as Row[]) {
      const cols = Object.keys(row)
      const quotedCols = cols.map((c) => `"${c}"`).join(', ')
      const args = cols.map((c) => toStoredContent(row[c] as InValue, encCols.includes(c)))
      const r = await dest.execute({
        sql: `INSERT OR IGNORE INTO "${table}" (${quotedCols}) VALUES (${cols.map(() => '?').join(', ')})`,
        args
      })
      inserted += r.rowsAffected
    }
    await dest.execute('COMMIT')
  } catch (err) {
    await dest.execute('ROLLBACK').catch(() => {})
    throw err
  }
  return inserted
}

/**
 * Copy user rows src → dest (INSERT OR IGNORE, so rows already pulled from the
 * primary are not duplicated). Tables missing from src are skipped. Returns the
 * number of rows actually inserted.
 */
export async function migrateUserData(src: Client, dest: Client): Promise<number> {
  let total = 0
  for (const table of MIGRATABLE_TABLES) {
    total += await copyTable(src, dest, table)
  }
  return total
}
