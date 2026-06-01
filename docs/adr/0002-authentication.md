# ADR 0002 — Authentication for neeme

**Status:** Proposed (managed third-party provider; defers behind sync per ADR 0003)
**Date:** 2026-06-01 (rev. 3 — dropped self-host; re-centered on managed providers + the
"Electron = shared OIDC flow" reality. Rev. 1 assumed Stack Auth; rev. 2 corrected to Better
Auth and weighed self-hosting — now ruled out by the "keep it easy / don't self-host" call.)
**Context owners:** jlee (+ Claude)
**Related:** simplified + gated by [[0003-all-typescript-on-device-pipeline]]; see [[0001-sync-and-processing-architecture]]

## Problem

neeme has **no authentication today** — every endpoint is open and app data (items, todos) is
**global, with no `user_id` scoping**. We need an identity story before any multi-user / synced /
deployed use.

Two constraints now shape the choice:
1. **Managed only — no self-hosting.** Keep it easy to start; we don't want to operate an auth
   service. (This rules out self-hosted Better Auth, which rev. 2 had weighed.)
2. **Must serve both clients: Electron desktop (the flagship) *and* React Native (planned mobile).**

## Two reframes that make this low-stakes

- **Auth defers behind sync (per [[0003-all-typescript-on-device-pipeline]]).** If the app is
  local-first and the on-device store is the source of truth, the **local experience needs no
  login at all.** Auth only matters once we add **accounts / cross-device sync / cloud offload**.
  So this is not on the critical path — pick something reasonable and move on.
- **No provider has a real "Electron SDK."** Desktop auth is the *same pattern everywhere*: OIDC
  **Authorization Code + PKCE** in the **system browser** (never an embedded webview), with a
  **loopback** (`127.0.0.1`) or **custom-scheme** (`neeme://`) redirect, via a generic client lib
  (`openid-client` / AppAuth-JS). Token in OS keychain (`safeStorage`) → the existing
  `getToken()` seam. So "works for Electron" ≈ "supports a public OIDC client with PKCE" — which
  nearly all do. **The real differentiator is the React Native SDK + DX + price**, and because
  it's standard OIDC, **switching providers later is mostly a config change.**

## Options considered (managed only)

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option | React Native | Electron (all via OIDC/PKCE) | DX / ease | Price posture | Notes |
|---|---|---|---|---|---|
| **A. Kinde** | ✅ RN + web SDKs | ⚠️ shared OIDC flow | ✅✅ very easy, modern | ✅ generous free, simple | Consumer-app focused; strong easy-start pick |
| **B. Logto Cloud** | ✅ RN SDK | ✅ OIDC-purist → cleanest desktop flow | ✅ clean | ✅ cheap/modern | Managed **and** OSS — "managed now, self-host someday" stays open, no re-platform |
| **C. Auth0** | ✅ first-class (`react-native-auth0`) | ⚠️ documented desktop sample | ⚠️ powerful but heavy | ⚠️ **7.5k MAU free; per-MAU +~300% ($0.023→$0.07)** | Safe known quantity; cost ceiling at scale; busy console (Okta-owned) |
| **D. Clerk** | ✅ first-class Expo | ❌ **not first-class for Electron** | ✅✅ best DX | ⚠️ Pro $25/mo+ | Dreamy for mobile/web; weak on the desktop flagship → not the fit here |
| **E. Neon Auth (managed Better Auth)** | ⚠️ via BA client | ⚠️ no public-client/device plugin on managed; client-SDK-in-Electron unproven | ✅ if it fits | ✅ in our Neon DB | Branchable users in our DB, but the desktop path is the *least proven* (rev. 2) |
| ~~Self-hosted Better Auth~~ | — | — | — | — | **Ruled out** — we won't operate auth infra |
| ~~Roll-your-own~~ | — | — | — | — | **Rejected** — security footgun |

### Notes

- **A. Kinde** — Easiest on-ramp: modern dashboard, RN + web SDKs, simple/generous pricing, clean
  OIDC for the Electron flow. Good default if "just works, cheap, modern" is the goal.
