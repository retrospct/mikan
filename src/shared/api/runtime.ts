import type { CreateClientConfig } from './generated/client.gen'

/**
 * Runtime configuration for the generated Neeme API client.
 *
 * hey-api calls this before constructing the client, so it's the right place
 * for values the generated code can't hardcode. It survives `pnpm gen:api`
 * (the generated files do not). Plain `fetch` only — no Electron/Node imports —
 * so this same client is reusable as-is in React Native / Expo later.
 */
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  // Base URL from env; defaults to the local `neeme serve` address.
  baseUrl: import.meta.env.VITE_NEEME_API_URL ?? 'http://localhost:8000',
  // Auth seam: returns the bearer token once auth exists. `undefined` today
  // means no Authorization header is attached — wired now, no rework later.
  auth: () => getAuthToken()
})

/**
 * Placeholder token source. Returns `undefined` until auth/identity is built.
 * When tokens land, read from wherever they're stored (e.g. an in-memory store
 * hydrated over IPC from Electron `safeStorage`) and return the bearer string.
 */
function getAuthToken(): string | undefined {
  return undefined
}
