import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '../db'
import { todoContext, todos, type Todo as TodoRow, type TodoContextRow } from '../db/schema'
import { pipelineService } from './pipeline-service'
import {
  CAP_REACHED,
  type ContentType,
  type ContextEntry,
  type ContextState,
  type Todo,
  type TodoStatus
} from '../../shared/ipc'
import type { BacklogItem, Task } from '../../shared/views'
import { toBacklogItem, toTask } from './project'

/**
 * The daily focus to-do list + each todo's context pool (ported from the Python
 * `todos.py` / neeme-mono). Capped at CAP open items per day with a "finish the
 * whole list" latch; context is surfaced from the on-device pipeline's semantic
 * search over captured items and persisted (pin/dismiss verdicts stick).
 */
const CAP = 5
const CONTEXT_TOP_K = 6

const todayISO = (): string => new Date().toISOString().slice(0, 10)

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status as TodoStatus,
    day: row.day,
    position: row.position,
    createdAt: row.createdAt,
    completedAt: row.completedAt
  }
}

function toContextEntry(row: TodoContextRow): ContextEntry {
  return {
    itemId: row.itemId,
    score: row.score,
    sourceName: row.sourceName,
    contentType: row.contentType as ContentType | null,
    excerpt: row.excerpt,
    state: row.state as ContextState
  }
}

async function countForDay(day: string): Promise<number> {
  const [r] = await db.select({ c: count() }).from(todos).where(eq(todos.day, day))
  return r?.c ?? 0
}

async function openCountForDay(day: string): Promise<number> {
  const [r] = await db
    .select({ c: count() })
    .from(todos)
    .where(and(eq(todos.day, day), eq(todos.status, 'open')))
  return r?.c ?? 0
}

/** Focus rule: add while filling the day, or once it's fully cleared. */
async function canAdd(day: string): Promise<boolean> {
  if ((await openCountForDay(day)) === 0) return true
  return (await countForDay(day)) < CAP
}

// --- context pool ---------------------------------------------------------

async function listContext(todoId: string): Promise<ContextEntry[]> {
  const rows = await db.select().from(todoContext).where(eq(todoContext.todoId, todoId))
  return rows
    .filter((r) => r.state !== 'dismissed')
    .sort((a, b) => {
      const pin = Number(b.state === 'pinned') - Number(a.state === 'pinned')
      if (pin) return pin
      return (a.score ?? 1) - (b.score ?? 1) // cosine distance: lower = closer
    })
    .map(toContextEntry)
}

/** Run search over captured items and merge hits into the pool (additive; a
 *  user's pin/dismiss verdict is preserved). Best chunk per item. */
async function surfaceContext(todo: Todo): Promise<ContextEntry[]> {
  const query = todo.notes ? `${todo.title}\n${todo.notes}` : todo.title
  const hits = await pipelineService.search(query, CONTEXT_TOP_K)

  const bestByItem = new Map<string, (typeof hits)[number]>()
  for (const h of hits) {
    const prev = bestByItem.get(h.itemId)
    if (!prev || h.score < prev.score) bestByItem.set(h.itemId, h)
  }

  const now = new Date()
  for (const h of bestByItem.values()) {
    await db
      .insert(todoContext)
      .values({
        todoId: todo.id,
        itemId: h.itemId,
        score: h.score,
        sourceName: h.sourceName,
        contentType: h.contentType,
        excerpt: h.text,
        lastSurfacedAt: now
      })
      .onConflictDoUpdate({
        target: [todoContext.todoId, todoContext.itemId],
        // bump score/snapshot but never touch `state` (the verdict sticks).
        set: {
          score: h.score,
          sourceName: h.sourceName,
          contentType: h.contentType,
          excerpt: h.text,
          lastSurfacedAt: now
        }
      })
  }
  return listContext(todo.id)
}

/** Project a todo + its context pool into the UI `Task` shape (AI fields nulled). */
async function taskOf(todo: Todo): Promise<Task> {
  return toTask(todo, await listContext(todo.id))
}

