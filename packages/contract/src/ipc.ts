/**
 * Shared IPC contract — imported by main (handlers), preload (bridge), and
 * renderer (typed `window.api`). Keep this free of Node/Electron/Drizzle
 * imports so the renderer can use it without pulling in backend-only modules.
 *
 * The renderer-facing return types are the **view model** (`./views.ts`,
 * the shapes the UI renders). The data-model types here (`Item`, `Todo`,
 * `SearchHit`, `ContextEntry`) are the worker's internal vocabulary; the worker
 * projects them to the view model (see
 * `apps/desktop/src/main/services/project.ts`).
 */
import type { BacklogItem, FedItem, MatchHit, Memory, Task, UncoveredTodo } from './views'

export const IPC = {
  // Pipeline (on-device capture → extract → index → surface; runs in the worker)
  pipelineCaptureText: 'pipeline:capture-text',
  pipelineCaptureFile: 'pipeline:capture-file',
  pipelineArchive: 'pipeline:archive',
  pipelineFeed: 'pipeline:feed',
  pipelineUncoverTodos: 'pipeline:uncover-todos',
  pipelineSearch: 'pipeline:search',
  // Todos (daily focus list: cap/plan + the per-todo context pool)
  todoAdd: 'todo:add',
  todoToday: 'todo:today',
  todoBacklog: 'todo:backlog',
  todoDone: 'todo:done',
  todoComplete: 'todo:complete',
  todoReopen: 'todo:reopen',
  todoPlan: 'todo:plan',
  todoSchedule: 'todo:schedule',
  todoContextSearch: 'todo:context-search',
  todoContextPin: 'todo:context-pin',
  todoContextDismiss: 'todo:context-dismiss',
  // Auth (Logto OIDC flow lives in main; see src/main/auth/logto.ts)
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authGetToken: 'auth:get-token',
  authGetState: 'auth:get-state',
  /** main → renderer event: auth state / token changed (login, refresh, logout). */
  authChanged: 'auth:changed',
  // Connectors (Google OAuth + ingest; lives in main; see src/main/connectors/google-auth.ts)
  connectorsConnect: 'connectors:connect',
  connectorsDisconnect: 'connectors:disconnect',
  connectorsGetState: 'connectors:get-state',
  connectorsSyncNow: 'connectors:sync-now',
  /** main → renderer event: connector state changed (connected, synced, disconnected). */
  connectorsChanged: 'connectors:changed',
  /** Internal channel forwarded to the worker for actual API sync. */
  connectorsIngest: 'connectors:ingest',
  /** Internal channel to read per-provider DB stats (item count + last sync). */
  connectorsGetStats: 'connectors:get-stats',
  // UI shell (tray/menu-bar window — see src/main/window/tray-window.ts)
  traySetBadge: 'tray:set-badge'
} as const

// --- Pipeline data model (worker-internal vocabulary) ---------------------

export type ContentType = 'text' | 'pdf' | 'image' | 'audio' | 'other'
export type ItemStatus = 'captured' | 'extracted' | 'pending' | 'failed'

/** A captured item — content-addressed, normalized to `text` when possible. */
export interface Item {
  id: string
  sourceName: string
  contentType: ContentType
  sizeBytes: number
  status: ItemStatus
  text: string
  /** Connector provenance — set for connector-ingested items, absent for manual captures. */
  connector?: string
  externalId?: string
  uri?: string
  createdAt: Date
}

export interface CaptureResult {
  /** The captured item, projected to a view `Memory`. */
  memory: Memory
  /** false if this exact content was already captured (idempotent). */
  created: boolean
}

/** A semantic-search hit: a matching chunk, with its parent item's metadata. */
export interface SearchHit {
  itemId: string
  chunkIdx: number
  text: string
  score: number // cosine distance (lower = closer)
  sourceName: string
  contentType: ContentType
}

/** Identity claims decoded from the id_token (display only). */
export interface AuthClaims {
  sub: string
  email?: string
  name?: string
  picture?: string
}

/** Auth state surfaced to the renderer. `configured` is false until Logto env is set. */
export interface AuthState {
  configured: boolean
  isAuthenticated: boolean
  claims: AuthClaims | null
}

export interface AuthApi {
  /** Open the system browser to sign in (OIDC + PKCE). */
  login: () => Promise<void>
  /** Clear the local session. */
  logout: () => Promise<void>
  /** Current access token (refreshed if near expiry), or undefined if signed out. */
  getAccessToken: () => Promise<string | undefined>
  /** Snapshot of auth state. */
  getState: () => Promise<AuthState>
  /** Subscribe to auth changes; returns an unsubscribe fn. */
  onChanged: (cb: (state: AuthState, accessToken?: string) => void) => () => void
}

// --- Todos data model (worker-internal vocabulary) ------------------------

export type TodoStatus = 'open' | 'done'

