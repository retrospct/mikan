/**
 * Local dev server entry point.
 * Run with: pnpm dev (which calls: tsx watch src/index.ts)
 *
 * For Vercel deployment, use api/token.ts instead — it imports createApp()
 * directly without starting a Node HTTP server.
 */
import { serve } from '@hono/node-server'
import { createApp, REQUIRED_ENV } from './app'

const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.warn(`[broker] Warning: missing env vars: ${missing.join(', ')}`)
  console.warn('[broker] /token will error; /health will report 503')
}

const app = createApp()
const port = parseInt(process.env.PORT ?? '3100', 10)
serve({ fetch: app.fetch, port })
console.log(`[broker] Listening on http://localhost:${port}`)
