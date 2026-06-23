import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

// Spike: returns mock data. Phase 1 wires this to the real Turso DB
// via @libsql/client using the same query the desktop uses.
export const searchMemoriesTool = createTool({
  id: 'search-memories',
  description:
    "Search the user's personal memory store for captures relevant to a query. " +
    'Returns ranked results with excerpts and relevance scores.',
  inputSchema: z.object({
    query: z.string().describe('Natural-language search query'),
    limit: z.number().int().min(1).max(20).optional().default(5),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        score: z.number(),
        sourceName: z.string().optional(),
        contentType: z.enum(['text', 'image', 'audio', 'pdf', 'email', 'calendar', 'other']),
      })
    ),
  }),
  execute: async ({ context }) => {
    // TODO(phase-1): replace with real libSQL cosine-distance search
    // import { createClient } from '@libsql/client'
    // const db = createClient({ url: process.env.TURSO_DB_URL!, authToken: process.env.TURSO_DB_TOKEN! })
    // const embedding = await embed(context.query)
    // const rows = await db.execute(`SELECT ... ORDER BY vector_distance_cos(...) LIMIT ?`, [context.limit])
    return {
      results: [
        {
          id: 'mock-1',
          text: `[spike] relevant memory for: "${context.query}"`,
          score: 0.91,
          sourceName: 'mock-capture.txt',
          contentType: 'text' as const,
        },
      ],
    }
  },
})
