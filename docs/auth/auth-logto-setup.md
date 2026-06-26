# Logto auth — setup

> Status: **scaffolded, deferred.** The flow is wired end-to-end but **inert until
> configured** — the local-first app needs no login. Auth only matters once cloud
> sync/accounts land (see [docs/adr/0002-authentication.md](adr/0002-authentication.md)).

## What's implemented

- **Main process** (`apps/desktop/src/main/auth/logto.ts`): OIDC Authorization Code + PKCE in the
  **system browser**, deep-link redirect (`mikan://callback`, from `@mikan/brand`), token exchange + refresh,
  refresh token sealed via Electron `safeStorage`. Inert when unconfigured.
- **IPC** (`packages/contract/src/ipc.ts`, `apps/desktop/src/preload`): `window.api.auth.{login,logout,getAccessToken,getState,onChanged}`.
- **Renderer** (`apps/desktop/src/renderer/src/hooks/useAuth.ts` + `nimi/auth.tsx`): hydrates the API
  client's bearer token (`packages/contract/src/api/token-store.ts` → `runtime.ts` `getToken()` seam)
  and renders the header `AuthControl` (Sign in → identity pill → Sign out). Hidden until `configured`.
  No CSP change needed — the renderer never calls Logto.

## To turn it on

> **Deep-link scheme** (from the brand layer, `@mikan/brand`): the redirect is
> `mikan://callback` (it replaced the old internal `neeme://`). The scheme lives in
> `packages/brand/src/identity.json`.

