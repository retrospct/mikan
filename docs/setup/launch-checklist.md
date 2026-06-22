# Mikan launch / environment checklist

A single home for the **deferred environment switches** — the "set X to Y once Z is
live" items that are easy to forget. Env-var _names_ keep the internal `NEEME`
namespace; only their _values_ change. (Momo gets its own stack later — see
`packages/brand/README.md` follow-ups.)

## Pending — flip when the trigger is met

**Data API deployed** → set the API base URL to `https://api.getmikan.com`

- GitHub Secret `VITE_NEEME_API_URL` (desktop) and `EXPO_PUBLIC_NEEME_API_URL` (mobile).
- Until then the desktop is local-first and these are **inert**; dev default is
  `http://localhost:8000`. Don't point at `api.getmikan.com` before a service actually
  responds there, or any call fails.

**Logto custom domain `auth.getmikan.com` is Active** → the OIDC **issuer** changes, so
flip all three together (mismatch breaks token verification)

- desktop `MAIN_VITE_LOGTO_ENDPOINT=https://auth.getmikan.com`
- broker `LOGTO_ISSUER=https://auth.getmikan.com/oidc`
- broker `LOGTO_JWKS_URL=https://auth.getmikan.com/oidc/jwks`
- then raise the `auth` CNAME DNS TTL from 60 → 3600.

**Mikan API resource created** (audience) → set the audience string everywhere

- desktop `MAIN_VITE_LOGTO_RESOURCE=https://api.getmikan.com`
- broker `LOGTO_AUDIENCE=https://api.getmikan.com`
- (Just a string / token `aud`; needs no DNS.)

**`mikan-token-broker` has the `sync.getmikan.com` domain + env** → point the desktop at
it and retire the old project

- GitHub Secret + local `apps/desktop/.env`: `MAIN_VITE_NEEME_SYNC_BROKER_URL=https://sync.getmikan.com`
- set the broker's own Vercel env (`LOGTO_ISSUER`, `LOGTO_AUDIENCE`, `LOGTO_JWKS_URL`, `TURSO_*`).
- **delete/disconnect the old `nimi-token-broker` Vercel project** (avoid two live
  deployments of the same broker).

**Resend `send.getmikan.com`** (Verified — SPF + DKIM ✅)

- **DMARC monitoring via Postmark is set up** (`v=DMARC1; p=none; pct=100; rua=…@dmarc.postmarkapp.com; sp=none; aspf=r`).
  Remaining: let ~1–2 weeks of reports confirm Resend mail passes SPF+DKIM alignment,
  then tighten `p=none` → `quarantine` → `reject`. **When tightening `p`, also raise
  `sp` (or drop the `sp` tag so subdomains inherit `p`)** — `sp=none` leaves
  `*.getmikan.com` spoofable even at `p=reject`.
- Keep **TLS Opportunistic** and **tracking off** for auth/OTP mail.
- Set the Logto Resend connector from-address to `Mikan <noreply@send.getmikan.com>`;
  only switch sign-in to passwordless **after** this (codes from the `resend.dev`
  sender land in spam → lockouts).

**Other**

- **Marketing site `getmikan.com`** (separate PR, after the brand layer lands): a
  small brand-aware site — suggested `apps/web` consuming `@nimi/brand`, Astro on
  Vercel, `BRAND`-keyed (mikan → getmikan.com, momo → getmomo.now later). Serves the
  homepage + `/terms` + `/privacy`, and is the target for Logto's **unknown-session
  redirect URL**. Unblocks: Google consent links, Logto terms/privacy links + the
  registration "agree to terms" checkbox. Set Logto "agree to terms" =
  **require checkbox on registration only** once the pages are live.
- **Logto hosted sign-in branding** (Console → Sign-in experience): Mikan diamond
  mark (light + dark) + favicon, brand color `#0F5E57` (teal), dark mode on, product
  name "Mikan"; add the Terms/Privacy/Support URLs above. Currently the shared
  **omni** experience (one app) → brands both; when Momo gets its own Logto app,
  enable per-app branding.
- **Google social connector**: keep "require missing sign-up identifier" on and
  "auto-link same identifier" on (safe — Google verifies emails; revisit if a
  connector without verified email is added). Ensure Google Cloud OAuth client's
  Authorized redirect URIs include Logto's `…/callback/<connector-id>` — and **add
  the `https://auth.getmikan.com/callback/<connector-id>` variant when the custom
  domain goes Active**, or Google sign-in breaks there.
- Real 1024×1024 icons at `apps/desktop/assets/{mikan,momo}/icon.png`.
- Branch protection — require the `commitlint` check on PRs once PRs resume.

## Already done (for reference)

- Logto **Native** app; redirect URIs `mikan://callback` + `momo://callback` registered.
- appId `dev.retro.mikan`; deep-link scheme `mikan://` (replaced internal `neeme://`).
- Refresh tokens on (offline_access requested by the app; rotation ON, 14-day TTL).
- Resend `send.getmikan.com` domain verified (DKIM + SPF).

## Sanity check on first sync after any auth/broker switch

After flipping issuer/audience/broker URL, sign out + in once: tokens minted under
the old issuer/audience won't verify. Confirm `await window.api.auth.getState()`
→ `isAuthenticated: true` and that a sync token is minted without a broker
`aud`/`iss` mismatch error.
