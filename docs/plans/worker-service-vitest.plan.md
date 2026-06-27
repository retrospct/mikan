---
todos:
  - id: harness
    status: completed
    content: Add vitest devDependency + test scripts to apps/desktop/package.json; add root test script and turbo.json test task
  - id: config-setup
    status: completed
    content: 'Create apps/desktop/vitest.config.ts (node env, setupFiles, include test/**) and apps/desktop/test/setup.ts (temp NEEME_USER_DATA dir, NEEME_EMBEDDER=hash, NEEME_DRAFTER=off, clearTables helper, teardown)'
  - id: tier-a-pure
    status: completed
    content: 'Write pure unit tests: chunk, extract, HashEmbedder, NullDrafter, project.ts projectors, rowToTaskDraft'
  - id: tier-b-pipeline
    status: completed
    content: 'Write pipeline-service integration tests: capture idempotency, search/match ranking, reindexAll, syncEmbedder no-op vs reindex'
  - id: tier-b-todo
    status: completed
    content: 'Write todo-service integration tests: cap-5 + CAP_REACHED, finish-list latch, plan carry-over/sweep, schedule cap, context pool surface/pin/dismiss/sort'
  - id: tier-b-draft
    status: completed
    content: 'Write draft-service integration tests: regenerate upsert with NullDrafter, inputsHash dedup no-op, read'
  - id: docs-verify
    status: completed
    content: 'Update ROADMAP #7 + add run-tests note to CLAUDE.md/AGENTS.md; run pnpm --filter @mikan/desktop test, typecheck, lint; fix eslint test glob if needed'
name: worker service vitest
overview: 'Add a vitest harness to @mikan/desktop and write unit + integration tests that guard the worker''s pipeline and todo logic (capture/search, cap-5 + latch, plan/carry-over, context pool, projection, AI-gap degradation), using the hash embedder and a temp libSQL DB so tests run with no Electron, no model, and no network.'
isProject: false
---
# Worker-service tests (vitest) — ROADMAP #7

Add a vitest test harness in `apps/desktop` and tests that guard the worker's pipeline/todo logic. Tests run in plain Node (no Electron) against the **hash embedder** + **null drafter** + a **temp libSQL file DB**, mirroring the documented `tsx` smoke in `AGENTS.md`.

## Key constraint: env is read at module load

Three singletons resolve from `process.env` **at import time**, so the env must be set before any worker module is imported:
- [`apps/desktop/src/main/db/index.ts`](apps/desktop/src/main/db/index.ts) builds `dbPath = join(userDataDir(), 'neeme.db')` at top level → requires `NEEME_USER_DATA` (`runtime/paths.ts` throws otherwise). Note `embed.ts` imports `EMBED_DIM` from `db`, so even "pure" embedder tests trigger this.
- [`embed.ts`](apps/desktop/src/main/pipeline/embed.ts): `NEEME_EMBEDDER=hash` → `HashEmbedder` (no ONNX/model).
- [`draft.ts`](apps/desktop/src/main/pipeline/draft.ts): `NEEME_DRAFTER=off` → `NullDrafter` (no network/key).

