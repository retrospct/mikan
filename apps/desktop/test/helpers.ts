/**
 * Shared helpers for integration tests. Import ONLY from integration test files
 * (not from pure unit tests) — importing this module triggers the db/index.ts
 * singleton, which requires NEEME_USER_DATA to be set (done by test/setup.ts).
 */
import { client } from '../src/main/db/index'

/** Wipe all rows between tests — preserves schema, resets state. */
export async function clearTables(): Promise<void> {
  // Delete in dependency order (FKs may or may not be enforced, but order is safe)
  await client.executeMultiple(
    'DELETE FROM todo_ai; DELETE FROM todo_context; DELETE FROM todos; DELETE FROM chunks; DELETE FROM items; DELETE FROM meta;'
  )
}
