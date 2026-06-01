import { defineConfig } from '@hey-api/openapi-ts'

/**
 * Generates the typed Nimi API SDK from the committed `openapi.json` snapshot
 * (exported from the FastAPI backend in mr-matcha — see README "API client").
 *
 * Output is committed so desktop (and a future RN/Expo app) consume the client
 * without needing Python or codegen at install time. Regenerate with `pnpm gen:api`.
 *
 * The fetch client is bundled into @hey-api/openapi-ts (v0.73+), so no separate
 * client package is installed. Runtime config (base URL, auth) lives in
 * `src/shared/api/runtime.ts` via `runtimeConfigPath` — that file survives
 * regeneration, the generated code does not.
 */
export default defineConfig({
  input: './openapi.json',
  output: {
    path: 'src/shared/api/generated',
    postProcess: ['prettier']
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/shared/api/runtime.ts'
    }
  ]
})
