import { client } from './generated/client.gen'
import { buildClientConfig, setClientOptions } from './client-config'

/**
 * Live-client configuration for the generated Mikan API client.
 *
 * The actual config seam (`createClientConfig`, base URL + auth state) lives in
 * `client-config.ts`, which the generated client imports at module-eval time.
 * This file holds the part that touches the live `client` singleton — kept
 * separate so `client-config.ts` never imports `client` and the two modules
 * don't form an initialization cycle.
 *
 * t3-turbo pattern: the shared package holds zero URL/auth config.
 * Each app calls `configureClient()` at startup with its own env var:
 *   - Desktop (electron-vite): import.meta.env.VITE_NEEME_API_URL
 *   - Mobile (Expo): process.env.EXPO_PUBLIC_NEEME_API_URL (+ LAN fallback)
 */

/** Call once at app startup, before any API calls are made. */
export function configureClient(opts: {
  baseUrl?: string
  getToken?: () => string | undefined
}): void {
  setClientOptions(opts)
  client.setConfig(buildClientConfig())
}