1. **Logto Cloud** → create a project → **Create application → "Native app"** (public client, PKCE).
2. Set the **Redirect URI** to `mikan://callback` (add a Post sign-out redirect if
   you want; it's currently unused — sign-out is local). The scheme comes from
   `packages/brand/src/identity.json`.
3. Copy the tenant **endpoint** and **App ID** into `.env` (main-process, `MAIN_VITE_` prefix):

   ```
   MAIN_VITE_LOGTO_ENDPOINT=https://<your-tenant>.logto.app
   MAIN_VITE_LOGTO_APP_ID=<your-native-app-id>
   # Optional: scope the access token to your API resource indicator
   # MAIN_VITE_LOGTO_RESOURCE=https://api.getmikan.com
   ```

4. Restart `pnpm dev`. A **Sign in** button appears once `configured` is true.

`MAIN_VITE_*` is read at process start from `apps/desktop/.env` (electron-vite's config root) —
not the repo-root `.env`. Put the vars there, or the button won't appear.

## Email connector — REQUIRED CONFIG (not yet done)

> Status: **to be configured.** Logto's default demo email connector is test-only and must
> not ship. Logto sends email for **sign-up verification** (already required) and, if you
> switch sign-in to **passwordless** (email code), for **every login** + password resets.

We'll use **Resend** (its free tier — ~3k emails/mo, 100/day — is plenty for the alpha). The
one non-negotiable step is verifying a **sending domain** so codes land in the inbox, not spam.

1. **Verify a domain in Resend.** Resend → **Domains → Add Domain** with a domain we own
   (e.g. `retro.dev` or `getmikan.com`), then add the **SPF + DKIM** DNS records Resend shows
   (and the optional DMARC). Wait for "Verified". Do **not** rely on the default
   `onboarding@resend.dev` sender for real users — deliverability is unreliable (spam/greylisting).
2. **Create a Resend API key** (Resend → **API Keys**), sending-scope is enough.
3. **Logto Console → Connectors → Email and SMS → Email connector → Resend.** Paste the API
   key and a **branded from address on the verified domain** — `Mikan <hello@send.getmikan.com>`.
   **Never use `no-reply@`** ([Resend deliverability guidance](https://resend.com/docs/dashboard/emails/deliverability-insights)):
   a real sender protects engagement/reputation and avoids hard-bounces from recipients who
   reply. (Logto also offers a generic **SMTP** connector if you prefer.) The `send.` subdomain
   is send-only (no MX), so a `Reply-To` is deferred until apex MX (`support@getmikan.com`)
   exists — see `docs/setup/launch-checklist.md`.
4. **Templates.** Fill the _Generic_, _Sign-in_, _Sign-up_, and _Forgot password_ usage types so
   the code email reads well.
5. **Send a test email** from the connector page and confirm it arrives in a normal inbox.

**Gate:** verify the domain (steps 1–3) **before** switching sign-in to passwordless
(email-code-only). On the `resend.dev` sender, codes landing in spam = users locked out.

Note: there's a **single Logto app** (single brand, Mikan), so the from-address is the
one Mikan sender.

## What you do NOT need

- **You don't need a social login (Google, etc.) to test sign-in.** Logto has built-in
  email/password — that alone exercises the whole flow below.
- **Don't create a direct Google/loopback OAuth client for this.** The app talks only to Logto;
  Logto is the identity broker that talks to Google. A `127.0.0.1` loopback redirect or Gmail/
  Calendar scopes belong to _connectors_ (ROADMAP #8 — ingesting mail/calendar), not login.

### Optional: "Sign in with Google" (a Logto **social connector**)

1. **Logto Console → Connectors → Social → Google** → paste your Google **Client ID + Secret**
   (these live in Logto, _not_ in the app's `.env`).
2. Logto shows a **Redirect URI** like `https://<tenant>.logto.app/callback/<connector-id>` —
   register **that** in Google Cloud Console's OAuth client (Authorized redirect URIs).
3. Login scopes are just `openid email profile`. Gmail/Calendar readonly are connector scopes — omit.

## Test plan (the #9 acceptance)

Shared: fill `apps/desktop/.env` (above), and confirm the **Logto Native app**'s Redirect URIs
include `mikan://callback` (no trailing slash). Sign-in flow: header **Sign in** → system browser →
authenticate → redirect to `mikan://callback` → app exchanges the code (PKCE), **verifies the
id_token against JWKS**, header shows your name/email.

**Option A — dev (`pnpm dev`), try first.** On macOS the `open-url` event usually routes the
callback home.

1. `pnpm dev` → **Sign in** button visible (proves `configured`).
2. Click → system browser → sign in (email/password is fine).
3. Back in the app: header shows your identity. In DevTools: `await window.api.auth.getState()`
   → `isAuthenticated: true`; `await window.api.auth.getAccessToken()` → a JWT.
4. Quit + `pnpm dev` again → still signed in (silent refresh).
5. Click the identity pill → **Sign out** → back to **Sign in**.

**Option B — packaged build, the reliable deep-link path.** Use if A's redirect doesn't return
to the app (the known dev limitation).

1. Fill `apps/desktop/.env` **before** building (`MAIN_VITE_*` are baked in at build time).
2. `pnpm --filter @mikan/desktop build:unpack` → `open apps/desktop/release/mikan/mac*/Mikan.app`
   (output dir + `productName` come from `identity.mikan`).
3. Same checks as A2–A5; `mikan://` is OS-registered so the callback always routes home.

**Reset to a clean slate:** `rm "$HOME/Library/Application Support/Mikan/neeme-auth.bin"`, relaunch
(the userData dir follows the brand `productName` — `Mikan`; the `neeme-auth.bin`
filename is internal and unchanged).

## Two OAuth flows (login vs connectors) — don't conflate them

The app runs **two independent OAuth flows**; keep them separate:

|                    | **Login** (#9, this doc)                                             | **Connectors** (#8 — Gmail/Calendar ingest)                             |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Provider           | Logto (broker; can federate Google)                                  | Google directly                                                         |
| Purpose            | who you are (id_token → claims)                                      | data access (access token → Gmail/Cal APIs)                             |
| Redirect transport | `mikan://callback` custom scheme                                     | **loopback** `http://127.0.0.1:<port>/callback`                         |
| Callback handler   | `main/index.ts` `open-url`/`second-instance` → `auth.handleCallback` | a transient local HTTP listener (connectors own it)                     |
| Client             | public, PKCE, no secret                                              | own Google client (PKCE + secret)                                       |
| Env                | `MAIN_VITE_LOGTO_*`                                                  | Google creds (need a `MAIN_VITE_`/`NEEME_` prefix to reach main/worker) |

**Shared, by design:** the pure PKCE primitives in `auth/oidc.ts` (`base64url`, `randomVerifier`,
`randomState`, `pkceChallenge`) are provider-agnostic — the connector flow should import them rather
than re-roll crypto. `verifyIdToken`/`claimsFromPayload` are login-only (connectors want access
tokens, not identity). The custom-scheme handler is login-only — connectors must not register a
scheme or they'll capture each other's callbacks.

## Gotchas we actually hit (verified 2026-06)

- **Use a Native app, not the Management API app.** Every Logto tenant auto-creates an M2M
  "Management API" app — grabbing _its_ App ID gives `invalid_redirect_uri` ("redirect_uris must
  contain members"), because M2M apps have no redirect URIs. The login client must be type **Native**.
- **Save the redirect URI.** Adding `mikan://callback` but not clicking **Save changes** leaves the
  array empty → same error. After saving it shows as a chip in the list.
- **Don't request the Management API resource for login.** `MAIN_VITE_LOGTO_RESOURCE=<tenant>/api`
  is the Management API indicator; a user-login client requesting it gets `invalid_target`. Leave it
  unset unless you've registered a real API resource and want a scoped access token. (This also rules
  out using `<tenant>/api` as the broker audience — see ADR 0008.)
- **API resource identifier ≠ custom domain.** The broker audience (`MAIN_VITE_LOGTO_RESOURCE` +
  broker `LOGTO_AUDIENCE`, e.g. `https://api.getmikan.com`) is just a **string** — the token's `aud`
  claim. It needs **no DNS, SSL, or CAA records**: register it under **API resources → Create API
  resource**, _not_ **Custom domains**. Logto's _Custom domains_ page is a separate, cosmetic feature
  (CNAME → `domains.logto.app` + SSL) that only rebrands the sign-in/OIDC URLs. Don't burn a real
  subdomain like `api.getmikan.com` on it — reserve that for your actual API; use e.g.
  `auth.getmikan.com` if you ever want branded auth URLs. The same string can be both the audience
  _and_ your real API base URL — that's the intended pattern, not a conflict.

> **Product domains.** These examples use Mikan's domains (`api.getmikan.com`,
> `auth.getmikan.com`) — Mikan owns the Logto app + broker. The audience and broker
> URL are not user-visible; only the `auth.*` sign-in domain is.

| Use                                    | Value                      | Real DNS/SSL?         | Where in Logto          |
| -------------------------------------- | -------------------------- | --------------------- | ----------------------- |
| Sign-in / OIDC URL branding (optional) | `auth.getmikan.com`        | ✅ yes                | Custom domains          |
| Broker audience (token `aud`)          | `https://api.getmikan.com` | ❌ no — just a string | API resources           |
| Your actual backend API (later)        | `https://api.getmikan.com` | ✅ eventually         | (your infra, not Logto) |

- **A custom domain changes the issuer.** If you later enable `auth.getmikan.com` as the Logto custom
  domain, tokens minted through it carry `iss=https://auth.getmikan.com/oidc`. Flip all three together
  — `MAIN_VITE_LOGTO_ENDPOINT` (desktop), broker `LOGTO_ISSUER`, and broker `LOGTO_JWKS_URL` — to the
  custom domain, or verification fails on issuer mismatch. The audience (`https://api.getmikan.com`) is
  unaffected by that switch. Until then, keep everything on the default `c435za.logto.app`.
- **One app instance at a time across worktrees.** All worktrees share the appId
  (`dev.retro.mikan`) + `userData`, so they share a single-instance lock. A stale `pnpm dev` in another worktree keeps its
  (wrong) window up and blocks yours — `window.api` reads `undefined` and the UI silently falls back
  to the browser mock (no lock). Kill the other dev first.

## Caveats

- **Custom-scheme deep link (`mikan://`)** registers reliably in a **packaged** build. In `pnpm dev`
  on macOS the `open-url` event usually still fires; on Windows/Linux deep links rely on the
  single-instance lock + argv parsing (already wired). If dev redirects don't return, use Option B
  (packaged build). The redirect is `${brand.scheme}://callback`
  (`auth/logto.ts`, scheme from `@mikan/brand`); a loopback redirect would mean code changes (a local
  HTTP listener) — not wired today.
- The `id_token` **is** signature-verified client-side now (`auth/oidc.ts` `verifyIdToken`: JWKS
  signature + `iss`/`aud`/`exp` + the `nonce` bound on the authorize request). The **access token**
  stays opaque to the client — the **backend** remains its trust boundary (verify against Logto's
  JWKS), still deferred until the sync backend lands.
- Backend `user_id` data-scoping (items/todos are currently global) is separate work — see ADR 0002.