- **B. Logto Cloud** — OIDC-purist, so the hand-rolled desktop PKCE flow is textbook; real RN SDK;
  **OSS lineage means no lock-in** (could self-host later if the stance changes — useful given
  [[0001-sync-and-processing-architecture]]'s privacy thread). My co-favourite with Kinde.
- **C. Auth0** — Mature, first-class RN, a documented Electron sample. Honest downsides: free tier
  shrank to **7,500 MAU**, per-user price **rose ~300%**, and the console is heavy. Fine to start;
  a cost ceiling later. The "boring, known" choice.
- **D. Clerk** — Best DX and first-class Expo/RN, but **Electron isn't a first-class target**.
  Since neeme-desktop is the flagship, that weakness disqualifies it as the primary pick (revisit
  if mobile/web ever leads).
- **E. Neon Auth / Better Auth (managed)** — Tempting (users branch with our Neon DB, JWKS for
  backend verify), but rev. 2 found the **desktop path least proven**: managed Neon Auth doesn't
  expose the public-client/device plugins, so you'd run the Better Auth client SDK *inside
  Electron*, which isn't documented. Keep as a "watch the roadmap" option, not the starting pick.

## When auth does get built — the three layers

1. **Token issuance** — the chosen managed provider (hosted login + social).
2. **Backend verification** — only exists once there's a cloud/sync backend. Per ADR 0003 that
   backend is **TypeScript**, so it verifies the provider's JWT against the provider's **JWKS URL**
   (e.g. `jose`/`jwks-rsa`) — provider-agnostic, a few lines. (No FastAPI, no cross-language dance.)
3. **Desktop/mobile flow** — **shared OIDC + PKCE** via system browser; token in `safeStorage`
   (desktop) / secure store (RN) → existing `getToken()` seam; silent refresh.

Plus, whenever multi-user lands: the **`user_id` data-scoping migration** to de-global items/todos.

## Recommendation

**Pick a managed, OIDC-clean provider — default to Kinde or Logto Cloud** (modern, cheap, real RN
SDK, painless desktop OIDC). **Auth0** is the safe known fallback if you'd rather a battle-tested
incumbent and accept the price ceiling. **Avoid Clerk as primary** (Electron-weak) and **don't
self-host**. Because it's standard OIDC, treat the choice as **low-commitment and swappable.**

**Sequencing:** **defer building auth until sync/accounts are on the table** (ADR 0003 makes the
local app work without it). When that day comes, **spike the chosen provider's RN SDK + the
Electron system-browser PKCE flow** before committing.

## Consequences

- **Easier:** auth is off the critical path (local-first needs none); standard OIDC = cheap to
  swap providers; one shared desktop/mobile flow; TS backend verifies via JWKS in a few lines.
- **Harder:** the Electron OIDC + `safeStorage` flow is bespoke (no SDK) — but written once;
  whenever multi-user arrives, the backend needs the **`user_id` migration** onto currently-global
  data (and a call on existing unowned rows).
- **Revisit when:** sync/accounts are prioritized; the privacy stance shifts (Logto's self-host
  path, or back toward 0001's E2E goal); or a provider's native/Electron support materially
  improves (e.g. Neon Auth roadmap adds public-client flows).

## Action items (not now — when sync/accounts are scheduled)

1. [ ] Decide provider (lean **Kinde** or **Logto Cloud**); create a project, register a **public
       client** with loopback + `neeme://` redirects.
2. [ ] **Spike:** the provider's **RN SDK** + the **Electron system-browser PKCE** flow →
       `safeStorage` → `getToken()`. Confirm token refresh.
3. [ ] **TS backend:** JWKS-verify middleware; add `user_id` to items/todos + migration; scope all
       queries.
4. [ ] **CSP:** allow the auth + JWKS origins (and redirect handling) in `src/renderer/index.html`.

## Open questions

- Exact current **free-tier limits / pricing** for Kinde and Logto Cloud (verify at decision time).
- **Existing global items/todos** on the multi-user migration — assign to a first user, or wipe in dev?
- Single-user-per-install vs multi-account switching in the desktop app?
- Does identity (who you are) stay cleanly separable from data privacy (server can't read content),
  per 0001 — or co-design if sync goes E2E?

## Sources

- Auth0 free tier / pricing / RN — https://github.com/auth0/react-native-auth0 · https://auth0.com/pricing
- Clerk RN/Expo + Feb-2026 pricing — https://clerk.com/react-authentication · https://clerk.com/pricing
- Logto (cloud + OSS, OIDC, native) — https://blog.logto.io/top-7-auth-providers-2026 · https://logto.io
- Kinde (consumer apps comparison) — https://www.kinde.com/comparisons/authentication-providers-for-consumer-software-apps-compared-top-10-options-in-2026/
- OAuth for native apps (PKCE, system browser, loopback) — RFC 8252
