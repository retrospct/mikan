import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
 *
 * Connector provenance: `connector` identifies the source (gmail, gcal, or null for
 * manual captures); `externalId` is the provider's stable id for dedup across re-syncs;
 * `uri` is an optional deep-link back to the original item.
 */
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(), // sha256 of the raw bytes
    sourceName: text('source_name').notNull(),
    contentType: text('content_type').notNull(), // text | pdf | image | audio | other
    sizeBytes: integer('size_bytes').notNull(),
    storedPath: text('stored_path'),
    text: text('text').notNull().default(''),
    status: text('status').notNull(), // captured | extracted | pending | failed
    // Connector provenance (null for manual captures)
    connector: text('connector'), // gmail | gcal | null
    externalId: text('external_id'), // provider's stable id (Gmail message id, Calendar event id)
    uri: text('uri'), // optional deep-link to the original item
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`)
  },
  (t) => [uniqueIndex('items_external_id_idx').on(t.externalId)]
)

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert

/**
 * `connector_state` — per-provider sync cursor and metadata. Tracks the
 * Gmail historyId and Calendar syncToken so incremental syncs only fetch deltas.
 * One row per provider; upserted on every successful sync.
 */
export const connectorState = sqliteTable('connector_state', {
  provider: text('provider').primaryKey(), // gmail | gcal
  cursor: text('cursor'), // Gmail historyId | Calendar syncToken (null = full re-sync needed)
  itemCount: integer('item_count').notNull().default(0),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' })
})

export type ConnectorStateRow = typeof connectorState.$inferSelect
export type NewConnectorStateRow = typeof connectorState.$inferInsert

/**
 * `todos` — the daily focus list (cap 5). `day` is the ISO date the item lives
 * on; NULL = backlog (unscheduled). Done items keep their `day` as a record.
 * (The Python/neeme-mono cap+plan model.)
 */
export const todos = sqliteTable('todos', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('open'), // open | done
  day: text('day'), // ISO date; NULL = backlog
  position: integer('position').notNull().default(0),
  mode: text('mode').notNull().default('plan'), // plan | auto (Group 03 auto switch)
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' })
})

export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert

/**
 * `todo_run` — the persisted state of a task's Auto-mode run (Group 03), one row
 * per todo, upserted on every `run()`/`approve()`/`pause()`. Mirrors `todoAi`'s
 * settled-snapshot pattern: this holds the *run's* state (working/awaiting/done)
 * and its `RunReceipt`, distinct from `todoAi`'s drafting content — a run may
 * settle at `awaiting` with no draft accepted yet, or `done` with nothing to
 * approve at all.
 */
export const todoRun = sqliteTable('todo_run', {
  todoId: text('todo_id').primaryKey(),
  state: text('state').notNull().default('listed'), // listed | working | awaiting | done
  ranOnDevice: integer('ran_on_device', { mode: 'boolean' }).notNull().default(true),
  durationMs: integer('duration_ms'),
  touched: text('touched'), // JSON: string[] (context item ids the run read)
  sentAnything: integer('sent_anything', { mode: 'boolean' }).notNull().default(false),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
})

export type TodoRunRow = typeof todoRun.$inferSelect
export type NewTodoRunRow = typeof todoRun.$inferInsert

/**
 * `todoContext` — each todo's persistent, additive pool of surfaced memories
 * (from semantic search over `items`). Denormalized so the UI renders without a
 * re-search; `state` is the user's pin/dismiss verdict (a search-quality signal).
 */
export const todoContext = sqliteTable('todo_context', {
  todoId: text('todo_id').notNull(),
  itemId: text('item_id').notNull(),
  score: real('score'),
  sourceName: text('source_name'),
  contentType: text('content_type'),
  excerpt: text('excerpt'),
  state: text('state').notNull().default('surfaced'), // surfaced | pinned | dismissed
  /** AI-gap: why Mikan kept this beside the task. Populated by the drafter; null otherwise. */
  why: text('why'),
  firstSurfacedAt: integer('first_surfaced_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  lastSurfacedAt: integer('last_surfaced_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
})

export type TodoContextRow = typeof todoContext.$inferSelect

/**
 * `todo_ai` — the persisted output of the Drafter for each todo. One row per
 * todo; upserted on every successful drafting run. `inputs_hash` is a
 * content-address over (title + notes + sorted ctx ids/excerpts) so regenerate()
 * can skip the LLM call when nothing has changed.
 *
 * `status` tracks the drafting lifecycle:
 *   gathering → the drafter call is in flight (transient; cleared on upsert)
 *   gathered  → drafter ran but decided not to write a full draft
 *   drafted   → drafter produced a complete draft
 */
export const todoAi = sqliteTable('todo_ai', {
  todoId: text('todo_id').primaryKey(),
  status: text('status').notNull().default('gathered'), // gathering | gathered | drafted
  brief: text('brief'),
  draft: text('draft'), // JSON: string[]
  draftNote: text('draft_note'),
  note: text('note'),
  noteKind: text('note_kind'), // ready | ask | wait | gathered | done
  conf: real('conf'), // 0..1, backlog confidence
  meta: text('meta'), // JSON: { draftFor, draftType, draftIcon, useLabel, useNote, useDone }
  inputsHash: text('inputs_hash').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
})

export type TodoAiRow = typeof todoAi.$inferSelect
export type NewTodoAiRow = typeof todoAi.$inferInsert
