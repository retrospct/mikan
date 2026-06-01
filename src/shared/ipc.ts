/**
 * Shared IPC contract — imported by main (handlers), preload (bridge), and
 * renderer (typed `window.api`). Keep this free of Node/Electron/Drizzle
 * imports so the renderer can use it without pulling in backend-only modules.
 */

export interface Memory {
  id: string
  content: string
  createdAt: Date
}

export const IPC = {
  memoryList: 'memory:list',
  memoryAdd: 'memory:add',
  // Pipeline (on-device capture → extract → index → search; main process)
  pipelineCaptureText: 'pipeline:capture-text',
  pipelineSearch: 'pipeline:search',
  pipelineList: 'pipeline:list',
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
  // UI shell (tray/menu-bar window — see src/main/window/tray-window.ts)
  traySetBadge: 'tray:set-badge'
} as const

// --- Pipeline (capture / surface) -----------------------------------------

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
  createdAt: Date
}

export interface CaptureResult {
  item: Item
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

/** The API surface exposed on `window.api`. */
export interface MemoryApi {
  list: () => Promise<Memory[]>
  add: (content: string) => Promise<Memory>
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

// --- Todos (daily focus list + context pool) ------------------------------

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

/** One surfaced memory in a todo's context pool. */
export interface ContextEntry {
  itemId: string
  score: number | null
  sourceName: string | null
  contentType: ContentType | null
  excerpt: string | null
  state: ContextState
}

export interface TodoWithContext extends Todo {
  context: ContextEntry[]
}

/** Raised when adding would exceed the day's focus cap. */
export const CAP_REACHED = 'CAP_REACHED'

export interface TodoApi {
  /** Add to today (cap-enforced; rejects with CAP_REACHED when full). Surfaces context. */
  add: (title: string, notes?: string) => Promise<TodoWithContext>
  /** Today's focus list, each item with its stored context pool. */
  today: (day?: string) => Promise<TodoWithContext[]>
  /** Open, unscheduled items (the backlog). */
  backlog: () => Promise<Todo[]>
  /** The done log (newest first). */
  done: (limit?: number) => Promise<Todo[]>
  complete: (id: string) => Promise<Todo | null>
  reopen: (id: string) => Promise<Todo | null>
  /** Plan a day: carry `keep` open items onto it, sweep the rest to the backlog. */
  plan: (keep: string[], day?: string) => Promise<TodoWithContext[]>
  /** Pull a backlog item onto a day (cap-enforced). */
  schedule: (id: string, day?: string) => Promise<Todo | null>
  /** "Search more" — re-run search and merge new hits into the pool. */
  searchMoreContext: (id: string) => Promise<ContextEntry[]>
  pinContext: (id: string, itemId: string) => Promise<ContextEntry[]>
  dismissContext: (id: string, itemId: string) => Promise<ContextEntry[]>
}

/** Capture + surface, backed by the on-device pipeline in the main process. */
export interface PipelineApi {
  /** Quick text capture → returns the item (+ whether it was newly created). */
  captureText: (text: string, name?: string) => Promise<CaptureResult>
  /** Semantic search over captured content. */
  search: (query: string, topK?: number) => Promise<SearchHit[]>
  /** Recently captured items (newest first). */
  listItems: () => Promise<Item[]>
}

/** UI-shell channels (no data) — drive the tray/menu-bar window from the renderer. */
export interface UiApi {
  /** Set the "waiting" count shown on the tray icon + Dock badge (0 clears it). */
  setBadge: (count: number) => Promise<void>
}

export interface NeemeApi {
  memory: MemoryApi
  pipeline: PipelineApi
  todos: TodoApi
  auth: AuthApi
  ui: UiApi
}
