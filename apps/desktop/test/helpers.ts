/**
 * Shared helpers for integration tests. Import ONLY from integration test files
 * (not from pure unit tests) — importing this module triggers the db/index.ts
 * singleton, which requires NEEME_USER_DATA to be set (done by test/setup.ts).
 */
import { client, resetVecChunks } from '../src/main/db/index'

/** Wipe all rows between tests — preserves schema, resets state. */
export async function clearTables(): Promise<void> {
  // Delete in dependency order (FKs may or may not be enforced, but order is safe).
  await client.executeMultiple(
    'DELETE FROM todo_run; DELETE FROM todo_ai; DELETE FROM todo_context; DELETE FROM todos; DELETE FROM items; DELETE FROM meta; DELETE FROM connector_state;'
  )
  // chunks lives in neeme-vec.db (vecClient) since commit 00b72eb (#86). A plain
  // DELETE leaves the libsql_vector_idx shadow tables inconsistent; drop+recreate
  // is the safe reset path.
  await resetVecChunks()
}
