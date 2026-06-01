# Nimi roadmap

Shared punch list. **Baseline:** `main` @ #12–#15 merged. Lanes: **back** = `apps/desktop/src/main` + `packages/contract`; **front** = `apps/desktop/src/renderer`.

## Shipped

- **Monorepo migration (#0):** flat → `apps/desktop` + `packages/contract` (`@nimi/contract`), pnpm workspaces + turborepo. See [ADR 0006](adr/0006-repo-structure.md).
- On-device pipeline: capture → content-hash store → extract → chunk → embed → libSQL vector search.
- Real on-device embedder (transformers.js / MiniLM) behind a swappable seam.
- Daily focus todos: cap-5 + finish-the-list latch, plan/carry-over, per-todo context pool (surface / pin / dismiss).
- View-model IPC contract, `window.api.*`, projection layer (`apps/desktop/src/main/services/project.ts`).
- Electron security posture (sandbox / context-isolation / no-node, utilityProcess, nav lockdown) + tray-anchored frameless window.
- Scaffold: auth (Logto, inert until configured).
- AI drafting layer: `Drafter` seam + `CloudDrafter` (Anthropic BYO-key via `NEEME_ANTHROPIC_KEY`). All AI-gap fields (`brief`/`draft`/`note`/`noteKind`/`gathering→drafted`/`BacklogItem.conf`/per-context `whyMap`) backed; degrade to null without a key. Override model with `NEEME_DRAFTER_MODEL`.
- Feed view + uncovered-todos: the Feed tab streams real captures (`pipeline.feed()`) and surfaces to-dos Nimi infers from the recent feed (`Drafter.uncover()` → `pipeline.uncoverTodos()`), cached in `meta`, "Add to backlog" wired. Degrades to no suggestions without a key.

## Punch list

> **#0 monorepo migration — ✅ DONE** (see Shipped). Paths: `apps/desktop/src/…`; contract = `packages/contract` (`@nimi/contract`). Everything below branches off the already-monorepo'd `main`.

| #   | Item                                                                                                     | Lane         | Unblocks                                         | Size | When       |
| --- | -------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------ | ---- | ---------- |
| 0   | ~~**Monorepo migration**~~ ✅ **done**                                                                    | back/struct  | a clean root everyone branches off; unblocks #14 | M    | ✅ shipped  |
| 1   | Smoke-test integrated main (embedder + tray actually run)                                                | human        | confidence in the baseline                       | S    | now        |
| 2   | **Wire UI → `window.api`** (retire mock `data.ts`; see `INTEGRATION.md`)                                 | front        | the app runs on real data — the headline         | L    | **P0**     |
| 3   | ~~AI drafting layer (LLM → `brief`/`draft`/`note`, `gathering→drafted`, backlog `conf`, the "why" strings)~~ ✅ | back         | every AI-gap field                               | L    | ✅ shipped  |
| 4   | `captureFile` over IPC + capture UX (drag-drop / picker)                                                 | back + front | capturing PDFs/files, not just typed notes       | M    | P1         |
| 5   | Image + audio extraction (OCR / transcription)                                                           | back         | screenshots & voice memos as memories            | M–L  | P1 ⚠️      |
| 6   | ~~Feed view + uncovered-todos (Nimi proposes todos from the feed)~~ ✅ **done**                            | back + front | the `FedItem` / `UncoveredTodo` surfaces         | M    | ✅ shipped  |
| 7   | Worker-service tests (vitest)                                                                            | back         | guards pipeline/todo logic                       | M    | P1         |
| 8   | Connectors / ingest (email, calendar, …)                                                                 | back         | automatic capture vs manual                      | L    | P2         |
| 9   | Auth wired end-to-end (Logto configured, login tested)                                                   | back + front | real accounts                                    | M    | P2         |
| 10  | Sync / cloud offload (Turso), multi-user                                                                 | back         | multi-device                                     | L    | P3         |
| 11  | Vuln cleanup + CSP tighten                                                                               | back         | the dependabot alerts + hardening                | S    | P1 (quick) |
| 12  | Auto-updater (electron-updater)                                                                          | back/dist    | testers auto-get each pushed build               | M    | P1         |
| 13  | Package macOS (build + notarize) + Windows canary                                                        | back/dist    | shipping signed builds to testers                | M    | P1         |
| 14  | Start an RN + Expo app in-repo (`apps/mobile`, mobile companion)                                         | mobile       | the mobile surface                               | L    | P2         |

## Decisions gating work

- **AI model (gates #3):** → [ADR 0004](adr/0004-ai-drafting-model.md) _(accepted: cloud BYO-key behind a `Drafter` seam)_
- **OCR / ASR (gates #5):** → [ADR 0005](adr/0005-image-audio-extraction.md) _(proposed: on-device default, macOS-native fast path)_
- **Repo structure (gates #14):** → [ADR 0006](adr/0006-repo-structure.md) _(accepted: monorepo NOW — ✅ done)_
