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

### Deferred (opt-in, later)
- **Sync** — Turso embedded replicas; will only ever push **end-to-end-encrypted** data.
- **Auth / at-rest encryption** — currently Tier 1 (protected by the OS account, no app lock). Electron `safeStorage` / SQLCipher slot into `src/main/db` when added.
- **Vector index** (LanceDB / sqlite-vec) and enrichment, mirroring the broader neeme pipeline.

UI/UX is developed separately; the renderer here is a minimal functional placeholder.
