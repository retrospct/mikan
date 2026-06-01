/**
 * In-memory bearer-token holder for the API client's auth seam.
 *
 * No Electron/Node imports — this module works unchanged in the renderer, in
 * React Native / Expo, and in tests. The renderer hydrates it over IPC from the
 * main process, which runs the Logto OIDC flow and holds the real tokens in the
 * OS keychain (`safeStorage`). The generated HTTP client reads `getToken()`
 * lazily per request via `runtime.ts`, so a late `setToken()` (login / refresh)
 * takes effect with no client re-init.
 *
 * Today, with no Logto config, nothing calls `setToken()`, so `getToken()`
 * returns `undefined` and no Authorization header is attached — the app works
 * fully unauthenticated (local-first; auth is deferred behind sync, see
 * docs/adr/0002-authentication.md).
 */
let current: string | undefined

export function getToken(): string | undefined {
  return current
}

export function setToken(token: string | undefined): void {
  current = token
}

export function clearToken(): void {
  current = undefined
}
