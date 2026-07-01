# mikan — agent guide (monorepo root)

See **`CLAUDE.md`** for the full shared spine (architecture, contract, verify steps, security).

## Cursor Cloud specific instructions

### Services (this repo)

| Service                       | Required for dev? | Notes                                                                            |
| ----------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| **Electron app** (`pnpm dev`) | Yes               | Starts main + preload + renderer (Vite `:5173`) + data **utilityProcess** worker |
| **neeme FastAPI** (`:8000`)   | No                | Sibling repo; only if testing `@mikan/contract/api` HTTP client                   |
| **Logto OIDC**                | No                | Inert until `MAIN_VITE_LOGTO_*` env is set                                       |

### Verify (no runtime)

From repo root: `pnpm typecheck` (green), `pnpm build` (green), `pnpm lint`, `pnpm test`. Pre-existing ESLint failures in `packages/contract/src/api/generated/**` are expected (hey-api output); `pnpm lint` over the whole workspace also currently reports pre-existing `services/**` errors, so it exits non-zero — only your changed files need to be clean.

> **Lint after build gotcha:** `pnpm build` writes the gitignored, regenerable
> `services/mastra/.mastra/` bundles (multi-MB `.mjs`). They are **not** in
> `eslint.config.mjs`'s ignore list, so running `pnpm lint` *after* a build makes
> ESLint type-lint those giant files — ~20 min runtime that ends in
> `RangeError: Invalid string length` (the `stylish` formatter overflows). Lint
> *before* building, or `rm -rf services/mastra/.mastra` first; a clean `pnpm lint`
> then finishes in ~6 s and reports only the pre-existing debt (exit 1).

`pnpm test` fans out to `@mikan/desktop` vitest: 269 tests, all passing, in plain Node (no Electron, no model download). Covers pipeline unit tests + integration tests for pipeline-service / todo-service / draft-service / uncover-service against a temp libSQL DB with `NEEME_EMBEDDER=hash` + `NEEME_DRAFTER=off`.

### Run the desktop app

```bash
NEEME_EMBEDDER=hash pnpm dev
```

Use `NEEME_EMBEDDER=hash` in cloud/CI VMs to skip ONNX model download and `onnxruntime-node` at runtime. The renderer is also reachable at `http://localhost:5173/` during dev (Vite HMR); `window.api` is only available inside Electron.

**Electron binary:** If `pnpm dev` fails with `Error: Electron uninstall`, the Electron download did not complete. Fix with `node node_modules/electron/install.js` (from repo root), then retry `pnpm dev`.

**Display:** Electron needs X11 (`DISPLAY` is usually `:1` in this environment). Harmless `dbus` errors in logs are normal without a session bus.

**Worker / DB:** On successful boot, main forks the `neeme-data` utilityProcess and creates `neeme.db` under Electron `userData` (Linux: `~/.config/@mikan/desktop/neeme.db`). In Electron, renderer data flows through `apps/desktop/src/renderer/src/mikan/api.ts` to the real `window.api.pipeline.*` / `window.api.todos.*` IPC surface; the in-memory `mock.ts` is only the plain-browser preview fallback.

### Data-layer smoke (optional, no Electron UI)

```bash
mkdir -p /tmp/mikan-smoke
cd apps/desktop
NEEME_USER_DATA=/tmp/mikan-smoke NEEME_EMBEDDER=hash pnpm exec tsx -e "
import { initDb } from './src/main/db/index.ts';
import { pipelineService } from './src/main/services/pipeline-service.ts';
(async () => {
 await initDb();
 const cap = await pipelineService.captureText('smoke', 'test');
 console.log('capture', cap.memory.id);
 console.log('search', await pipelineService.match('smoke', 3));
})();
"
```

### Capture tests (`captureFile` pipeline + UX)

Two committed tiers under `apps/desktop/test/` (fixtures in `test/fixtures/`). Both pin
`NEEME_EMBEDDER=hash` (offline) and `NEEME_EXTRACTOR=off` (deterministic image→`pending`).

```bash
# Tier 1 — headless pipeline (no Electron, no display): capture → extract → index → search
pnpm --filter @mikan/desktop test:smoke

# Tier 2 — Playwright Electron E2E (real picker + drag-drop → IPC → worker → DB).
# Launches the BUILT app, so build first. Electron _electron needs no browser download.
pnpm --filter @mikan/desktop build && pnpm --filter @mikan/desktop test:e2e
```

