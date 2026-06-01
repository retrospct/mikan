import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/**
 * `memories` — the atomic unit of neeme's local store.
 *
 * This is intentionally minimal for the first working slice. The broader neeme
 * model captures provenance, source type, enrichment, and a vector index; those
 * land as additive columns/tables later (see ARCHITECTURE notes). Keep this the
 * source of truth — the vector index is a rebuildable artifact derived from it.
 */
export const memories = sqliteTable('memories', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
})

export type Memory = typeof memories.$inferSelect
export type NewMemory = typeof memories.$inferInsert

/**
 * `items` — captured multi-modal input, content-addressed by sha256. The richer
 * model the note above anticipated: provenance (source name/type), the
 * normalized `text`, and an extraction `status`. The vector index lives in a
 * separate `chunks` table (created in db/index.ts — it uses libSQL's native
 * F32_BLOB type, so it's managed via raw SQL rather than the Drizzle schema).
 */
export const items = sqliteTable('items', {
  id: text('id').primaryKey(), // sha256 of the raw bytes
  sourceName: text('source_name').notNull(),
  contentType: text('content_type').notNull(), // text | pdf | image | audio | other
  sizeBytes: integer('size_bytes').notNull(),
  storedPath: text('stored_path'),
  text: text('text').notNull().default(''),
  status: text('status').notNull(), // captured | extracted | pending | failed
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
})

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
