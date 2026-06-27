# ADR 0008 — Sync authentication & per-user database provisioning (token broker)

**Status:** ✅ Accepted — signed off by jlee, 2026-06-02. Implementation begins in
`services/token-broker` (see Hosting below).
**Date:** 2026-06-02
**Context owners:** jlee (+ Cursor agent)
**Related:** builds on [[0002-authentication]] (Logto OIDC + PKCE, `safeStorage`, JWKS-verify);
under [[0003-all-typescript-on-device-pipeline]] (TS backend); settles the auth/provisioning
seam of the Turso sync path planned in `docs/plans/sync-cloud-offload.plan.md`; security posture
ties to the field-encryption work (ROADMAP #10). The [[0001-sync-and-processing-architecture]]
amendment (Turso embedded replicas as the sync mechanism) was **Accepted 2026-06-02** — the
assumption this ADR depended on is now resolved.

## Problem

Opt-in cloud sync (ROADMAP #10) uses **Turso / libSQL embedded replicas** with a
**database-per-user** model (one Turso DB per Logto `sub`, because a replica mirrors the *whole*
database — row-scoping can't isolate across devices). That raises an auth + provisioning question
this ADR settles:

> A device is authenticated only with a **Logto** identity. How does it obtain a credential
> scoped to **its** user's Turso database, and how do per-user databases get **created**, without
> ever placing a privileged credential in the client?

A natural-looking shortcut is Turso's **external JWKS** feature (point Turso at the IdP's JWKS so
clients present the IdP JWT directly). Two facts rule it out:

1. **It supports only Clerk and Auth0** (the Turso dashboard states "Maximum 2 endpoints allowed
   (Clerk and Auth0)"). nimi uses **Logto** (ADR 0002) — not supported.
2. **It doesn't provision databases.** Creating a per-user DB needs the Turso **Platform API**
   regardless, which requires an org-admin token that must never ship in the client.

So even if Logto were supported, we'd still need a server. The IdP-support limitation is therefore
moot for us.

## Decision

Adopt a **token broker**: a small, stateless, **server-side TypeScript** service (ADR 0003) that
authenticates the Logto token and brokers Turso access + provisioning. **The client never holds
Turso's admin token and never presents a Logto JWT to Turso** — it presents a Turso-native,
DB-scoped token the broker mints.

### Broker responsibilities

1. Receive the Logto **access token** from the desktop app (`POST`).
2. **JWKS-verify** it (`jose` / `createRemoteJWKSet`, the same approach already in
   `apps/desktop/src/main/auth/logto.ts`) → trust the `sub` claim.
3. **Provision-or-look-up** the user's Turso DB via the Platform API (create on first device,
   keyed by `sub`; the same `syncUrl` is returned to every device of that user).
4. **Mint a short-lived, DB-scoped Turso token** and return `{ syncUrl, authToken, expiresAt }`.

### Client handoff (mirrors the existing connector token pattern)

- Main calls the broker with `await auth.getAccessToken()`, caches `{ syncUrl, authToken }` in
  Electron `safeStorage` (like the Logto refresh token), and **pushes it to the worker** over a
  new `@mikan/contract` channel — the same shape as `call(IPC.connectorsIngest, [provider, token])`.
- The worker builds the embedded replica with that token. On `401`/expiry it asks main to refresh
  (broadcast pattern like `auth.onChange`).
- **The renderer never sees any token** — only scoped `window.api.*` methods cross the
  contextBridge (`docs/SECURITY.md` invariants).

## Options considered

Legend: ✅ strong · ⚠️ caveats · ❌ poor

| Option | Works with Logto? | Provisions per-user DBs? | Admin secret stays server-side? | Verdict |
|---|---|---|---|---|
| **A. Token broker** *(chosen)* | ✅ any IdP (broker verifies) | ✅ yes (Platform API) | ✅ yes | ✅ only option that does all three |
| **B. Turso external JWKS (direct)** | ❌ Clerk/Auth0 only | ❌ no (still needs Platform API) | n/a | ❌ unusable for Logto + incomplete |
| **C. Admin/Platform token in the client** | ✅ | ✅ | ❌ **org-admin token shippable → can read/destroy every user's DB** | ❌ security footgun |

A is the only path that supports Logto, provisions databases, and keeps the privileged credential
off the client. B is the shortcut the dashboard screenshot tempts you toward, but it neither
supports our IdP nor provisions DBs. C is rejected outright.

## Token lifecycle & custody

| Credential | Lives where | Scope / lifetime |
|---|---|---|
| Logto refresh token | Electron `safeStorage` (OS keychain), main | long-lived; never in renderer |
| Logto access token | main, transient | short-lived; only used to call the broker |
| **Turso DB token** | minted by broker → cached in `safeStorage` → passed to worker | **short-lived, scoped to one user's DB**; refreshed on `401` |
| `TURSO_PLATFORM_TOKEN` (org admin) | **broker only (server-side env secret)** | never ships in the app |

## Threat model (what each control buys)

| Threat | Mitigation |
|---|---|
| Client binary reverse-engineered | No admin token present; only a short-lived, single-DB token |
| A user's DB token leaks | Scoped to that user's DB only + short-lived → bounded blast radius, expires fast |
| Renderer/XSS reaches a token | Renderer holds **no** tokens; contextBridge exposes only scoped methods |
| Cloud provider (or broker) is curious/compromised | **Client-side field encryption** → primary holds **ciphertext**; content unreadable server-side |
| Cross-user data exposure | **Database-per-user** → a token can't address another user's DB |
| Broker impersonation | Broker **JWKS-verifies** the Logto token (issuer/audience) before minting anything |

**Residual risk (documented, not mitigated here):** metadata leakage — the cloud still sees row
counts, timestamps, sha256 ids, and sizes. Hiding those requires a CRDT blob mesh (Jazz /
Automerge + relay), parked as a future privacy track in the sync plan and ADR 0001.

## Hosting

The broker is **stateless, called once-per-session, and cached** — cold start is irrelevant.
Host: a **Vercel** function (Hono) in `services/token-broker` — a new pnpm workspace in this
repo (all-TS per ADR 0003). Env secrets: `TURSO_PLATFORM_TOKEN`, `TURSO_ORG`, `TURSO_GROUP`,
`LOGTO_ISSUER`, `LOGTO_AUDIENCE`, `LOGTO_JWKS_URL`, optional `TOKEN_TTL_SECONDS`. Cloudflare
Workers is an equally good alternative. **Not** the (Python, currently-undeployed) neeme FastAPI —
wrong language for the ADR 0003 TS-backend direction.

Desktop integration: main fetches the broker token after Logto login, caches the result in
`safeStorage` (same pattern as the Logto refresh token), injects `NEEME_SYNC_URL` +
`NEEME_SYNC_AUTH_TOKEN` into the worker env before forking — the existing libSQL embedded-replica
client in `apps/desktop/src/main/db/index.ts` picks them up with no changes. Configure broker
mode by setting `NEEME_SYNC_BROKER_URL`; the static `NEEME_SYNC_AUTH_TOKEN` env path remains as
the documented spike fallback.

## Consequences

- **Easier:** decoupled from Turso's IdP support (Logto works); one server owns both provisioning
  and token issuance; reuses the proven Logto JWKS-verify + connector token-passing patterns; the
  privileged token never leaves the server; provider-swappable (the broker abstracts Turso).
- **Harder:** we now run (a tiny) backend — its first piece of real infrastructure beyond the
  desktop app; per-user DB lifecycle (create on first login, **teardown on account delete**) must
  be built and owned; key custody for at-rest field encryption is a separate decision.
- **Spike shortcut (pre-broker):** a hand-created Turso DB + `turso db tokens create` fed via
  `NEEME_SYNC_URL` / `NEEME_SYNC_AUTH_TOKEN` proves the replica loop **before** any broker exists
  (see `docs/setup/turso-credentials.md`). This is what the current #10 slice uses.

## Action items

1. [x] ~~Resolve the [[0001-sync-and-processing-architecture]] amendment (Turso embedded replicas as
       the sync mechanism) — this ADR assumes it.~~ **Done** — ADR 0001 Accepted 2026-06-02.
2. [x] ~~Scaffold `services/token-broker`~~ **Done** — Hono + Vercel function implemented in
       `services/token-broker`; JWKS-verify Logto → Platform-API provision-or-lookup → mint
       DB-scoped token → `{ syncUrl, authToken, expiresAt }`.
3. [x] ~~Add the `@mikan/contract` sync-token channel; main caches in `safeStorage` and pushes to the
       worker.~~ **Done** — `BrokerTokenResponse` in `@mikan/contract/ipc`; main caches token in
       `safeStorage` and injects into worker env at boot; refresh before expiry.
4. [ ] Per-user DB **lifecycle**: provisioning naming (`neeme-<subhash>`) is implemented in the
       broker. **Teardown on account delete** is deferred — needs a delete-account flow first.
5. [x] ~~**CSP:** allow the broker + Logto/JWKS origins in `apps/desktop/src/renderer/index.html`
       (add when broker URL is known).~~ **Resolved — no CSP change needed.** The renderer makes
       none of these calls: the broker exchange runs in **main** (`src/main/sync/broker.ts`,
       Node `fetch`), the Turso replica sync runs in the **worker** utilityProcess, and Logto is
       PKCE in the **system browser** (ADR 0002). The renderer only talks to the worker over IPC,
       so `connect-src 'self'` stays tight (deny-by-default). A `<meta>` CSP governs the renderer
       web context only — it does not restrict main/worker `fetch`. If a renderer-side call to the
       broker/Logto/Turso is ever introduced, this must be revisited (and added to BOTH the meta
       tag and the defense-in-depth response header in `src/main/index.ts`).

## Open questions (need a human)

- **Turso org/billing owner** and the Free→Developer threshold (Free caps at **100 DBs/org** ≈ 100
  users; Developer $4.99/mo lifts it — DB-per-user makes the database *count* the binding limit).
- **At-rest encryption key custody** — per-user key derivation + recovery/escrow story
  (lose-key-lose-cloud-data); is recovery in scope, or accept loss?
- **Account deletion / data teardown** — Platform-API destroy on delete; retention policy.
- **Token TTL + refresh cadence** — balance security (short) vs broker call frequency (cached).

## Sources

- Turso Platform API (database + token creation) — https://docs.turso.tech/api-reference/databases
- Turso external JWKS (Clerk/Auth0) — Turso dashboard "JWKS Endpoints" (observed 2026-06)
- Logto OIDC / JWKS — https://logto.io ; `apps/desktop/src/main/auth/logto.ts`
- OAuth for native apps (PKCE, system browser) — RFC 8252
- nimi sync plan — `docs/plans/sync-cloud-offload.plan.md`
