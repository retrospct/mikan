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
