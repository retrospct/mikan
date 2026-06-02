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

The **production** policy is offline-first with no remote origins:

```
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'
```

It is enforced in **two places** (defense-in-depth):

- A `<meta http-equiv>` tag in `apps/desktop/src/renderer/index.html`.
- A `Content-Security-Policy` **response header** set in the main process
  (`apps/desktop/src/main/index.ts`, via `session.defaultSession.webRequest.onHeadersReceived`).
  A compromised renderer bundle could strip the meta tag; it cannot remove the header.
  The header is gated on `app.isPackaged` so it only applies to the shipped app.

Why each directive is safe to keep tight:

- **`script-src 'self'`** — no inline/`eval` scripts (hard invariant).
- **`style-src 'self'`** — Tailwind ships as a same-origin linked stylesheet; React's
  `style={{}}` props apply via the CSSOM and the accent tweak uses `el.style.setProperty`,
  both exempt from CSP — so no `'unsafe-inline'` is needed in production.
- **`font-src 'self' data:`** — the UI fonts (Hanken Grotesk + JetBrains Mono) are
  bundled locally via `@fontsource` (imported in `src/renderer/src/main.tsx`); there are
  no Google Fonts origins anymore. `data:` is required because Vite inlines small font
  subsets (e.g. cyrillic) as `data:` URIs; the larger subsets are same-origin asset
  files. `data:` fonts cannot load remote content, so this stays offline-first.
- **`connect-src 'self'`** — the renderer talks to the worker over IPC, not HTTP. The
  legacy FastAPI HTTP client (`ApiStatus` / `@nimi/contract/api`) is not mounted in the app.

**Dev exception.** `electron-vite dev` needs `style-src 'unsafe-inline'` (Vite injects
`<style>` tags for HMR) and `connect-src http://localhost:8000` (the optional FastAPI
round-trip smoke). A serve-only Vite plugin in `electron.vite.config.ts` rewrites the meta
CSP for the dev server only, and the runtime header is skipped in dev — so the policy that
actually **ships** stays strict. Keep the three copies (meta, `DEV_CSP`, runtime header)
in sync when changing the policy.

## Keep this true

- Never set `sandbox: false`, `nodeIntegration: true`, `contextIsolation: false`, or
  `webSecurity: false`.
- Never expose Node/`ipcRenderer` directly on `window` — only scoped methods via
  `contextBridge` in `apps/desktop/src/preload`.
- Validate inputs at the IPC boundary; keep the preload free of Node built-ins (so the
  sandbox holds).
