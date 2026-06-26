# @mikan/mastra — agent guide

Phase 0 spike: Mastra agent + Inngest durable pipeline on Vercel. Read the root `CLAUDE.md` first.

## What this is

Two spikes in one service:

1. **Mastra agent** (`src/agents/nimi-agent.ts`) — the Mikan AI agent with tool calls (search memories, add todo). Uses Anthropic via the **Vercel AI Gateway** (AI SDK v6 `gateway` provider; model resolution centralized in `src/model.ts`). Runs locally with `pnpm dev` (`mastra dev`).

2. **Inngest pipeline** (`src/inngest/functions/ingest-pipeline.ts`) — durable multi-step ingestion (extract → chunk → brief via `step.ai.infer()`). Runs locally with `pnpm inngest:dev` alongside `pnpm dev`.

## Local dev

```bash
cp .env.example .env.local
# fill in AI_GATEWAY_API_KEY (Vercel AI Gateway token)

pnpm dev            # starts Mastra dev server + playground at http://localhost:4111
pnpm inngest:dev    # in a second terminal — Inngest dev server at http://localhost:8288
```

Visit http://localhost:4111 to chat with the Mikan agent in the Mastra playground.
Visit http://localhost:8288 to inspect Inngest function runs.

## Vercel deployment

```bash
pnpm build          # mastra build → .vercel/output/
vercel deploy       # uploads .vercel/output/ as serverless functions
```

Set these env vars in the Vercel project:
- `AI_GATEWAY_API_KEY` (agent + pipeline LLM calls route through the AI Gateway)
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

## Structure

```
src/
  mastra.ts                          ← Mastra instance (entry point for mastra build)
  model.ts                           ← AI Gateway model resolution (shared by agent + pipeline)
  agents/nimi-agent.ts               ← Mikan agent: instructions + model + tools
  tools/search-memories.ts           ← mock tool (Phase 1: real libSQL cosine search)
  tools/add-todo.ts                  ← mock tool (Phase 1: real Turso insert)
  inngest/client.ts                  ← Inngest client singleton
  inngest/functions/ingest-pipeline.ts ← durable pipeline with step.ai.infer()
api/
  inngest.ts                         ← serves Inngest functions (Vercel route)
```

## Phase 1 TODO

- [ ] Wire `search-memories` tool to real Turso DB (libSQL cosine search)
- [ ] Wire `add-todo` tool to real Turso DB (Drizzle insert)
- [ ] Add `pin-context` and `dismiss-context` tools
- [ ] Replace mock embedding in pipeline with real MiniLM via Voyage AI / AI Gateway
- [ ] Add OCR/ASR step to `ingest-pipeline` (Cloudflare AI or on-device offload)
- [ ] Add Mastra Memory (LibSQLStore) so agent remembers across sessions
