import type { CreateClientConfig } from './generated/client.gen'
import { client } from './generated/client.gen'
import { getToken } from './token-store'

/**
 * Runtime configuration for the generated Nimi API client.
 *
 * t3-turbo pattern: the shared package holds zero URL/auth config.
 * Each app calls `configureClient()` at startup with its own env var:
 *   - Desktop (electron-vite): import.meta.env.VITE_NEEME_API_URL
 *   - Mobile (Expo): process.env.EXPO_PUBLIC_NEEME_API_URL (+ LAN fallback)
 *
 * Plain `fetch` only — no Electron/Node/Vite imports — so this stays
 * reusable across desktop renderer, React Native, and any future surface.
 */

let _baseUrl: string = 'http://localhost:8000'
let _getToken: () => string | undefined = () => getToken()

/** Call once at app startup, before any API calls are made. */
export function configureClient(opts: {
  baseUrl?: string
  getToken?: () => string | undefined
}): void {
  if (opts.baseUrl !== undefined) _baseUrl = opts.baseUrl
  if (opts.getToken !== undefined) _getToken = opts.getToken

  client.setConfig({
    baseUrl: _baseUrl,
    auth: () => _getToken()
  })
}

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: _baseUrl,
  auth: () => _getToken()
})
