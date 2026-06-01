# nimi

The desktop client for **neeme** — a privacy-first, local-first personal memory system. _Your personal AI, not a corporation's._

Built with **Electron + Vite + React + Tailwind (TypeScript)** via [electron-vite](https://electron-vite.org/).

## Development

```bash
pnpm install
pnpm dev        # launch the app with HMR
pnpm build      # typecheck + bundle all three processes
pnpm typecheck  # types only (node + web)
```

## Monorepo layout

A **pnpm-workspace + turborepo** monorepo (see [ADR 0006](docs/adr/0006-repo-structure.md)).
Run `pnpm dev` / `pnpm build` / `pnpm typecheck` / `pnpm lint` from the root — turbo fans out.

- `apps/desktop` — the Electron app (this is the bulk of the repo).
- `packages/contract` — **`@nimi/contract`**: the backend⇄UI contract (IPC + view-model
  types) and the shared HTTP API client, consumed from source by the app (and a future
  `apps/mobile` RN/Expo app).

## Architecture

nimi is **local-first**: your data lives on your device, not in the cloud.

- **Three processes** (electron-vite): `apps/desktop/src/main` (Node/Electron — owns data), `apps/desktop/src/preload` (the secure `contextBridge`), `apps/desktop/src/renderer` (the React UI). Context isolation is on; the renderer never touches the database directly.
- **Data layer** — `apps/desktop/src/main/db` uses **Drizzle ORM** over **libSQL** (a SQLite fork), as a plain on-device `file:` database in Electron's `userData` dir. libSQL is deliberate: the same driver later enables **Turso embedded-replica sync** without rewriting the data layer.
- **IPC seam** — `packages/contract/src/ipc.ts` defines the typed contract (channel names + types) shared by all three processes. The renderer calls `window.api.memory.*`, which routes through preload → `ipcMain.handle` → `apps/desktop/src/main/services` → Drizzle.

## API client (the Nimi HTTP backend)

Remote services (capture, search, todos) are served by the **FastAPI backend** in the sibling [`neeme`](https://github.com/retrospct/neeme) repo (the backend + mobile app). The desktop app talks to it through a **typed client generated from the backend's OpenAPI spec** with [`@hey-api/openapi-ts`](https://heyapi.dev/) — so client types can't drift from the server.

- `packages/contract/openapi.json` — committed snapshot of the backend's OpenAPI spec.
- `packages/contract/src/api/generated/**` — generated SDK (committed; do not hand-edit).
- `packages/contract/src/api/runtime.ts` — base URL (`VITE_NEEME_API_URL`, default `http://localhost:8000`) + the auth-token seam. Survives regeneration.
- `packages/contract/src/api/index.ts` — the stable public surface callers import (`@nimi/contract/api`).

The client is plain `fetch` (no Electron/Node imports), so it's reusable as-is in a future React Native / Expo app.

```bash
# Regenerate the client after the backend's API changes:
cd ../neeme && .venv/bin/python scripts/export_openapi.py ../nimi/packages/contract/openapi.json
cd ../nimi && pnpm gen:api   # root script → pnpm --filter @nimi/contract gen:api

# Run the backend locally so the app can reach it (uv-managed venv):
cd ../neeme && uv pip install -e ".[api]" && neeme serve   # serves on :8000
```

> Today the renderer calls the API directly (plain `fetch`, the same path RN will use). Once auth tokens exist, sensitive calls can move behind Electron **main**/IPC so tokens live in `safeStorage` — the env-agnostic client makes that a non-breaking change. Local libSQL data stays on the IPC path; HTTP is a separate concern.

### Deferred (opt-in, later)

- **Sync** — Turso embedded replicas; will only ever push **end-to-end-encrypted** data.
- **Auth / at-rest encryption** — currently Tier 1 (protected by the OS account, no app lock). Electron `safeStorage` / SQLCipher slot into `apps/desktop/src/main/db` when added.
- **Vector index** (LanceDB / sqlite-vec) and enrichment, mirroring the broader neeme pipeline.

UI/UX is developed separately; the renderer here is a minimal functional placeholder.
