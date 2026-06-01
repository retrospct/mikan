# nimi — agent guide (monorepo root)

Nimi is an all-TypeScript, **on-device-first** personal-memory desktop app (Electron):
capture multi-modal input → surface it (semantic search + a daily focus list) to get
things done. This repo is the product. (The Python `neeme` repo is legacy.)

This is a **pnpm-workspace + turborepo monorepo** (ADR 0006). This file is the shared
spine; per-package guides add lane-specific detail.

## Repo layout

```
nimi/
  apps/
    desktop/        ← the Electron app (main · preload · renderer). Has its own CLAUDE.md.
  packages/
    contract/       ← @nimi/contract: the backend⇄UI contract (ipc + view-model types)
                      + the shared HTTP API client. Consumed from source.
  turbo.json        ← task graph (build · typecheck · dev)
  pnpm-workspace.yaml
  package.json      ← workspace root: turbo scripts, eslint, prettier
```

Future: `apps/mobile` (RN/Expo) joins later and shares `@nimi/contract` (ADR 0006 #14).

## Before you start (coordination)

Two agents work this repo in parallel. **Lanes:** backend/pipeline =
`apps/desktop/src/main/**` + `packages/contract/**`; frontend/UI =
`apps/desktop/src/renderer/**`. Before starting a task or rebasing:

1. Read **`docs/agent-sync/INBOX.md`** (directives for you — a `@all hold` overrides
   everything), **`docs/agent-sync/SYNC-BRIEF.md`** (branches, merge order, live conflicts),
   and **`docs/INTEGRATION.md`** (the backend⇄UI contract + swap map).
2. **Contract changes land in `packages/contract` first** — types are the boundary; the
   compiler enforces agreement there. Update `docs/INTEGRATION.md` in the same change.
3. Stay in your lane unless the contract says otherwise. Don't edit the other lane's files
   beyond what a shared-type change forces. For desktop-internal detail, read
   **`apps/desktop/CLAUDE.md`**.

## Architecture (process model)

```
renderer (sandboxed, no node) → preload (contextBridge) → main (thin router) → utilityProcess (DB + pipeline/todos + native)
```

- **Main is a router, not a Node server** — no business logic, DB, or network servers in it.
  New data capabilities go in the worker (`apps/desktop/src/main/worker`,
  `apps/desktop/src/main/services`), exposed over IPC. Heavy/native work (libSQL,
  transformers.js) lives in the utilityProcess.
- The renderer only ever touches `window.api.*`. See **`docs/SECURITY.md`**.

## Security invariants (non-negotiable)

Never set `sandbox:false`, `nodeIntegration:true`, `contextIsolation:false`, or
`webSecurity:false`. Never expose Node/`ipcRenderer` on `window` — only scoped methods via
`contextBridge`. Validate inputs at the IPC boundary. Full checklist: `docs/SECURITY.md`.

## The contract

- `@nimi/contract` lives in `packages/contract`. Import it as a workspace package:
  `import type { Task, Memory } from '@nimi/contract/views'`,
  `import { IPC } from '@nimi/contract/ipc'`, `import { getHealth } from '@nimi/contract/api'`.
- `packages/contract/src/views.ts` — the **view model** the UI renders (`Memory`/`Task`/
  `BacklogItem`/`FedItem`/`MatchHit`). `packages/contract/src/ipc.ts` — the `window.api.*`
  surface + channels.
- It's consumed **from .ts source** (no build step): electron-vite excludes it from
  externalization and bundles it; tsc resolves it via `paths`. Keep it free of Node/Electron
  imports so the renderer (and a future RN/Expo app) can use it.
- The worker projects its data model (`Item`/`Todo`/…) → the view model in
  `apps/desktop/src/main/services/project.ts`. That's the one place the **AI-gap** lives.
- **"Wire real, plain":** structural data is served for real; AI-generated fields
  (`brief`/`draft`/`note`, `gathering`→`drafted`) come back `null`/empty until the LLM layer
  lands, and the UI degrades gracefully.

## Verify before you PR

Run from the repo root (turbo fans out across packages):

```bash
pnpm typecheck   # turbo: @nimi/contract + desktop (tsc node + web) — must be green
pnpm build       # turbo: electron-vite main + worker, preload, renderer
pnpm lint        # eslint over the workspace; your changed files must be clean
```

- Scope to one package with `--filter`, e.g. `pnpm --filter @nimi/desktop build`.
- Pre-existing eslint debt lives in `packages/contract/src/api/generated/**` (hey-api
  output) — not yours.
- **No Electron runtime in CI/agents** → worker behavior (native `onnxruntime-node`, model
  download, libSQL vector search) needs a live `pnpm dev` smoke test before merge.
- Offline/dev fallback: `NEEME_EMBEDDER=hash pnpm dev` (skips the real model). `NEEME_*` and
  `VITE_*` are declared in `turbo.json` `globalEnv` so they pass through turbo's strict env.

## Stack & conventions

- libSQL (`@libsql/client`) + Drizzle ORM; native vector search (`vector32`, `vector_distance_cos`).
- Embeddings: transformers.js (MiniLM, 384-dim) behind the `Embedder` seam in
  `apps/desktop/src/main/pipeline/embed.ts`.
- Auth: Logto OIDC + PKCE in the system browser (ADR 0002), inert until configured.
- Git: branch off `main`; commit/push only when asked; PRs get a smoke-test note for worker changes.
- Decisions of record: `docs/adr/0001` (sync/processing), `0002` (auth), `0003` (all-TS
  on-device pipeline), `0004` (AI drafting model), `0005` (image/audio extraction),
  `0006` (monorepo structure).
