/**
 * View-model contract — the shapes the **UI renders**, and therefore the shapes
 * the backend's `window.api.*` returns. Lifted verbatim from the design's
 * `renderer/src/neeme/data.ts` so the UI can swap mock data for `window.api.*`
 * with a mechanical import change (`from './data'` → `from '@mikan/contract/views'`).
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
 * `gathering`/`drafted` are **AI-gap** states (Mikan is still pulling context, or
 * has written a draft). Until the AI layer lands the backend only emits the two
 * structural states: `gathered` (open, context surfaced) and `done`.
 */
export type TaskStatus = 'gathering' | 'gathered' | 'drafted' | 'done'

/** AI-gap: the kind of note Mikan leaves beside a task. Not emitted yet. */
export type NoteKind = 'ready' | 'ask' | 'wait' | 'gathered' | 'done'

// ── canonical task lifecycle (Mikan Flows) ───────────────────────────────────
/**
 * The six-state lifecycle from the *Mikan Flows* design (see `CONTEXT.md`).
 * Supersedes the coarser `TaskStatus` above: it splits **planning** (decide the
 * steps) from **working** (execute them) and adds an explicit approval gate plus a
 * done/report receipt. It is task-type-agnostic, not reply-specific.
 *
 * Rolled out **additively**: `Task.status` stays for now and `Task.state` is
 * derived from it at the projector (`services/project.ts` → `toTask`); `state`
 * becomes canonical as the renderer slices migrate, then `status` retires.
 * Decision of record: `docs/adr/0010-task-lifecycle.md`.
 */
export type TaskState =
  | 'listed' // on the list — resting todo, carries a mode badge
  | 'planning' // Mikan decides the steps (searches memory, gathers context)
  | 'planned' // the plan is ready; each step marked auto or ask
  | 'working' // executing steps; card expanded (reasoning, sources, tools)
  | 'awaiting' // hit an approval gate — "nothing sent yet"
  | 'done' // report — receipt: what it did, where it ran, what it touched

/** Per-task mode, set on the list (Groups 03/12). Orthogonal to `TaskState`. */
export type TaskMode = 'plan' | 'auto'

/** How a single plan step runs: autonomously, or pausing for the human (Group 12E). */
export type StepRun = 'auto' | 'ask'

/** One step of a task's plan. **AI-gap** — emitted only once the planner lands. */
export interface PlanStep {
  id: string
  /** Human-readable step line, e.g. "Checked your calendar". */
  title: string
  /** auto | ask — the per-step switch. */
  run: StepRun
  /** Connector/tool label, e.g. "CALENDAR" / "MAPS". `null` when none. */
  tool?: string | null
  /** Drives the orb fill (Group 07). */
  status: 'pending' | 'running' | 'done' | 'blocked'
}

/** Plain-language receipt shown when a run settles (Group 03D). **AI-gap**. */
export interface RunReceipt {
  /** Whether the run stayed on device. */
  ranOnDevice: boolean
  /** Wall-clock duration; `null` until measured. */
  durationMs: number | null
  /** Source/connector ids the run read or wrote. */
  touched: string[]
  /** "nothing sent yet" (false) vs an external action taken (true). */
  sentAnything: boolean
}

export interface Task {
  id: string
  title: string
  when: string
  status: TaskStatus
  /**
   * Canonical lifecycle state (Mikan Flows). Derived from `status` at the
   * projector today; supersedes `status` as renderer slices migrate. Optional
   * during the additive rollout — treat absence as `'listed'`.
   */
  state?: TaskState
  /** Per-task mode badge. Absent → treat as `'plan'`. */
  mode?: TaskMode
  /** AI-gap: the task's plan steps. `undefined` until the planner lands. */
  steps?: PlanStep[]
  /** AI-gap: run receipt, present once a run settles. */
  receipt?: RunReceipt
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
  /** AI-gap: Mikan's voice note beside the task. `null` until then. */
  note?: string | null
  /** Relevance per `ctx` id (0..1, higher = closer). Real — from search. */
  relMap?: Record<string, number>
  /** AI-gap: per-ctx-id reason string ("why Mikan kept this beside the task"). Real when the
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
  /** AI-gap: confidence Mikan can cover this. `null` until the AI layer lands. */
  conf?: number | null
  fresh?: boolean
}

/**
 * AI-gap: a todo Mikan *infers* from the feed (not user-entered). Emitted by
 * `pipeline.uncoverTodos()` when the drafter is configured (`NEEME_ANTHROPIC_KEY`);
 * `window.api` returns `[]` otherwise so the UI degrades to no suggestions.
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
