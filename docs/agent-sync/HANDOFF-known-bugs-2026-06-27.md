# Handoff: known bugs (2026-06-27)

A self-contained brief for a local agent. Each item has symptom → root cause → exact
locations → suggested fix → how to verify. Work them top-down (P0 first).

## Repo state you're starting from

- The **Nimi → Mikan rename is merged** (PR #97, `main`). All packages are `@mikan/*`,
  the renderer UI folder is `apps/desktop/src/renderer/src/mikan/`, and identifiers are
  `Mikan*` (e.g. `MikanApp`, `MikanMark`, `MikanApi`). The **`neeme` engine layer is
  intentionally NOT renamed** — `NEEME_*` env vars, `neeme.db`/`neeme-vec.db`, and the
  `nimi-extract` macOS helper stay as-is.
- **Rebuild before testing.** Bundle/scope names changed and `out/` + `services/mastra/.mastra/`
  on disk are stale. Run `pnpm install`, then `pnpm --filter @mikan/desktop build` before any
  run/e2e. Do NOT lint right after building (see AGENTS.md "Lint after build gotcha").
- Offline/deterministic env for all commands: `NEEME_EMBEDDER=hash` (+ `NEEME_EXTRACTOR=off`
  for capture). For the built-app E2E, build with the Logto vars unset (see AGENTS.md
  "Logto-gate gotcha").

---

## BUG 1 — P0 — `no such table: chunks` breaks the test suite + smoke

**Symptom**
- `pnpm --filter @mikan/desktop test` → **81 failures** (`LibsqlError: SQLITE_ERROR: no such table: chunks`), 187 pass.
- `pnpm --filter @mikan/desktop test:smoke` → crashes with the same error at `chunkCount`.

**Root cause**
The `chunks` table (the libSQL vector index) was moved to a **local-only** `neeme-vec.db`
accessed via `vecClient` in commit `00b72eb` (PR #86, "validate Phase 0 mobile…"). Two test
helpers were not updated and still query `chunks` on the **main** `client` (the synced
`neeme.db`), where the table no longer exists.

**Exact locations**
- `apps/desktop/test/helpers.ts` — `clearTables()` runs
  `DELETE FROM todo_ai; … DELETE FROM chunks; …` on `client` (the main DB). `chunks` is no
  longer in that DB.
- `apps/desktop/test/smoke/capture-file.ts` — `chunkCount()` (~L48) does
  `client.execute('SELECT count(*) … FROM chunks …')` on the main `client`.
- `vecClient` is exported from `apps/desktop/src/main/db/index.ts` (the local-only
  `neeme-vec.db` connection that actually owns `chunks`).

**Suggested fix**
Route `chunks` access to `vecClient`:
- In `helpers.ts`: remove `DELETE FROM chunks;` from the main `client.executeMultiple(...)`,
  import `vecClient`, and add `await vecClient.execute('DELETE FROM chunks')`.
- In `smoke/capture-file.ts`: change `chunkCount` to call `vecClient.execute(...)` instead of
  `client.execute(...)` (import `vecClient`).
- `chunks` is created lazily by `createChunksLocal()` inside `initDb()`, which the integration
  tests call in `beforeAll`, so the table exists before `clearTables()` runs. (If any path can
  clear before init, use `DROP TABLE IF EXISTS`-style tolerance or guard.)

**Verify**
- `pnpm --filter @mikan/desktop test` → all ~268 pass.
- `NEEME_EMBEDDER=hash NEEME_EXTRACTOR=off pnpm --filter @mikan/desktop test:smoke` → all checks pass.

---

## BUG 2 — P2 (latent footgun) — env flags are whitespace-fragile

**Symptom**
A behavioral flag set with stray trailing whitespace (e.g. `NEEME_DRAFTER="off "`) is silently
ignored. We hit this live: a padded `NEEME_DRAFTER` failed the `=== 'off'` check and, with an
Anthropic key present, ran the **real CloudDrafter** instead of the intended `NullDrafter`
(unexpected AI calls + "I spotted these to-dos" output). The injected value has since been
trimmed, so it's not currently firing — but the code is fragile to it.

**Root cause**
Strict equality on raw `process.env` values.

**Exact locations (strict comparisons to harden)**
- `apps/desktop/src/main/pipeline/draft.ts` — `process.env.NEEME_DRAFTER === 'off'`
- `apps/desktop/src/main/pipeline/embed.ts` — `process.env.NEEME_EMBEDDER === 'hash'`
- `apps/desktop/src/main/pipeline/ocr.ts` and `asr.ts` — `extMode === 'off' || extMode === 'portable'`
- `apps/desktop/src/main/services/pipeline-service.ts` — `process.env.NEEME_EXTRACTOR !== 'off'`

**Suggested fix**
Trim before comparing, e.g. `process.env.NEEME_DRAFTER?.trim() === 'off'`. Behavior-preserving
for clean values; immunizes against stray whitespace from any env source.

**Verify**
Set `NEEME_DRAFTER="off "` (trailing space) and confirm the drafter resolves to `NullDrafter`
(no Anthropic call). A small unit test around the seam selection would lock this in.

---

## BUG 3 — DEFERRED — MO-5: Settings "Check for updates" gives no feedback

Tracked in Linear **MO-5** (https://linear.app/retrospct/issue/MO-5). Clicking Settings →
Updates → "Check for updates" does nothing in dev/unpackaged builds: `window.api.update.checkNow()`
lands on a no-op dev stub in `apps/desktop/src/main/index.ts` (`ipcMain.handle(IPC.update…)`).
The menubar "Check for Updates…" item pops a native dialog; Settings should give equivalent
inline feedback.

> **Hold this one for now.** It touches the updater/main path, and we just merged the rename
> without a fresh packaged build — fix it only after a clean `pnpm install` + rebuild is
> confirmed green, to avoid chasing rename/build artifacts.

---

## KNOWN GAP (not a bug) — plaintext at rest (v1.1 W1)

`chunks` / `excerpt` / AI rows are stored and synced **unencrypted**. Flagged P1 in
`docs/agent-sync/INBOX.md` and `docs/ROADMAP.md § v1.1 (W1)`; details in
`docs/agent-sync/APP-GAPS.md`. Larger feature work, not a quick fix — listed here for awareness.

---

## Suggested order

1. **BUG 1** (unblocks the whole test suite — do this first so everything after is verifiable).
2. **BUG 2** (small, safe hardening).
3. Then pick up **MO-5** (after a clean rebuild) or **W1** per priority.
