# Electron security posture

The hard part is staying both **secure** and **performant** as the app grows. These are
the invariants we hold — treat them as a checklist on any PR that touches `apps/desktop/src/main`,
`apps/desktop/src/preload`, or window/`webPreferences` config.

## Process model

```
renderer (sandboxed, context-isolated, NO node)
  → preload (contextBridge — the ONLY surface the renderer can reach)
    → main (thin: windows, auth deep-links, IPC routing — no heavy/native work)
      → utilityProcess (DB + pipeline/todos + native addons, off the main loop)
```

- **Renderer is locked down** (`createWindow`, `apps/desktop/src/main/index.ts`):
  `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. The renderer has
  no Node and no direct Electron/DB access — only the typed `window.api.*` bridge.
- **Heavy + native work is isolated** in a `utilityProcess` (`apps/desktop/src/main/worker/*`). Keeps
  the main loop responsive (performance) *and* shrinks main's attack surface.
- **Main is a router.** It must not become a Node server: no business logic, no DB, no
  remote/network servers. New data capabilities go in the worker, exposed via IPC.

## Navigation & windows (`app.on('web-contents-created')`)

- The renderer **may not navigate away** from the app's own content (`will-navigate` is
  denied for non-app URLs).
- The renderer **may not open windows**; `setWindowOpenHandler` denies all, and only
  `https:`/`mailto:` links are forwarded to the system browser (`shell.openExternal`).
- Auth (Logto OIDC + PKCE) uses the **system browser**, never an in-app webview.

## Content Security Policy

Set in `apps/desktop/src/renderer/index.html`. Keep `script-src 'self'` (no `unsafe-inline`/`eval`).
Tighten `connect-src` once the legacy cloud API is fully retired (the renderer talks to
the backend over IPC, not HTTP). Bundling fonts locally would let us drop the Google
Fonts origins entirely (offline-first).

## Keep this true

- Never set `sandbox: false`, `nodeIntegration: true`, `contextIsolation: false`, or
  `webSecurity: false`.
- Never expose Node/`ipcRenderer` directly on `window` — only scoped methods via
  `contextBridge` in `apps/desktop/src/preload`.
- Validate inputs at the IPC boundary; keep the preload free of Node built-ins (so the
  sandbox holds).
