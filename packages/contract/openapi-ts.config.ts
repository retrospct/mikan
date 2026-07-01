import { defineConfig } from '@hey-api/openapi-ts'

/**
 * Generates the typed Mikan API SDK from the committed `openapi.json` snapshot
 * (exported from the FastAPI backend in mr-matcha — see README "API client").
 *
 * Output is committed so desktop (and a future RN/Expo app) consume the client
 * without needing Python or codegen at install time. Regenerate with `pnpm gen:api`.
 *
 * The fetch client is bundled into @hey-api/openapi-ts (v0.73+), so no separate
 * client package is installed. Runtime config (base URL, auth) lives in
 * `src/api/client-config.ts` via `runtimeConfigPath` — that file survives
 * regeneration, the generated code does not. It must NOT import the generated
 * `client` (that would create an init cycle); the live-client wiring lives in
 * `src/api/runtime.ts`.
 *
 * Paths are relative to this package (`packages/contract`).
 */
export default defineConfig({
  input: './openapi.json',
  output: {
    path: 'src/api/generated',
    postProcess: ['prettier']
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/api/client-config.ts'
    }
  ]
})
