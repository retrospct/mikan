import type { CreateClientConfig } from './generated/client.gen'
import { getToken } from './token-store'

/**
 * Runtime config seam for the generated client (hey-api `runtimeConfigPath`).
 *
 * IMPORTANT: this file MUST NOT import the generated `client` value. The
 * generated `client.gen.ts` imports `createClientConfig` from here at
 * module-evaluation time (to build the initial client singleton). If this file
 * imported `client` back, that cycle would hit a temporal dead zone and crash
 * with "Cannot access 'createClientConfig' before initialization". The
 * live-client wiring (`configureClient`) therefore lives in `runtime.ts`, which
 * is free to import `client`.
 *
 * t3-turbo pattern: the shared package holds zero URL/auth config; each app sets
 * its own values at startup via `configureClient()`.
 *
 * Plain `fetch` only — no Electron/Node/Vite imports — so this stays reusable
 * across the desktop renderer, React Native, and any future surface.
 */

let _baseUrl: string = 'http://localhost:8000'
let _getToken: () => string | undefined = () => getToken()

export function buildClientConfig(
  config: Parameters<CreateClientConfig>[0] = {}
): ReturnType<CreateClientConfig> {
  return {
    ...config,
    baseUrl: _baseUrl,
    auth: () => _getToken()
  }
}

/** Update the module-level base URL + token getter. Does not touch the client. */
export function setClientOptions(opts: {
  baseUrl?: string
  getToken?: () => string | undefined
}): void {
  if (opts.baseUrl !== undefined) {
    const baseUrl = opts.baseUrl.trim()
    if (baseUrl) _baseUrl = baseUrl
  }
  if (opts.getToken !== undefined) _getToken = opts.getToken
}

// Called by the generated client on initialization (hey-api runtimeConfigPath).
export const createClientConfig: CreateClientConfig = (config) => buildClientConfig(config)