/** Re-read a todo by id and project it (used by mutators that return the task). */
async function taskById(id: string): Promise<Task | null> {
  const [r] = await db.select().from(todos).where(eq(todos.id, id)).limit(1)
  return r ? taskOf(toTodo(r)) : null
}

// --- service --------------------------------------------------------------

export const todoService = {
  async add(title: string, notes?: string): Promise<Task> {
    const day = todayISO()
    if (!(await canAdd(day))) throw new Error(CAP_REACHED)
    const position = await countForDay(day)
    const [created] = await db
      .insert(todos)
      .values({ title, notes: notes ?? null, day, position })
      .returning()
    const todo = toTodo(created!)
    await surfaceContext(todo)
    return taskOf(todo)
  },

  async today(day = todayISO()): Promise<Task[]> {
    const rows = await db
      .select()
      .from(todos)
      .where(eq(todos.day, day))
      .orderBy(todos.position, todos.createdAt)
    return Promise.all(rows.map((r) => taskOf(toTodo(r))))
  },

  async backlog(): Promise<BacklogItem[]> {
    const rows = await db
      .select()
      .from(todos)
      .where(and(isNull(todos.day), eq(todos.status, 'open')))
      .orderBy(desc(todos.createdAt))
    return rows.map((r) => toBacklogItem(toTodo(r)))
  },

  async done(limit = 50): Promise<Todo[]> {
    const rows = await db
      .select()
      .from(todos)
      .where(eq(todos.status, 'done'))
      .orderBy(desc(todos.completedAt))
      .limit(limit)
    return rows.map(toTodo)
  },

  async complete(id: string): Promise<Task | null> {
    const [r] = await db
      .update(todos)
      .set({ status: 'done', completedAt: new Date() })
      .where(eq(todos.id, id))
      .returning()
    return r ? taskOf(toTodo(r)) : null
  },

  async reopen(id: string): Promise<Task | null> {
    const [r] = await db
      .update(todos)
      .set({ status: 'open', completedAt: null })
      .where(eq(todos.id, id))
      .returning()
    return r ? taskOf(toTodo(r)) : null
  },

  /** Carry the `keep` open items onto `day`; sweep every other open scheduled
   *  item to the backlog. Done items stay in the done log. */
  async plan(keep: string[], day = todayISO()): Promise<Task[]> {
    if (keep.length > CAP) throw new Error(CAP_REACHED)
    const scheduled = await db
      .select()
      .from(todos)
      .where(and(eq(todos.status, 'open'), isNotNull(todos.day)))
    const keepSet = new Set(keep)
    for (const t of scheduled) {
      if (!keepSet.has(t.id))
        await db.update(todos).set({ day: null, position: 0 }).where(eq(todos.id, t.id))
    }
    for (let i = 0; i < keep.length; i++) {
      await db.update(todos).set({ day, position: i }).where(eq(todos.id, keep[i]!))
    }
    return this.today(day)
  },

  async schedule(id: string, day = todayISO()): Promise<Task | null> {
    if (!(await canAdd(day))) throw new Error(CAP_REACHED)
    const position = await countForDay(day)
    const [r] = await db.update(todos).set({ day, position }).where(eq(todos.id, id)).returning()
    return r ? taskOf(toTodo(r)) : null
  },

  async searchMoreContext(id: string): Promise<Task | null> {
    const [r] = await db.select().from(todos).where(eq(todos.id, id)).limit(1)
    if (!r) return null
    await surfaceContext(toTodo(r))
    return taskOf(toTodo(r))
  },

  async pinContext(id: string, itemId: string): Promise<Task | null> {
    await db
      .update(todoContext)
      .set({ state: 'pinned' })
      .where(and(eq(todoContext.todoId, id), eq(todoContext.itemId, itemId)))
    return taskById(id)
  },

  async dismissContext(id: string, itemId: string): Promise<Task | null> {
    await db
      .update(todoContext)
      .set({ state: 'dismissed' })
      .where(and(eq(todoContext.todoId, id), eq(todoContext.itemId, itemId)))
    return taskById(id)
  }
}
