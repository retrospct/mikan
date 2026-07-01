import { createHash } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { todoAi, todoContext, type TodoAiRow } from '../db/schema'
import { drafter, type DraftInput, type TaskDraft } from '../pipeline/draft'
import { pipelineService } from './pipeline-service'
import type { ContextEntry, ContentType, Todo } from '@mikan/contract/ipc'

/**
 * Draft service — the glue between the `Drafter` seam and the database.
 *
 * `regenerate(todo)` builds a `DraftInput` from the todo's non-dismissed context
 * pool, calls the drafter, and persists the result in `todo_ai` + per-item
 * `why` strings in `todo_context.why`. An `inputsHash` guards against redundant
 * LLM calls when nothing has changed.
 *
 * For backlog items (no pool) a fresh search is run to build the context so that
 * `conf` is still meaningful.
 *
 * `read(todoId)` loads the current `todo_ai` row (or null).
 */

const BACKLOG_CONTEXT_TOP_K = 4

// ── inputs hash ───────────────────────────────────────────────────────────

/**
 * A stable content address over the inputs to the drafter. If title, notes,
 * pinned set, or any context excerpt changes, the hash changes and we re-draft.
 */
function hashInputs(input: DraftInput): string {
  const stable = JSON.stringify({
    title: input.title,
    notes: input.notes ?? '',
    pinned: [...input.pinnedIds].sort(),
    ctx: input.context
      .slice()
      .sort((a, b) => a.itemId.localeCompare(b.itemId))
      .map((c) => ({ id: c.itemId, excerpt: (c.excerpt ?? '').slice(0, 200) }))
  })
  return createHash('sha1').update(stable).digest('hex')
}

// ── context → DraftInput ──────────────────────────────────────────────────

function contextToDraftInput(todo: Todo, pool: ContextEntry[]): DraftInput {
  const relMap: Record<string, number> = {}
  for (const c of pool) {
    if (c.score != null) relMap[c.itemId] = Math.max(0, Math.min(1, 1 - c.score))
  }
  return {
    title: todo.title,
    notes: todo.notes,
    pinnedIds: pool.filter((c) => c.state === 'pinned').map((c) => c.itemId),
    context: pool.map((c) => ({
      itemId: c.itemId,
      sourceName: c.sourceName,
      contentType: c.contentType,
      excerpt: c.excerpt,
      rel: relMap[c.itemId] ?? 0.5
    }))
  }
}

// ── DB helpers ────────────────────────────────────────────────────────────

async function readAiRow(todoId: string): Promise<TodoAiRow | null> {
  const [row] = await db.select().from(todoAi).where(eq(todoAi.todoId, todoId)).limit(1)
  return row ?? null
}

async function upsertAiRow(todoId: string, result: TaskDraft, hash: string): Promise<void> {
  const meta = JSON.stringify({
    draftFor: result.draftFor ?? null,
    draftType: result.draftType ?? null,
    draftIcon: result.draftIcon ?? null,
    useLabel: result.useLabel ?? null,
    useNote: result.useNote ?? null,
    useDone: result.useDone ?? null
  })
  const now = new Date()
  await db
    .insert(todoAi)
    .values({
      todoId,
      status: result.status,
      brief: result.brief,
      draft: result.draft ? JSON.stringify(result.draft) : null,
      draftNote: result.draftNote,
      note: result.note,
      noteKind: result.noteKind,
      conf: result.conf,
      meta,
      inputsHash: hash,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: todoAi.todoId,
      set: {
        status: result.status,
        brief: result.brief,
        draft: result.draft ? JSON.stringify(result.draft) : null,
        draftNote: result.draftNote,
        note: result.note,
        noteKind: result.noteKind,
        conf: result.conf,
        meta,
        inputsHash: hash,
        updatedAt: now
      }
    })
}

async function persistWhyStrings(todoId: string, why: Record<string, string>): Promise<void> {
  for (const [itemId, reason] of Object.entries(why)) {
    await db
      .update(todoContext)
      .set({ why: reason })
      .where(and(eq(todoContext.todoId, todoId), eq(todoContext.itemId, itemId)))
  }
}

// ── service ───────────────────────────────────────────────────────────────

export const draftService = {
  /**
   * Regenerate the AI fields for a todo. Idempotent when nothing has changed
   * (inputsHash match). Always safe to call after any mutation.
   *
   * For backlog items (pool is empty, todo.day is null) we run a search to
   * build context for a meaningful `conf` score.
   *
   * `signal` (Group 03 `pause()`) aborts the in-flight drafter call; an
   * `AbortError` propagates to the caller uncaught — regenerate() does not
   * persist anything for an aborted run.
   */
  async regenerate(todo: Todo, pool: ContextEntry[], signal?: AbortSignal): Promise<void> {
    let input: DraftInput

    if (pool.length === 0 && todo.day === null) {
      // Backlog item — surface context via search so conf is meaningful
      const query = todo.notes ? `${todo.title}\n${todo.notes}` : todo.title
      const hits = await pipelineService.search(query, BACKLOG_CONTEXT_TOP_K)
      const bestByItem = new Map<string, (typeof hits)[number]>()
      for (const h of hits) {
        const prev = bestByItem.get(h.itemId)
        if (!prev || h.score < prev.score) bestByItem.set(h.itemId, h)
      }
      const fakePool: ContextEntry[] = [...bestByItem.values()].map((h) => ({
        itemId: h.itemId,
        score: h.score,
        sourceName: h.sourceName,
        contentType: h.contentType as ContentType,
        excerpt: h.text,
        state: 'surfaced',
        why: null
      }))
      input = contextToDraftInput(todo, fakePool)
    } else {
      input = contextToDraftInput(todo, pool)
    }

    const hash = hashInputs(input)
    const existing = await readAiRow(todo.id)
    if (existing && existing.inputsHash === hash) return // nothing changed

    const result = await drafter.draft(input, signal)
    await upsertAiRow(todo.id, result, hash)
    if (Object.keys(result.why).length > 0) {
      await persistWhyStrings(todo.id, result.why)
    }
  },

  /** Load the persisted AI row for a todo (or null if it hasn't been drafted yet). */
  async read(todoId: string): Promise<TodoAiRow | null> {
    return readAiRow(todoId)
  }
}

// ── row → TaskDraft ───────────────────────────────────────────────────────

/**
 * Rehydrate a persisted `TodoAiRow` back into a `TaskDraft`-shaped record
 * for use by the projection layer. Exported so `project.ts` can stay clean.
 */
export function rowToTaskDraft(row: TodoAiRow): TaskDraft {
  const meta = parseJson<{
    draftFor?: string | null
    draftType?: string | null
    draftIcon?: string | null
    useLabel?: string | null
    useNote?: string | null
    useDone?: string | null
  }>(row.meta, {})

  const draft = parseJson<string[] | null>(row.draft, null)

  return {
    brief: row.brief ?? null,
    draft: Array.isArray(draft) ? draft : null,
    draftNote: row.draftNote ?? null,
    note: row.note ?? null,
    noteKind: (row.noteKind as TaskDraft['noteKind']) ?? null,
    status: row.status === 'drafted' ? 'drafted' : 'gathered',
    conf: row.conf ?? null,
    draftFor: meta.draftFor ?? undefined,
    draftType: meta.draftType ?? undefined,
    draftIcon: meta.draftIcon ?? undefined,
    useLabel: meta.useLabel ?? undefined,
    useNote: meta.useNote ?? undefined,
    useDone: meta.useDone ?? undefined,
    why: {}
  }
}

function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}
