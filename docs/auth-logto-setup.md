# Logto auth — setup

> Status: **scaffolded, deferred.** The flow is wired end-to-end but **inert until
> configured** — the local-first app needs no login. Auth only matters once cloud
> sync/accounts land (see [docs/adr/0002-authentication.md](adr/0002-authentication.md)).

## What's implemented

- **Main process** (`apps/desktop/src/main/auth/logto.ts`): OIDC Authorization Code + PKCE in the
  **system browser**, custom-scheme redirect `neeme://callback`, token exchange + refresh,
  refresh token sealed via Electron `safeStorage`. Inert when unconfigured.
- **IPC** (`packages/contract/src/ipc.ts`, `apps/desktop/src/preload`): `window.api.auth.{login,logout,getAccessToken,getState,onChanged}`.
- **Renderer** (`apps/desktop/src/renderer/src/hooks/useAuth.ts` + `nimi/auth.tsx`): hydrates the API
  client's bearer token (`packages/contract/src/api/token-store.ts` → `runtime.ts` `getToken()` seam)
  and renders the header `AuthControl` (Sign in → identity pill → Sign out). Hidden until `configured`.
  No CSP change needed — the renderer never calls Logto.

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

## Smoke test (the #9 acceptance)

1. Set the env vars above, restart `pnpm dev` → the **Sign in** button appears (proves `configured`).
2. Click it → the system browser opens Logto → authenticate → it redirects to `neeme://callback`.
3. The app catches the callback, exchanges the code (PKCE), **verifies the id_token against JWKS**,
   and the header shows your name/email.
4. Restart `pnpm dev` → the session restores silently (refresh token, no re-login).
5. Click the identity pill → **Sign out**; the header returns to **Sign in** and the bearer clears.

## Caveats

- **Custom-scheme deep link (`neeme://`)** registers reliably in a **packaged** build. In `pnpm dev`
  on macOS the `open-url` event usually still fires; on Windows/Linux deep links rely on the
  single-instance lock + argv parsing (already wired). If dev redirects don't return, test in a
  packaged build or switch the redirect to a loopback (`http://127.0.0.1:<port>/callback`).
- The `id_token` **is** signature-verified client-side now (`auth/oidc.ts` `verifyIdToken`: JWKS
  signature + `iss`/`aud`/`exp` + the `nonce` bound on the authorize request). The **access token**
  stays opaque to the client — the **backend** remains its trust boundary (verify against Logto's
  JWKS), still deferred until the sync backend lands.
- Backend `user_id` data-scoping (items/todos are currently global) is separate work — see ADR 0002.
