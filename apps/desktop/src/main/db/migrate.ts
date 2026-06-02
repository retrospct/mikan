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
  /** Target DB path, used to derive the backup path. */
  dbPath: string
  /** Injectable clock for deterministic backup names in tests. */
  now?: () => number
}

/**
 * Build the embedded replica, recovering from the one expected, recoverable
 * failure: a plain (sync-off) DB already exists and libSQL refuses to open it as
 * a replica. In that case we move the plain DB aside and bootstrap a fresh
 * replica, returning the backup path so its rows can be migrated in after the
 * first sync. Any other construction error (e.g. a network failure) is re-thrown
 * unchanged — the caller decides how to handle it.
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
    return { client: ops.makeReplica(), backupPath }
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

async function copyTable(src: Client, dest: Client, table: string): Promise<number> {
  const res = await src.execute(`SELECT * FROM ${table}`)
  if (res.rows.length === 0) return 0
  const encCols = ENCRYPTED_COLUMNS[table] ?? []
  let n = 0
  for (const row of res.rows as Row[]) {
    const cols = Object.keys(row)
    const args = cols.map((c) => toStoredContent(row[c] as InValue, encCols.includes(c)))
    await dest.execute({
      sql: `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      args
    })
    n++
  }
  return n
}

/**
 * Copy user rows src → dest (INSERT OR IGNORE, so rows already pulled from the
 * primary are not duplicated). Tables missing from src are skipped. Returns the
 * number of rows processed.
 */
export async function migrateUserData(src: Client, dest: Client): Promise<number> {
  let total = 0
  for (const table of MIGRATABLE_TABLES) {
    total += await copyTable(src, dest, table).catch(() => 0)
  }
  return total
}