The E2E reads ground truth back through `window.api.pipeline.archive()` (the app's own DB
connection — a separate SQLite reader hits WAL-visibility races). It launches with
`--user-data-dir=<tmp>` for an isolated throwaway DB.

> **Logto-gate gotcha (cloud agents with secrets):** `electron-vite build` inlines
> `MAIN_VITE_*` env at build time. When `MAIN_VITE_LOGTO_ENDPOINT` + `MAIN_VITE_LOGTO_APP_ID`
> are present (they're injected as Cloud Agent secrets here), the **built** app boots behind
> the Logto sign-in gate, so `.nav` never appears and every `_electron` spec times out in
> `launchBuiltApp` (`waiting for locator('.nav')`). `pnpm dev` is unaffected. To run the E2E
> tier / a built-app smoke in this environment, build with those vars unset, e.g.
> `env -u MAIN_VITE_LOGTO_ENDPOINT -u MAIN_VITE_LOGTO_APP_ID -u MAIN_VITE_LOGTO_RESOURCE pnpm --filter @mikan/desktop build`
> then run `test:e2e` (also with them unset). All 7 specs pass once unconfigured.

### Sync + encryption-at-rest tests (#10)

Opt-in Turso sync with mandatory field encryption. Full procedure:
**`docs/testing/sync-encryption-runbook.md`**.

```bash
# Tier 1 — gate check (no creds): NEEME_SYNC=on without a valid key must stay local
pnpm --filter @mikan/desktop test:smoke:sync

# Tier 2 — live two-device replica loop (needs a Turso DB; key is REQUIRED)
NEEME_SYNC=on NEEME_SYNC_URL=libsql://<db>.turso.io \
NEEME_SYNC_AUTH_TOKEN=<token> NEEME_SYNC_ENCRYPTION_KEY=<64-hex> \
pnpm --filter @mikan/desktop test:smoke:sync
```

Sync **fails closed**: `NEEME_SYNC=on` enables sync only with a valid 64-hex
`NEEME_SYNC_ENCRYPTION_KEY`, so plaintext is never written to the cloud primary. See
`docs/setup/turso-credentials.md` for Turso setup (and use Cloud Agents → Secrets for the
four env vars when running as a cloud agent).

### Tier 3 — packaged installer on a second computer (Mac/Windows)

```bash
pnpm --filter @mikan/desktop build:mac    # → apps/desktop/dist/mikan-<ver>.dmg
pnpm --filter @mikan/desktop build:win    # → dist/mikan-<ver>-setup.exe (build ON Windows)
```

Unsigned: macOS → right-click **Open** (or `xattr -dr com.apple.quarantine /Applications/Mikan.app`);
Windows SmartScreen → **More info → Run anyway**. Packaged userData/DB: macOS
`~/Library/Application Support/Mikan/neeme.db`, Windows `%APPDATA%\Mikan\neeme.db`.

> The preload **must** stay bundled (not externalized) — sandboxed preloads can't
> `require()` npm modules, so `@electron-toolkit/preload` is in `electron.vite.config.ts`'s
> externalize `exclude` list. Without it the packaged app's `window.api` silently fails and
> the renderer falls back to mock data.

### GUI feature tests (uncovered-todos and other AI-inferred UI)

Features that require `NEEME_ANTHROPIC_KEY` + a display are covered by runbooks in
`docs/testing/`. Run them using a GUI-capable cloud agent.

| Runbook                                       | Feature                           | Needs                                        |
| --------------------------------------------- | --------------------------------- | -------------------------------------------- |
| `docs/testing/uncovered-todos-gui-runbook.md` | Feed → "I spotted these to-dos"   | `NEEME_ANTHROPIC_KEY`, `DISPLAY`             |
| `docs/testing/csp-smoke-runbook.md`           | CSP hardening + local fonts (#11) | `DISPLAY` (deterministic tier needs neither) |

Runbooks follow `docs/testing/RUNBOOK-TEMPLATE.md`; the `gui-smoke` skill
(`.cursor/skills/gui-smoke/SKILL.md`) is the SOP for running them + capturing
artifacts. The deterministic tier (`pnpm --filter @mikan/desktop test:e2e` under
Xvfb) runs automatically on PRs via `.github/workflows/e2e-smoke.yml`; see
`docs/testing/automation-setup.md` for wiring an auto-launched cloud agent for the
visual tier.

### Scoped commands

- Desktop only: `pnpm --filter @mikan/desktop dev|build|typecheck|test`
- See root `README.md` and `CLAUDE.md` for monorepo layout and agent lanes (`docs/agent-sync/INBOX.md`).
