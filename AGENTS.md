# nimi — agent guide (monorepo root)

See **`CLAUDE.md`** for the full shared spine (architecture, contract, verify steps, security).

## Cursor Cloud specific instructions

### Services (this repo)

| Service | Required for dev? | Notes |
|--------|-------------------|--------|
| **Electron app** (`pnpm dev`) | Yes | Starts main + preload + renderer (Vite `:5173`) + data **utilityProcess** worker |
| **neeme FastAPI** (`:8000`) | No | Sibling repo; only if testing `@nimi/contract/api` HTTP client |
| **Logto OIDC** | No | Inert until `MAIN_VITE_LOGTO_*` env is set |

### Verify (from repo root)

Standard commands are in **`README.md`** / **`CLAUDE.md`**:

- `pnpm typecheck` — turbo fans out `@nimi/contract` + `@nimi/desktop`
- `pnpm build` — electron-vite production bundles
- `pnpm lint` — eslint; **pre-existing debt** in `packages/contract/src/api/generated/**` (hey-api) may fail a full-tree lint even when app code is clean

### Running the desktop app in Cloud / headless VMs

- **Display:** Cloud VMs usually expose `DISPLAY` (e.g. `:1`). D-Bus warnings in logs are normal and non-fatal.
- **Electron binary:** If `electron-vite dev` fails with `Error: Electron uninstall`, the Electron binary was not downloaded yet. Run once: `node node_modules/electron/install.js` (or `pnpm exec electron --version`), then retry `pnpm dev`.
- **Faster worker smoke (no HuggingFace model):** `NEEME_EMBEDDER=hash pnpm dev`
- **Renderer still uses sample UI data** (`apps/desktop/src/renderer/src/nimi/data.ts`); on-device persistence is via `window.api.pipeline.*` (see `docs/INTEGRATION.md`). To smoke-test **pipeline + libSQL** without the UI, from `apps/desktop` import `initDb` and `pipelineService` under `src/main/` with `NEEME_EMBEDDER=hash` and a writable `NEEME_USER_DATA` directory (mkdir first), then call `captureText` / `match`.

- **User data / DB:** `~/.config/@nimi/desktop/neeme.db` when running under Electron.

### Dev server

- Root: `pnpm dev` (turbo → `@nimi/desktop` → `electron-vite dev`)
- Vite renderer only (no `window.api`): `http://localhost:5173/` while dev is running
=======
## Cursor Cloud specific instructions

### Product

Single runnable app: **nimi Desktop** (`@nimi/desktop`, Electron). `pnpm dev` from the repo root is the dev entry (turbo → `electron-vite dev`). The **neeme FastAPI backend** (sibling repo) and **Logto** are optional; local-first E2E is Electron + worker + embedded libSQL only.

### Verify (no runtime)

From repo root: `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test`. Pre-existing ESLint failures in `packages/contract/src/api/generated/**` are expected (hey-api output).

`pnpm test` runs 152 vitest tests in plain Node (no Electron, no model download): pipeline unit tests + integration tests for pipeline-service/todo-service/draft-service against a temp libSQL DB with `NEEME_EMBEDDER=hash` + `NEEME_DRAFTER=off`.

### Run the desktop app

```bash
NEEME_EMBEDDER=hash pnpm dev
```

Use `NEEME_EMBEDDER=hash` in cloud/CI VMs to skip ONNX model download and `onnxruntime-node` at runtime. The renderer is also reachable at `http://localhost:5173/` during dev (Vite HMR); `window.api` is only available inside Electron.

**Electron binary:** If `pnpm dev` fails with `Error: Electron uninstall`, the Electron download did not complete. Fix with `node node_modules/electron/install.js` (from repo root), then retry `pnpm dev`.

**Display:** Electron needs X11 (`DISPLAY` is usually `:1` in this environment). Harmless `dbus` errors in logs are normal without a session bus.

**Worker / DB:** On successful boot, main forks the `neeme-data` utilityProcess and creates `neeme.db` under Electron `userData` (Linux: `~/.config/@nimi/desktop/neeme.db`). The renderer still uses sample data in `apps/desktop/src/renderer/src/nimi/data.ts`; IPC (`window.api.pipeline.*`, `window.api.todos.*`) is wired for integration work.

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
pnpm --filter @nimi/desktop test:smoke

# Tier 2 — Playwright Electron E2E (real picker + drag-drop → IPC → worker → DB).
# Launches the BUILT app, so build first. Electron _electron needs no browser download.
pnpm --filter @nimi/desktop build && pnpm --filter @nimi/desktop test:e2e
```

The E2E reads ground truth back through `window.api.pipeline.archive()` (the app's own DB
connection — a separate SQLite reader hits WAL-visibility races). It launches with
`--user-data-dir=<tmp>` for an isolated throwaway DB.

### Tier 3 — packaged installer on a second computer (Mac/Windows)

```bash
pnpm --filter @nimi/desktop build:mac    # → apps/desktop/dist/nimi-<ver>.dmg
pnpm --filter @nimi/desktop build:win    # → dist/nimi-<ver>-setup.exe (build ON Windows)
```

Unsigned: macOS → right-click **Open** (or `xattr -dr com.apple.quarantine /Applications/Nimi.app`);
Windows SmartScreen → **More info → Run anyway**. Packaged userData/DB: macOS
`~/Library/Application Support/Nimi/neeme.db`, Windows `%APPDATA%\Nimi\neeme.db`.

> The preload **must** stay bundled (not externalized) — sandboxed preloads can't
> `require()` npm modules, so `@electron-toolkit/preload` is in `electron.vite.config.ts`'s
> externalize `exclude` list. Without it the packaged app's `window.api` silently fails and
> the renderer falls back to mock data.

### Scoped commands

- Desktop only: `pnpm --filter @nimi/desktop dev|build|typecheck|test`
- See root `README.md` and `CLAUDE.md` for monorepo layout and agent lanes (`docs/agent-sync/INBOX.md`).
