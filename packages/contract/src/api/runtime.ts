import type { CreateClientConfig } from './generated/client.gen'
import { getToken } from './token-store'

/**
 * Runtime configuration for the generated Nimi API client.
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
  // Auth seam: hey-api calls `auth` per request, so the token can be hydrated
  // lazily. `token-store` holds the bearer in memory, populated over IPC from the
  // main-process Logto flow (`src/main/auth/logto.ts`). `undefined` today (no
  // login) means no Authorization header — the local-first app stays unauthenticated.
  auth: () => getToken()
})
