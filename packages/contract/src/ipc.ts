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
  traySetBadge: 'tray:set-badge',
  // Sync (cloud offload — ROADMAP #10; see docs/plans/sync-cloud-offload.plan.md)
  /** Query current sync status from the worker (request-response). */
  syncGetStatus: 'sync:get-status',
  /** Trigger an immediate sync; resolves when complete (request-response). */
  syncNow: 'sync:now',
  /** Read the user-facing sync settings (pref + key presence + availability). main-owned. */
  syncGetSettings: 'sync:get-settings',
  /** Turn the cloud replica on/off; persists the pref + restarts the worker. main-owned. */
  syncSetEnabled: 'sync:set-enabled',
  /** Reveal this device's 64-hex encryption/recovery key (or null). main-owned. */
  syncGetRecoveryKey: 'sync:get-recovery-key',
  /** Import a recovery key from another device; restarts the worker. main-owned. */
  syncSetRecoveryKey: 'sync:set-recovery-key',
  // Auto-updater (ROADMAP #12 — electron-updater via GitHub Releases)
  /** Query current updater state (request-response). */
  updateGetStatus: 'update:get-status',
  /** Apply the downloaded update: quit and install. */
  updateQuitAndInstall: 'update:quit-and-install',
  /** Trigger an immediate update check (fire-and-forget; state flows back via updateChanged). */
  updateCheckNow: 'update:check-now',
  /** main → renderer push: update state changed (checking, available, downloading, ready). */
  updateChanged: 'update:changed'
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
  /** AI-gap: why Mikan kept this beside the task. Populated by the drafter; null otherwise. */
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
  /** AI-gap: candidate to-dos Mikan infers from the recent feed. `[]` until the
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

export interface MikanApi {
  pipeline: PipelineApi
  todos: TodoApi
  auth: AuthApi
  connectors: ConnectorsApi
  sync: SyncApi
  ui: UiApi
  update: UpdateApi
}

// --- Auto-updater (ROADMAP #12 — electron-updater via GitHub Releases) ----

export type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

/**
 * Snapshot of the auto-updater state pushed to the renderer via `update:changed`
 * and returned by `update:get-status`. The renderer surfaces a subtle "restart
 * to update" affordance only when `stage === 'ready'`.
 */
export interface UpdateStatus {
  stage: UpdateStage
  /** Version string of the available/downloaded update, or null if none found yet. */
  version: string | null
  /** Download progress 0–100, or null when not downloading. */
  progress: number | null
  /** Human-readable error message, or null when healthy. */
  error: string | null
}

export interface UpdateApi {
  /** Current updater snapshot. */
  getStatus: () => Promise<UpdateStatus>
  /** Quit the app and apply the downloaded update. Only meaningful when stage === 'ready'. */
  quitAndInstall: () => Promise<void>
  /** Trigger an immediate check; state flows back via onChanged. */
  checkNow: () => Promise<void>
  /** Subscribe to state changes; returns an unsubscribe fn. */
  onChanged: (cb: (status: UpdateStatus) => void) => () => void
}

// --- Token broker (ADR 0008 — Logto → per-user Turso DB provisioning) -----

/**
 * Response from the token broker service (services/token-broker).
 * Main fetches this at boot (when NEEME_SYNC_BROKER_URL is set), caches it in
 * safeStorage, and injects syncUrl + authToken into the worker env.
 */
export interface BrokerTokenResponse {
  /** libSQL sync URL for this user's Turso DB, e.g. libsql://<name>-<org>.turso.io */
  syncUrl: string
  /** Short-lived, DB-scoped Turso token. Expires at `expiresAt`. */
  authToken: string
  /** Unix timestamp (ms) when the token expires. Refresh ~60 s before this. */
  expiresAt: number
}

// --- Sync (ROADMAP #10 — cloud offload via Turso embedded replicas) -------

/**
 * Snapshot of the Turso embedded-replica sync state. Returned by `sync:get-status`
 * and used by a future settings UI to display a sync indicator.
 *
 * `enabled` mirrors NEEME_SYNC: false means sync is off and the other fields
 * reflect the last known state (or null). `lastSyncAt` is a Unix timestamp (ms).
 */
export interface SyncStatus {
  enabled: boolean
  lastSyncAt: number | null
  /** Wall-clock duration of the most recent completed sync in milliseconds. */
  lastSyncDurationMs: number | null
  syncing: boolean
  error: string | null
}

/**
 * User-facing sync settings, owned by main (not the worker). Separate from
 * {@link SyncStatus}, which reports the live replica state:
 *   - `enabled` is the persisted *intent* (the Settings toggle), which can be on
 *     even while the live replica is briefly down (offline, awaiting login).
 *   - `hasKey` is whether this device already has an at-rest encryption key
 *     (so the UI can offer "reveal recovery key").
 *   - `available` mirrors broker configuration: false in builds without
 *     NEEME_SYNC_BROKER_URL, where the toggle can't do anything useful.
 */
export interface SyncSettings {
  enabled: boolean
  hasKey: boolean
  available: boolean
}

export interface SyncApi {
  /** Current Turso embedded-replica sync status (request-response). */
  getStatus: () => Promise<SyncStatus>
  /** Trigger an immediate sync; resolves when complete. No-op when sync is disabled. */
  now: () => Promise<void>
  /** Read the user-facing sync settings (toggle intent + key presence + availability). */
  getSettings: () => Promise<SyncSettings>
  /** Turn the cloud replica on/off. Persists the pref and restarts the data worker. */
  setEnabled: (enabled: boolean) => Promise<SyncSettings>
  /** Reveal this device's 64-hex recovery key (to add another device), or null if none. */
  getRecoveryKey: () => Promise<string | null>
  /** Import a recovery key from another device. Replaces this device's key + restarts. */
  setRecoveryKey: (hex: string) => Promise<SyncSettings>
}
