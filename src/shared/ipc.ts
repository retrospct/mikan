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
  // Auth (Logto OIDC flow lives in main; see src/main/auth/logto.ts)
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authGetToken: 'auth:get-token',
  authGetState: 'auth:get-state',
  /** main → renderer event: auth state / token changed (login, refresh, logout). */
  authChanged: 'auth:changed'
} as const

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

export interface NeemeApi {
  memory: MemoryApi
  auth: AuthApi
}
