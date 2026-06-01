/**
 * View-model contract — the shapes the **UI renders**, and therefore the shapes
 * the backend's `window.api.*` returns. Lifted verbatim from the design's
 * `renderer/src/neeme/data.ts` so the UI can swap mock data for `window.api.*`
 * with a mechanical import change (`from './data'` → `from '@nimi/contract/views'`).
 *
 * Keep this free of Node/Electron/Drizzle imports (the renderer imports it).
 *
 * ── "Wire real, plain" ──────────────────────────────────────────────────────
 * Structural fields (ids, titles, timestamps, the context pool, search rank) are
 * served for real from the on-device pipeline. AI-generated fields — marked
 * **AI-gap** below — come back `null`/`undefined`/empty until the drafting layer
 * (an LLM) lands; the UI degrades gracefully (no brief, no draft, neutral status).
 */

// ── memories (a captured item, projected for display) ────────────────────────

export type MemoryKind =
  | 'note'
  | 'text'
  | 'pdf'
  | 'doc'
  | 'txt'
  | 'image'
  | 'photo'
  | 'screenshot'
  | 'voice'
  | 'audio'
  | 'video'
  | 'mp4'
  | 'zip'
  | 'email'
  | 'calendar'
  | 'event'
  | 'link'
  | 'web'

export interface Memory {
  id: string
  kind: MemoryKind
  title: string
  snip: string
  src: string
  when: string
}

// ── tasks (a daily-focus todo + its context pool, projected) ─────────────────

/**
 * `gathering`/`drafted` are **AI-gap** states (Nimi is still pulling context, or
 * has written a draft). Until the AI layer lands the backend only emits the two
 * structural states: `gathered` (open, context surfaced) and `done`.
 */
export type TaskStatus = 'gathering' | 'gathered' | 'drafted' | 'done'

/** AI-gap: the kind of note Nimi leaves beside a task. Not emitted yet. */
export type NoteKind = 'ready' | 'ask' | 'wait' | 'gathered' | 'done'

export interface Task {
  id: string
  title: string
  when: string
  status: TaskStatus
  done: boolean
  /** Context-pool item ids (non-dismissed), pinned-first then by relevance. */
  ctx: string[]
  /** Subset of `ctx` the user pinned. */
  pinned: string[]
  /** AI-gap: the drafted reply/body. `null` until the AI layer lands. */
  draft: string[] | null
  /** AI-gap: one-line provenance for the draft. `null` until then. */
  draftNote: string | null
  /** AI-gap: not emitted yet. */
  noteKind?: NoteKind
  /** AI-gap: Nimi's voice note beside the task. `null` until then. */
  note?: string | null
  /** Relevance per `ctx` id (0..1, higher = closer). Real — from search. */
  relMap?: Record<string, number>
  /** AI-gap: per-ctx-id reason string ("why Nimi kept this beside the task"). Real when the
   *  drafter is configured; `null`/absent otherwise. Mirrors `relMap`. */
  whyMap?: Record<string, string>
  /** UI hint: just-added (the backend doesn't set this). */
  fresh?: boolean
  // ── task-detail "brief" + draft metadata — all AI-gap, not emitted yet ──
  brief?: string
  draftFor?: string
  draftType?: string
  draftIcon?: string
  useLabel?: string
  useNote?: string
  useDone?: string
}

// ── backlog (an unscheduled, open todo) ──────────────────────────────────────

export interface BacklogItem {
  id: string
  title: string
  /** Structural: the user's own note on the todo (`''` if none). */
  hint: string
  ctx: string[]
  /** AI-gap: confidence Nimi can cover this. `null` until the AI layer lands. */
  conf?: number | null
  fresh?: boolean
}

/**
 * AI-gap: a todo Nimi *infers* from the feed (not user-entered). The backend
 * does not emit these yet — `window.api` returns `[]` until the inference layer
 * lands. Kept here so the UI type matches.
 */
export interface UncoveredTodo {
  id?: string
  title: string
  why: string
  conf: number
  ctxN: number
  ctx?: string[]
}

// ── feed (the recent-capture stream) ─────────────────────────────────────────

export interface FedItem {
  id: string
  kind: MemoryKind
  title: string
  when: string
  /** `done` once extracted/indexed; `pending` while still processing or failed. */
  status: 'done' | 'pending'
}

// ── search ───────────────────────────────────────────────────────────────────

/** A ranked archive memory for a typed task/query. `rel` is 0..1 (higher = closer). */
export interface MatchHit {
  id: string
  rel: number
}
