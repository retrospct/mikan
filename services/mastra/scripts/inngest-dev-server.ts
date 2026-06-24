// Local dev endpoint that serves the Inngest functions for `pnpm inngest:dev`.
//
// In production the functions are served by `api/inngest.ts` as a Vercel
// serverless route. Locally, `mastra dev` does NOT serve that route, so the
// Inngest Dev Server has nothing to register against. This tiny Node server
// fills that gap: it exposes the same `serve()` handler at /api/inngest so the
// dev server (pointed here via -u) can sync and invoke the pipeline.
//
// Run: tsx scripts/inngest-dev-server.ts   (port via INNGEST_DEV_PORT, default 3939)
import { createServer } from 'node:http'
import { serve } from 'inngest/node'
import { inngest } from '../src/inngest/client.js'
import { ingestPipeline } from '../src/inngest/functions/ingest-pipeline.js'

const handler = serve({ client: inngest, functions: [ingestPipeline] })
const port = Number(process.env.INNGEST_DEV_PORT ?? 3939)

createServer((req, res) => {
  void handler(req, res)
}).listen(port, () => {
  console.log(`[inngest] dev endpoint ready: http://localhost:${port}/api/inngest`)
})
