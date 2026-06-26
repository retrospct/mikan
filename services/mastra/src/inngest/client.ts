import { Inngest } from 'inngest'

// Inngest v4 dropped the client-level `schemas` (EventSchemas) option. Event
// payloads are now typed per-trigger via a Standard Schema (e.g. a Zod object)
// on the trigger itself — see ingest-pipeline.ts.
export const inngest = new Inngest({
  id: 'mikan'
})
