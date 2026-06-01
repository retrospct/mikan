# Logto auth — setup

> Status: **scaffolded, deferred.** The flow is wired end-to-end but **inert until
> configured** — the local-first app needs no login. Auth only matters once cloud
> sync/accounts land (see [docs/adr/0002-authentication.md](adr/0002-authentication.md)).

## What's implemented

- **Main process** (`apps/desktop/src/main/auth/logto.ts`): OIDC Authorization Code + PKCE in the
  **system browser**, custom-scheme redirect `neeme://callback`, token exchange + refresh,
  refresh token sealed via Electron `safeStorage`. Inert when unconfigured.
- **IPC** (`packages/contract/src/ipc.ts`, `apps/desktop/src/preload`): `window.api.auth.{login,logout,getAccessToken,getState,onChanged}`.
- **Renderer** (`apps/desktop/src/renderer/src/hooks/useAuth.ts`): hydrates the API client's bearer token
  (`packages/contract/src/api/token-store.ts` → `runtime.ts` `getToken()` seam) and shows a Sign in/out
  control in the header. No CSP change needed — the renderer never calls Logto.

## To turn it on

1. **Logto Cloud** → create a project → **Create application → "Native app"** (public client, PKCE).
2. Set the **Redirect URI** to `neeme://callback` (and add a Post sign-out redirect if you want).
3. Copy the tenant **endpoint** and **App ID** into `.env` (main-process, `MAIN_VITE_` prefix):

   ```
   MAIN_VITE_LOGTO_ENDPOINT=https://<your-tenant>.logto.app
   MAIN_VITE_LOGTO_APP_ID=<your-native-app-id>
   # Optional: scope the access token to your API resource indicator
   # MAIN_VITE_LOGTO_RESOURCE=https://api.neeme.app
   ```

4. Restart `pnpm dev`. A **Sign in** button appears once `configured` is true.

## Caveats

- **Custom-scheme deep link (`neeme://`)** registers reliably in a **packaged** build. In `pnpm dev`
  on macOS the `open-url` event usually still fires; on Windows/Linux deep links rely on the
  single-instance lock + argv parsing (already wired). If dev redirects don't return, test in a
  packaged build or switch the redirect to a loopback (`http://127.0.0.1:<port>/callback`).
- The `id_token` is decoded for display claims only (not signature-verified client-side). The
  **backend** is the trust boundary: it verifies the access token against Logto's **JWKS**. Harden
  with a JWKS check or `openid-client` if this graduates past a scaffold.
- Backend `user_id` data-scoping (items/todos are currently global) is separate work — see ADR 0002.
