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
