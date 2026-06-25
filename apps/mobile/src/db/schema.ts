// Mirrors the desktop schema (apps/desktop/src/main/db/schema.ts) at parity.
// Intentionally a strict subset — only the tables mobile needs for Phase 0.
// chunks is excluded: mobile has no embedding/chunking pipeline, and including it
// as plain BLOB caused schema drift with the desktop's F32_BLOB vector index on
// the shared Turso primary (see HANDOFF-mobile-rn-turso.md V7 finding).

export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'text',
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    stored_path TEXT,
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
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER
  );
`
