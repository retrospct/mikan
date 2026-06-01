import { app } from 'electron'
import { join } from 'path'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

/**
 * Local-first data layer on libSQL (a SQLite fork). For now this is a plain
 * on-device `file:` database in Electron's per-user `userData` dir — protected
 * by the OS account (Tier 1: no app-level lock yet).
 *
 * libSQL is deliberate: the same driver later turns this local file into a
 * Turso *embedded replica* that syncs to the cloud, without rewriting the data
 * layer. Sync stays opt-in (and will only ever push encrypted data).
 */
const dbPath = join(app.getPath('userData'), 'neeme.db')

// Exported so the pipeline can use libSQL's native vector functions
// (vector32 / vector_distance_cos / libsql_vector_idx) via raw SQL — Drizzle's
// query builder doesn't model the F32_BLOB type.
export const client = createClient({ url: `file:${dbPath}` })

export const db = drizzle(client, { schema })

/** Embedding dimension for the chunk vector column (matches the embedder seam). */
export const EMBED_DIM = 384

/**
 * Bootstrap the schema. For the first slice we create tables directly; once the
 * schema stabilizes we switch to drizzle-kit generated migrations applied here.
 */
export async function initDb(): Promise<void> {
  await client.executeMultiple(`
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
  `)
}
