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
  // Auth (Logto OIDC flow lives in main; see src/main/auth/logto.ts)
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authGetToken: 'auth:get-token',
  authGetState: 'auth:get-state',
  /** main → renderer event: auth state / token changed (login, refresh, logout). */
  authChanged: 'auth:changed'
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

/** Capture + surface, backed by the on-device pipeline in the main process. */
export interface PipelineApi {
  /** Quick text capture → returns the item (+ whether it was newly created). */
  captureText: (text: string, name?: string) => Promise<CaptureResult>
  /** Semantic search over captured content. */
  search: (query: string, topK?: number) => Promise<SearchHit[]>
  /** Recently captured items (newest first). */
  listItems: () => Promise<Item[]>
}

export interface NeemeApi {
  memory: MemoryApi
  pipeline: PipelineApi
  auth: AuthApi
}
