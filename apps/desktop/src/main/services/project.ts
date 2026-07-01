/**
 * Projection layer: data model (`Item`/`Todo`/`ContextEntry`/`SearchHit`) → the
 * UI view-model (`Memory`/`Task`/`FedItem`/`BacklogItem`/`MatchHit`).
 *
 * Why a separate layer: it keeps the view model out of the domain services (which
 * stay about capture/search/todos), and — per "wire real, plain" — confines every
 * AI-gap (`brief`/`draft`/`note`/`gathering`→`drafted`) to ONE place. When the AI
 * layer lands (or is absent), only these functions change.
 * Runs in the worker (off the main loop).
 */
import { createHash } from 'node:crypto'
import type { ContextEntry, Item, ItemStatus, Todo } from '@mikan/contract/ipc'
import type {
  BacklogItem,
  FedItem,
  MatchHit,
  Memory,
  MemoryKind,
  NoteKind,
  Task,
  TaskState,
  TaskStatus,
  UncoveredTodo
} from '@mikan/contract/views'
import type { TaskDraft, UncoveredDraft } from '../pipeline/draft'

const DAY_MS = 86_400_000

/** A coarse human "when" for the feed/archive (the AI can refine phrasing later). */
export function relativeWhen(date: Date): string {
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(diff / DAY_MS)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  return date.toISOString().slice(0, 10)
}

/** Map the pipeline's coarse contentType (+ filename + connector) to the UI's richer kind. */
function memoryKindOf(contentType: string, sourceName: string, connector?: string): MemoryKind {
  // Connector provenance takes precedence over content-type inference.
  if (connector === 'gmail') return 'email'
  if (connector === 'gcal') return 'calendar'

  const ext = sourceName.includes('.') ? sourceName.split('.').pop()!.toLowerCase() : ''
  switch (contentType) {
    case 'pdf':
      return 'pdf'
    case 'image':
      return ext === 'png' ? 'screenshot' : 'image'
    case 'audio':
      return 'voice'
    case 'text':
      return ext === 'md' || ext === 'txt' ? 'note' : 'text'
    default:
      return 'doc'
  }
}

/** Title: first non-empty line of the extracted text, else the source name. */
function deriveTitle(item: Item): string {
  const firstLine = item.text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!firstLine) return item.sourceName
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
}

/** Snippet: a short flattened preview of the text. */
function deriveSnip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat
}

export function toMemory(item: Item): Memory {
  return {
    id: item.id,
    kind: memoryKindOf(item.contentType, item.sourceName, item.connector),
    title: deriveTitle(item),
    snip: deriveSnip(item.text),
    src: item.uri ?? item.sourceName,
    when: relativeWhen(item.createdAt)
  }
}

export function toFedItem(item: Item): FedItem {
  const done: ItemStatus[] = ['captured', 'extracted']
  return {
    id: item.id,
    kind: memoryKindOf(item.contentType, item.sourceName, item.connector),
    title: deriveTitle(item),
    when: relativeWhen(item.createdAt),
    status: done.includes(item.status) ? 'done' : 'pending'
  }
}

/** Best chunk per item → a 0..1 relevance, sorted closest-first. */
export function toMatchHits(hits: { itemId: string; score: number }[]): MatchHit[] {
  const best = new Map<string, number>()
  for (const h of hits) {
    const prev = best.get(h.itemId)
    if (prev === undefined || h.score < prev) best.set(h.itemId, h.score)
  }
  return [...best.entries()]
    .map(([id, dist]) => ({ id, rel: relevanceFromDistance(dist) }))
    .sort((a, b) => b.rel - a.rel)
}

/** Stored score is cosine DISTANCE (lower = closer); UI rel is 0..1 (higher = closer). */
function relevanceFromDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance))
}

function whenOfDay(day: string | null): string {
  if (!day) return 'today'
  return day === new Date().toISOString().slice(0, 10) ? 'today' : day
}

/**
 * Project a todo + its (already non-dismissed, pinned-first, score-sorted) context
 * pool into a `Task`. When `ai` is provided, AI-generated fields are populated;
 * otherwise they degrade gracefully to null.
 *
 * Invariant for the UI: every `ctx` id also appears in `pipeline.archive()` (both
 * come from the `items` table), so `MEMORIES[id]` always resolves.
 */
export function toTask(todo: Todo, context: ContextEntry[], ai?: TaskDraft): Task {
  const relMap: Record<string, number> = {}
  const whyMap: Record<string, string> = {}
  for (const c of context) {
    if (c.score != null) relMap[c.itemId] = relevanceFromDistance(c.score)
    if (c.why) whyMap[c.itemId] = c.why
  }

  const done = todo.status === 'done'
  let status: TaskStatus
  if (done) {
    status = 'done'
  } else if (ai?.status === 'drafted') {
    status = 'drafted'
  } else {
    status = 'gathered'
  }

  // Canonical lifecycle (Mikan Flows). Derived from the structural `status` the
  // projector emits today: `done`→done, a landed draft→awaiting (the approval
  // gate), otherwise the resting `listed`. `planning`/`planned`/`working` become
  // real once the planner + run-loop land (slices S4/S5). See docs/adr/0010.
  const state: TaskState = done ? 'done' : status === 'drafted' ? 'awaiting' : 'listed'

  return {
    id: todo.id,
    title: todo.title,
    when: whenOfDay(todo.day),
    status,
    state,
    // No stored per-task mode yet — defaults to Plan until the mode switch lands.
    mode: 'plan',
    done,
    ctx: context.map((c) => c.itemId),
    pinned: context.filter((c) => c.state === 'pinned').map((c) => c.itemId),
    relMap,
    whyMap: Object.keys(whyMap).length > 0 ? whyMap : undefined,
    draft: ai?.draft ?? null,
    draftNote: ai?.draftNote ?? null,
    note: ai?.note ?? null,
    noteKind: (ai?.noteKind as NoteKind | undefined) ?? undefined,
    brief: ai?.brief ?? undefined,
    draftFor: ai?.draftFor,
    draftType: ai?.draftType,
    draftIcon: ai?.draftIcon,
    useLabel: ai?.useLabel,
    useNote: ai?.useNote,
    useDone: ai?.useDone
  }
}

/**
 * Project an inferred to-do into the view model. `id` is a stable content hash of
 * the title + source ids, so it survives cache round-trips (the UI keys its
 * "added" state on `td.id`).
 */
export function toUncoveredTodo(d: UncoveredDraft): UncoveredTodo {
  const id =
    'unc_' +
    createHash('sha1')
      .update(d.title + '|' + d.ctx.join(','))
      .digest('hex')
      .slice(0, 12)
  return {
    id,
    title: d.title,
    why: d.why,
    conf: d.conf,
    ctxN: d.ctx.length,
    ctx: d.ctx
  }
}

export function toBacklogItem(todo: Todo, ai?: TaskDraft): BacklogItem {
  return {
    id: todo.id,
    title: todo.title,
    hint: todo.notes ?? '',
    ctx: [], // surfaced only once scheduled onto a day
    conf: ai?.conf ?? null
  }
}
