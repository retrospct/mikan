# neeme-desktop

The desktop client for **neeme** — a privacy-first, local-first personal memory system. _Your personal AI, not a corporation's._

Built with **Electron + Vite + React + Tailwind (TypeScript)** via [electron-vite](https://electron-vite.org/).

## Development

```bash
pnpm install
pnpm dev        # launch the app with HMR
pnpm build      # typecheck + bundle all three processes
pnpm typecheck  # types only (node + web)
```

## Architecture

neeme-desktop is **local-first**: your data lives on your device, not in the cloud.

- **Three processes** (electron-vite): `src/main` (Node/Electron — owns data), `src/preload` (the secure `contextBridge`), `src/renderer` (the React UI). Context isolation is on; the renderer never touches the database directly.
- **Data layer** — `src/main/db` uses **Drizzle ORM** over **libSQL** (a SQLite fork), as a plain on-device `file:` database in Electron's `userData` dir. libSQL is deliberate: the same driver later enables **Turso embedded-replica sync** without rewriting the data layer.
- **IPC seam** — `src/shared/ipc.ts` defines the typed contract (channel names + types) shared by all three processes. The renderer calls `window.api.memory.*`, which routes through preload → `ipcMain.handle` → `src/main/services` → Drizzle.

## API client (the Neeme HTTP backend)

Remote services (capture, search, todos) are served by the **FastAPI backend** in the sibling [`neeme`](https://github.com/retrospct/neeme) repo (the backend + mobile app). The desktop app talks to it through a **typed client generated from the backend's OpenAPI spec** with [`@hey-api/openapi-ts`](https://heyapi.dev/) — so client types can't drift from the server.

- `openapi.json` — committed snapshot of the backend's OpenAPI spec.
- `src/shared/api/generated/**` — generated SDK (committed; do not hand-edit).
- `src/shared/api/runtime.ts` — base URL (`VITE_NEEME_API_URL`, default `http://localhost:8000`) + the auth-token seam. Survives regeneration.
- `src/shared/api/index.ts` — the stable public surface callers import (`@shared/api`).

The client is plain `fetch` (no Electron/Node imports), so it's reusable as-is in a future React Native / Expo app.

```bash
# Regenerate the client after the backend's API changes:
cd ../neeme && .venv/bin/python scripts/export_openapi.py ../neeme-desktop/openapi.json
cd ../neeme-desktop && pnpm gen:api

# Run the backend locally so the app can reach it (uv-managed venv):
cd ../neeme && uv pip install -e ".[api]" && neeme serve   # serves on :8000
```

> Today the renderer calls the API directly (plain `fetch`, the same path RN will use). Once auth tokens exist, sensitive calls can move behind Electron **main**/IPC so tokens live in `safeStorage` — the env-agnostic client makes that a non-breaking change. Local libSQL data stays on the IPC path; HTTP is a separate concern.

### Deferred (opt-in, later)
- **Sync** — Turso embedded replicas; will only ever push **end-to-end-encrypted** data.
- **Auth / at-rest encryption** — currently Tier 1 (protected by the OS account, no app lock). Electron `safeStorage` / SQLCipher slot into `src/main/db` when added.
- **Vector index** (LanceDB / sqlite-vec) and enrichment, mirroring the broader neeme pipeline.

UI/UX is developed separately; the renderer here is a minimal functional placeholder.
