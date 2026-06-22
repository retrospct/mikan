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

## Permissions

Browser-grade permissions are **denied by default** via `setPermissionRequestHandler`
+ `setPermissionCheckHandler` on the default session (`apps/desktop/src/main/index.ts`).
The handlers are an explicit **allowlist** (`ALLOWED`) — "deny by default, allow
exactly what we use."

Currently `ALLOWED` holds only `clipboard-sanitized-write` — the Settings
recovery-key "Copy" button (`navigator.clipboard.writeText`). Everything else
(notifications, camera, mic, geolocation, clipboard-read, …) is denied. To enable one
later — e.g. `notifications` when reminders ship — add the permission string to
`ALLOWED`. That is the entire change; nothing else grants it.

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

## Build-time hardening (packaged app)

Runtime lockdown protects the *renderer*; these protect the *binary*, so a local
attacker can't sidestep all of the above by relaunching the signed app differently.

- **Electron fuses** (`apps/desktop/electron-builder.config.cjs`, `electronFuses`).
  electron-builder flips them at package time and re-signs. We disable `runAsNode`,
  `enableNodeOptionsEnvironmentVariable`, and `enableNodeCliInspectArguments` — these
  otherwise let a signed app be relaunched as a raw Node process
  (`ELECTRON_RUN_AS_NODE=1`, `--inspect`) with the app's entitlements, bypassing the
  sandbox entirely — and enable `enableCookieEncryption`.
  - **Deferred (Tier B):** `onlyLoadAppFromAsar` + `enableEmbeddedAsarIntegrityValidation`.
    The app ships **unpacked native deps** (`asarUnpack`: onnxruntime-node,
    ffmpeg-static, libSQL); asar-integrity can interact badly with unpacked natives +
    signing. Enable only after a notarized build is confirmed to launch, then verify
    with `npx @electron/fuses read --app <path>.app`.
- **`app.enableSandbox()`** (`apps/desktop/src/main/index.ts`) forces the sandbox on
  process-wide, so a future window can't regress the per-window `sandbox: true`.
- **macOS hardened runtime + notarization** are on (`hardenedRuntime: true`,
  `notarize: true` in the builder config).

## Secrets at rest

- **Auth refresh token + display claims** are sealed with Electron `safeStorage`
  (OS keychain: macOS Keychain / Windows Credential Manager / Linux Secret Service)
  before being written under `userData` (`apps/desktop/src/main/auth/logto.ts`). The
  short-lived **access token stays in memory only** — never persisted.
  - **Linux caveat:** with no Secret Service / keyring available, `safeStorage`
    falls back to writing the blob **unencrypted** (still inside `userData`). Document
    this for Linux users; recommend a configured keyring before enabling sync/auth.
- **Synced content** is field-encrypted with **AES-256-GCM** (fresh 96-bit IV per
  value, 128-bit auth tag, 256-bit key from `crypto.randomBytes`) before it leaves the
  device, so the cloud primary only ever sees ciphertext
  (`apps/desktop/src/main/db/crypto.ts`).
- All security tokens (PKCE verifier, OAuth state, nonce, keys, IVs) use
  `node:crypto` CSPRNG — never `Math.random()`.

## Keep this true

- Never set `sandbox: false`, `nodeIntegration: true`, `contextIsolation: false`, or
  `webSecurity: false`. `app.enableSandbox()` keeps the first one true globally.
- Never expose Node/`ipcRenderer` directly on `window` — only scoped methods via
  `contextBridge` in `apps/desktop/src/preload`; keep the preload free of Node
  built-ins (so the sandbox holds).
- **IPC trust model:** the renderer is the *only*, sandboxed caller of `window.api.*`.
  Safety at the boundary rests on the type system + **parameterized DB queries**
  (Drizzle / `?`-bound libSQL) + content-hashed file paths — not blanket runtime
  validation. Add an explicit runtime check only where a value is security-relevant
  (e.g. the recovery-key hex regex in `services/sync-prefs.ts`, the `ConnectorId`
  allowlist in `index.ts`). If you add a sink that interpolates a renderer value into
  SQL, a path, or a shell call, validate it there.
- Keep permissions **deny-by-default**; opt features in via the `ALLOWED` allowlist.
- When changing the CSP, update **all three copies in lockstep** — the `<meta>` tag
  (`renderer/index.html`), `DEV_CSP` (`electron.vite.config.ts`), and the runtime
  header (`main/index.ts`). They drift silently and a stale copy weakens the shipped
  policy.
