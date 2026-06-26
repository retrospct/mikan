# nimi — agent guide (monorepo root)

See **`CLAUDE.md`** for the full shared spine (architecture, contract, verify steps, security).

## Cursor Cloud specific instructions

### Services (this repo)

| Service | Required for dev? | Notes |
|--------|-------------------|--------|
| **Electron app** (`pnpm dev`) | Yes | Starts main + preload + renderer (Vite `:5173`) + data **utilityProcess** worker |
| **neeme FastAPI** (`:8000`) | No | Sibling repo; only if testing `@mikan/contract/api` HTTP client |
| **Logto OIDC** | No | Inert until `MAIN_VITE_LOGTO_*` env is set |

### Verify (no runtime)

From repo root: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test`. Pre-existing ESLint failures in `packages/contract/src/api/generated/**` are expected (hey-api output).

`pnpm test` fans out to `@mikan/desktop` vitest: 158 tests in plain Node (no Electron, no model download). Covers pipeline unit tests + integration tests for pipeline-service / todo-service / draft-service / uncover-service against a temp libSQL DB with `NEEME_EMBEDDER=hash` + `NEEME_DRAFTER=off`.

### Run the desktop app

```bash
NEEME_EMBEDDER=hash pnpm dev
```

Use `NEEME_EMBEDDER=hash` in cloud/CI VMs to skip ONNX model download and `onnxruntime-node` at runtime. The renderer is also reachable at `http://localhost:5173/` during dev (Vite HMR); `window.api` is only available inside Electron.

**Electron binary:** If `pnpm dev` fails with `Error: Electron uninstall`, the Electron download did not complete. Fix with `node node_modules/electron/install.js` (from repo root), then retry `pnpm dev`.

**Display:** Electron needs X11 (`DISPLAY` is usually `:1` in this environment). Harmless `dbus` errors in logs are normal without a session bus.

**Worker / DB:** On successful boot, main forks the `neeme-data` utilityProcess and creates `neeme.db` under Electron `userData` (Linux: `~/.config/@mikan/desktop/neeme.db`). The renderer still uses sample data in `apps/desktop/src/renderer/src/mikan/data.ts`; IPC (`window.api.pipeline.*`, `window.api.todos.*`) is wired for integration work.

### Data-layer smoke (optional, no Electron UI)

```bash
mkdir -p /tmp/nimi-smoke
cd apps/desktop
NEEME_USER_DATA=/tmp/nimi-smoke NEEME_EMBEDDER=hash pnpm exec tsx -e "
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
pnpm --filter @mikan/desktop build:mac    # → apps/desktop/dist/nimi-<ver>.dmg
pnpm --filter @mikan/desktop build:win    # → dist/nimi-<ver>-setup.exe (build ON Windows)
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

| Runbook | Feature | Needs |
|---|---|---|
| `docs/testing/uncovered-todos-gui-runbook.md` | Feed → "I spotted these to-dos" | `NEEME_ANTHROPIC_KEY`, `DISPLAY` |
| `docs/testing/csp-smoke-runbook.md` | CSP hardening + local fonts (#11) | `DISPLAY` (deterministic tier needs neither) |

Runbooks follow `docs/testing/RUNBOOK-TEMPLATE.md`; the `gui-smoke` skill
(`.cursor/skills/gui-smoke/SKILL.md`) is the SOP for running them + capturing
artifacts. The deterministic tier (`pnpm --filter @mikan/desktop test:e2e` under
Xvfb) runs automatically on PRs via `.github/workflows/e2e-smoke.yml`; see
`docs/testing/automation-setup.md` for wiring an auto-launched cloud agent for the
visual tier.

### Scoped commands

- Desktop only: `pnpm --filter @mikan/desktop dev|build|typecheck|test`
- See root `README.md` and `CLAUDE.md` for monorepo layout and agent lanes (`docs/agent-sync/INBOX.md`).
