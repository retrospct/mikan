import type { IncomingMessage, ServerResponse } from 'node:http'
import { serve } from 'inngest/node'
import { inngest } from '../src/inngest/client.js'
import { ingestPipeline } from '../src/inngest/functions/ingest-pipeline.js'

// Inngest serve endpoint — Vercel routes POST /api/inngest here.
// The Inngest Dev Server (pnpm inngest:dev) also hits this during local dev.
export const config = { maxDuration: 300 }

const handler = serve({
  client: inngest,
  functions: [ingestPipeline],
})

export default function (req: IncomingMessage, res: ServerResponse) {
  return handler(req, res)
}
