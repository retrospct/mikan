# neeme-desktop — agent guide

Neeme is an all-TypeScript, **on-device-first** personal-memory desktop app (Electron):
capture multi-modal input → surface it (semantic search + a daily focus list) to get
things done. This repo is the product. (The Python `neeme` repo is legacy.)

## Before you start (coordination)

Two agents work this repo in parallel. **Lanes:** backend/pipeline = `src/main/**` +
`src/shared/**`; frontend/UI = `src/renderer/**`. Before starting a task or rebasing:

1. Read **`docs/agent-sync/INBOX.md`** (directives for you — a `@all hold` overrides
   everything), **`docs/agent-sync/SYNC-BRIEF.md`** (branches, merge order, live conflicts),
   and **`docs/INTEGRATION.md`** (the backend⇄UI contract + swap map).
2. **Contract changes land in `src/shared` first** — types are the boundary; the compiler
   enforces agreement there. Update `docs/INTEGRATION.md` in the same change.
3. Stay in your lane unless the contract says otherwise. Don't edit the other lane's files
   beyond what a shared-type change forces.

## Architecture (process model)

```
renderer (sandboxed, no node) → preload (contextBridge) → main (thin router) → utilityProcess (DB + pipeline/todos + native)
```

- **Main is a router, not a Node server** — no business logic, DB, or network servers in it.
  New data capabilities go in the worker (`src/main/worker`, `src/main/services`), exposed
  over IPC. Heavy/native work (libSQL, transformers.js) lives in the utilityProcess.
- The renderer only ever touches `window.api.*`. See **`docs/SECURITY.md`**.

## Security invariants (non-negotiable)

Never set `sandbox:false`, `nodeIntegration:true`, `contextIsolation:false`, or
`webSecurity:false`. Never expose Node/`ipcRenderer` on `window` — only scoped methods via
`contextBridge`. Validate inputs at the IPC boundary. Full checklist: `docs/SECURITY.md`.

## The contract

- `src/shared/views.ts` — the **view model** the UI renders (`Memory`/`Task`/`BacklogItem`/
  `FedItem`/`MatchHit`). `src/shared/ipc.ts` — the `window.api.*` surface + channels.
- The worker projects its data model (`Item`/`Todo`/…) → the view model in
  `src/main/services/project.ts`. That's the one place the **AI-gap** lives.
- **"Wire real, plain":** structural data is served for real; AI-generated fields
  (`brief`/`draft`/`note`, `gathering`→`drafted`) come back `null`/empty until the LLM layer
  lands, and the UI degrades gracefully.

## Verify before you PR

```bash
pnpm typecheck   # tsc node + web — must be green
pnpm build       # electron-vite: main + worker, preload, renderer
pnpm lint        # eslint; your changed files must be clean
```

- Pre-existing eslint debt lives in `src/shared/api/generated/**` (hey-api output) — not yours.
- **No Electron runtime in CI/agents** → worker behavior (native `onnxruntime-node`, model
  download, libSQL vector search) needs a live `pnpm dev` smoke test before merge.
- Offline/dev fallback: `NEEME_EMBEDDER=hash pnpm dev` (skips the real model).

## Stack & conventions

- libSQL (`@libsql/client`) + Drizzle ORM; native vector search (`vector32`, `vector_distance_cos`).
- Embeddings: transformers.js (MiniLM, 384-dim) behind the `Embedder` seam in `src/main/pipeline/embed.ts`.
- Auth: Logto OIDC + PKCE in the system browser (ADR 0002), inert until configured.
- Git: branch off `main`; commit/push only when asked; PRs get a smoke-test note for worker changes.
- Decisions of record: `docs/adr/0001` (sync/processing), `0002` (auth), `0003` (all-TS on-device pipeline).
