// Mirrors the desktop schema (apps/desktop/src/main/db/schema.ts) at parity.
// Intentionally a strict subset — only the tables mobile needs for Phase 0.
// Vector chunks are local-only (recomputed per device, never synced) — same as desktop.

export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    text        TEXT,
    status      TEXT NOT NULL DEFAULT 'captured',
    connector   TEXT,
    external_id TEXT,
    uri         TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS todos (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    notes        TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    day          TEXT,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS chunks (
    item_id   TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    chunk_idx INTEGER NOT NULL,
    text      TEXT NOT NULL,
    embedding BLOB,
    PRIMARY KEY (item_id, chunk_idx)
  );
`