export interface Todo {
  id: string
  title: string
  notes: string | null
  status: TodoStatus
  /** ISO date the todo lives on; null = backlog (unscheduled). */
  day: string | null
  position: number
  createdAt: Date
  completedAt: Date | null
}

export type ContextState = 'surfaced' | 'pinned' | 'dismissed'

/** One surfaced memory in a todo's context pool (worker-internal). */
export interface ContextEntry {
  itemId: string
  score: number | null
  sourceName: string | null
  contentType: ContentType | null
  excerpt: string | null
  state: ContextState
  /** AI-gap: why Nimi kept this beside the task. Populated by the drafter; null otherwise. */
  why: string | null
}

/** Raised when adding would exceed the day's focus cap. */
export const CAP_REACHED = 'CAP_REACHED'

// --- Renderer-facing API (returns the view model) -------------------------

export interface TodoApi {
  /** Add to today (cap-enforced; rejects with CAP_REACHED when full). Surfaces context. */
  add: (title: string, notes?: string) => Promise<Task>
  /** Today's focus list, each task with its context pool projected in. */
  today: (day?: string) => Promise<Task[]>
  /** Open, unscheduled items (the backlog). */
  backlog: () => Promise<BacklogItem[]>
  /** The done log (newest first) — worker-internal `Todo` shape. */
  done: (limit?: number) => Promise<Todo[]>
  complete: (id: string) => Promise<Task | null>
  reopen: (id: string) => Promise<Task | null>
  /** Plan a day: carry `keep` open items onto it, sweep the rest to the backlog. */
  plan: (keep: string[], day?: string) => Promise<Task[]>
  /** Pull a backlog item onto a day (cap-enforced). */
  schedule: (id: string, day?: string) => Promise<Task | null>
  /** "Search more" — re-run search, merge new hits, return the updated task. */
  searchMoreContext: (id: string) => Promise<Task | null>
  pinContext: (id: string, itemId: string) => Promise<Task | null>
  dismissContext: (id: string, itemId: string) => Promise<Task | null>
}

/** Capture + surface, backed by the on-device pipeline in the worker. */
export interface PipelineApi {
  /** Quick text capture → the captured item as a `Memory` (+ whether newly created). */
  captureText: (text: string, name?: string) => Promise<CaptureResult>
  /** Capture raw file bytes → content-hash store → extract → index. */
  captureFile: (bytes: Uint8Array, name: string, mime?: string) => Promise<CaptureResult>
  /** The archive: every captured item, newest first (the UI's `MEMORIES`). */
  archive: () => Promise<Memory[]>
  /** The recent-capture feed (newest first). */
  feed: () => Promise<FedItem[]>
  /** AI-gap: candidate to-dos Nimi infers from the recent feed. `[]` until the
   *  drafter is configured (`NEEME_ANTHROPIC_KEY`); cached between feed changes. */
  uncoverTodos: () => Promise<UncoveredTodo[]>
  /** Rank archive memories for a typed task/query (the UI's `matchTask`). */
  search: (query: string, topK?: number) => Promise<MatchHit[]>
}

/** UI-shell channels (no data) — drive the tray/menu-bar window from the renderer. */
export interface UiApi {
  /** Set the "waiting" count shown on the tray icon + Dock badge (0 clears it). */
  setBadge: (count: number) => Promise<void>
}

// --- Connectors (Google OAuth + ingest — main-process concern) -----------

/** The connector providers currently supported. */
export type ConnectorId = 'gmail' | 'gcal'

/** State of a single provider. */
export interface ProviderState {
  connected: boolean
  lastSyncAt: string | null
  itemCount: number
}

/** State surfaced to the renderer. `configured` is false until NEEME_GOOGLE_CLIENT_ID is set. */
export interface ConnectorsState {
  configured: boolean
  gmail: ProviderState
  gcal: ProviderState
}

/** Result returned by a sync run (worker-internal, surfaced via connectorsChanged). */
export interface IngestResult {
  ingested: number
  lastSyncAt: string
}

export interface ConnectorsApi {
  /** Open the system browser to authorize a provider (PKCE + loopback). */
  connect: (provider: ConnectorId) => Promise<void>
  /** Revoke stored tokens and clear all sync state for a provider. */
  disconnect: (provider: ConnectorId) => Promise<void>
  /** Snapshot of connector state for all providers. */
  getState: () => Promise<ConnectorsState>
  /** Trigger an immediate incremental sync (returns after the sync completes). */
  syncNow: (provider: ConnectorId) => Promise<IngestResult>
  /** Subscribe to state changes; returns an unsubscribe fn. */
  onChanged: (cb: (state: ConnectorsState) => void) => () => void
}

export interface NimiApi {
  pipeline: PipelineApi
  todos: TodoApi
  auth: AuthApi
  connectors: ConnectorsApi
  ui: UiApi
}