Solution: a vitest **setup file** (runs before each test file's own imports are evaluated) creates a unique temp dir via `mkdtempSync` and sets `NEEME_USER_DATA`, `NEEME_EMBEDDER=hash`, `NEEME_DRAFTER=off`. Vitest's default per-file isolation gives each test file its own module registry → its own libSQL singleton bound to its own temp DB. Tear down the temp dir in an `afterAll`/global teardown.

## Harness setup

- Add `vitest` (latest) to `devDependencies` in [`apps/desktop/package.json`](apps/desktop/package.json); add script `"test": "vitest run"` (and `"test:watch": "vitest"`).
- New [`apps/desktop/vitest.config.ts`](apps/desktop/vitest.config.ts): `test.environment = 'node'`, `test.setupFiles = ['./test/setup.ts']`, `test.include = ['test/**/*.test.ts']`, `globals: true`. `@mikan/contract/*` resolves through the package's `exports` map to `.ts` source (vite transforms it); add a `resolve.alias` to `packages/contract/src/*` only if resolution fails.
- New [`apps/desktop/test/setup.ts`](apps/desktop/test/setup.ts): set the three env vars to a fresh temp dir before tests; helper to clear tables between tests.
- Place all tests under `apps/desktop/test/` (NOT under `src/main/**`) so they stay out of the electron-vite build (explicit entries in [`electron.vite.config.ts`](apps/desktop/electron.vite.config.ts)) and out of the app `tsconfig.node.json` `include`.
- Root [`package.json`](package.json): add `"test": "turbo run test"`. [`turbo.json`](turbo.json): add a `test` task (`dependsOn: ["^build"]`, no persistent). `NEEME_*` is already in `globalEnv`.

## Tier A — pure unit tests (no DB writes)

- `test/pipeline/chunk.test.ts` — [`chunk.ts`](apps/desktop/src/main/pipeline/chunk.ts): empty/whitespace → `[]`; short text → single chunk; long text → overlapping windows (verify overlap continuity + coverage); `overlap >= maxChars` throws.
- `test/pipeline/extract.test.ts` — [`extract.ts`](apps/desktop/src/main/pipeline/extract.ts): `suffixOf`; `detectContentType` by extension, by MIME fallback, and `'other'` default; `extract('text', …)` UTF-8 decode + `pending` status on empty.
- `test/pipeline/embed.test.ts` — `HashEmbedder` directly: vector length = 384, deterministic for same input, L2 norm ≈ 1, shared tokens → smaller cosine distance than disjoint tokens.
- `test/pipeline/draft.test.ts` — `NullDrafter.draft` returns `status:'gathered'` with null fields + empty `why`.
- `test/services/project.test.ts` — [`project.ts`](apps/desktop/src/main/services/project.ts): `toMemory` kind/title/snip + truncation; `toFedItem` done-vs-pending status; `toMatchHits` best-chunk-per-item + closest-first sort + 0..1 clamp; `toTask` status precedence (`done` > `drafted` > `gathered`), `relMap`/`whyMap`/`pinned` derivation, AI-null degradation; `toBacklogItem` `conf` null without AI.
- `test/services/draft-service.test.ts` — `rowToTaskDraft`: JSON `draft` parse, bad-JSON fallback to null, `noteKind`/`status` mapping.

## Tier B — integration tests (temp DB + hash embedder)

Each file: `beforeAll(initDb)`, `beforeEach(clearTables)` (DELETE from `todo_ai`, `todo_context`, `todos`, `chunks`, `items`, `meta`).

- `test/services/pipeline-service.test.ts` — [`pipeline-service.ts`](apps/desktop/src/main/services/pipeline-service.ts): `captureText` idempotency (`created:true` then `created:false` for same bytes); `search`/`match` return hits ranked closest-first with best-chunk-per-item; `reindexAll` returns item count; `syncEmbedder` no-ops when `meta.embedder` matches and reindexes when it differs.
- `test/services/todo-service.test.ts` — [`todo-service.ts`](apps/desktop/src/main/services/todo-service.ts): `add` up to `CAP=5` then throws `CAP_REACHED`; latch (complete all 5 → `canAdd` true again); `plan` carries `keep` onto the day, sweeps the rest to backlog (`day=null`), and throws when `keep.length > CAP`; `schedule` respects the cap; context pool — capture items first, then `add`/`searchMoreContext` surfaces them; `pinContext`/`dismissContext` persist verdicts; `listContext` puts pinned first then sorts by score and excludes dismissed.
- `test/services/draft-service.test.ts` (integration portion) — `regenerate` with `NullDrafter` upserts a `todo_ai` row (`status:'gathered'`); second call with unchanged inputs is a no-op via `inputsHash`; `read` returns the row.

Context hits rely on the lexical hash embedder, so tests use captured text that shares words with the todo title to guarantee surfaced context.

## Docs

- Mark ROADMAP #7 as in-progress/shipped in [`docs/ROADMAP.md`](docs/ROADMAP.md) and add a one-line "run tests" note (`pnpm --filter @mikan/desktop test`) to [`apps/desktop/CLAUDE.md`](apps/desktop/CLAUDE.md) / `AGENTS.md` verify section.

## Verify

- `pnpm --filter @mikan/desktop test` green.
- `pnpm typecheck` + `pnpm lint` still green for app code (tests live outside `src/main`, so they don't enter the node/web typecheck; lint config may need a glob for `test/**` — confirm and add if eslint flags it).

## Risks / notes

- libSQL `file:` client runs fine in plain Node (the `AGENTS.md` `tsx` smoke proves it) — no Electron/native rebuild needed.
- `buildUserMessage`/`coerceTaskDraft` in `draft.ts` are not exported; covering them is optional and would require either exporting them or driving `CloudDrafter` with a mocked global `fetch`. Default scope: cover `NullDrafter` only; treat `CloudDrafter`/`LocalEmbedder` as out-of-scope (network/model).
