# Turso credentials handoff — ROADMAP #10 spike

This document tells you exactly what to create in Turso Cloud to flip `NEEME_SYNC=on`
and run the first two-device replica smoke test. Everything in the codebase is already
wired; you just need the credentials below.

---

## What you need to create (one-time)

### 1. Turso account + org

1. Sign in at [https://turso.tech](https://turso.tech).
2. Create (or use) an **organization**. Note the **org slug** (shown in the URL or
  in `turso org list`).
3. Choose a **plan**:
  - **Free** — 100 databases/org cap; fine for a closed cohort of < ~80 devices.
  - **Developer ($4.99/mo)** — unlimited databases; use this the moment you might
  exceed ~80 user-DBs.

### 2. A group in a region near testers

```sh
turso group create nimi-primary --location sjc   # or lhr, fra, etc.
```

Record the **group name** (`nimi-primary`).

### 3. A database for the spike

For the spike, create one hand-crafted DB — you don't need the per-user provisioning
automation yet.

```sh
turso db create nimi-test --group nimi-primary
```

This gives you the **sync URL**:

```sh
turso db show nimi-test --url
# → libsql://nimi-test-<org>.turso.io
```

### 4. A database token

```sh
turso db tokens create nimi-test --expiration 7d
# → eyJ...  (copy this; it's the authToken)
```

Tokens expire. For longer spikes use `--expiration 30d` or `never` (rotate manually).

### 5. Encryption key (REQUIRED)

Sync now **refuses to enable** without a valid `NEEME_SYNC_ENCRYPTION_KEY` (64 hex
chars). This guarantees encryption at rest — plaintext content is never written to the
cloud primary. If the key is missing or malformed, the app stays fully local-first and
reports the reason in sync status.

Generate a fresh 32-byte key for at-rest field encryption:

```sh
cd apps/desktop
NEEME_USER_DATA=/tmp pnpm exec tsx -e \
  "import { generateKey } from './src/main/db/crypto.ts'; generateKey()"
# → NEEME_SYNC_ENCRYPTION_KEY=<64-hex-chars>
```

Copy the full `NEEME_SYNC_ENCRYPTION_KEY=…` line. Store it somewhere safe — losing it
means the encrypted rows on the cloud primary cannot be decrypted.

---

## Environment variables to set

Add these to your shell (or `.env.local`, or an Electron launch config):

```sh
# Required to enable sync (all four — sync fails closed if the key is missing/invalid)
NEEME_SYNC=on
NEEME_SYNC_URL=libsql://nimi-test-<org>.turso.io    # from step 3
NEEME_SYNC_AUTH_TOKEN=eyJ...                         # from step 4
NEEME_SYNC_ENCRYPTION_KEY=<64-hex-chars>             # from step 5 (mandatory)

# Optional: sync interval (default 300 s = 5 min)
NEEME_SYNC_INTERVAL_S=60
```

Then launch the app:

```sh
NEEME_SYNC=on \
NEEME_SYNC_URL=libsql://nimi-test-<org>.turso.io \
NEEME_SYNC_AUTH_TOKEN=eyJ... \
NEEME_SYNC_ENCRYPTION_KEY=<64-hex-chars> \
NEEME_EMBEDDER=hash \
pnpm dev
```

---

## Smoke test: two-device replica loop

1. **Device A** — launch with the env vars above, capture a note.
2. Check the Turso console to confirm a row appeared in the primary:
  ```sh
   turso db shell nimi-test "SELECT id, source_name FROM items LIMIT 5;"
  ```
3. **Device B** — launch with the **same** `NEEME_SYNC_URL` + `NEEME_SYNC_AUTH_TOKEN`
  - the **same** `NEEME_SYNC_ENCRYPTION_KEY` (required, and it must match Device A or the
   pulled rows cannot be decrypted). On boot the worker calls
   `syncNow()` which pulls from the primary. The note from Device A should appear in
   the archive feed.
4. Confirm Device B can search semantically — `reindexAll()` runs via `syncEmbedder()`
  at startup and rebuilds the local `chunks` vector index from the synced `items`.

---

## What is NOT needed for this spike

- **Token broker** — manual `NEEME_SYNC_AUTH_TOKEN` from step 4 replaces it.
- **Per-user DB provisioning** — one hand-crafted DB is enough to validate the loop.
- **Logto authentication** — sync works independently of the auth flow.
- **Multi-DB Schema** — not required until you provision per-user DBs automatically.

---

## Token broker mode (ADR 0008 — built, awaiting real creds)

The token broker is now implemented in `services/token-broker`. It replaces the manual
token flow above for production use. To switch from spike mode (manual env vars) to broker
mode:

### What the broker does

1. Desktop main calls `POST /token` with `Authorization: Bearer <Logto access token>`.
2. Broker JWKS-verifies the Logto token → extracts `sub`.
3. Broker provisions `neeme-<hash(sub)>` in Turso (idempotent — safe to call repeatedly).
4. Broker mints a short-lived, DB-scoped token and returns `{ syncUrl, authToken, expiresAt }`.
5. Desktop injects `NEEME_SYNC_URL` + `NEEME_SYNC_AUTH_TOKEN` before forking the worker.

### Broker credentials to provision (your side)

| Secret | Where to get it |
|--------|-----------------|
| `TURSO_PLATFORM_TOKEN` | Turso console → Settings → API Tokens → create org-admin token |
| `TURSO_ORG` | Your org slug (visible in the Turso URL or `turso org list`) |
| `TURSO_GROUP` | Group you created in step 2 above (e.g. `nimi-primary`) |
| `LOGTO_JWKS_URL` | `https://<your-logto-domain>/oidc/jwks` |
| `LOGTO_ISSUER` | `https://<your-logto-domain>/oidc` |
| `LOGTO_AUDIENCE` | Your Logto API resource indicator |

### Deploy the broker

```sh
cd services/token-broker
# Add secrets to Vercel
vercel env add TURSO_PLATFORM_TOKEN production
vercel env add TURSO_ORG production
vercel env add TURSO_GROUP production
vercel env add LOGTO_JWKS_URL production
vercel env add LOGTO_ISSUER production
vercel env add LOGTO_AUDIENCE production
# Deploy
vercel --prod
```

### Enable broker mode in the desktop app

Set `NEEME_SYNC_BROKER_URL` to your deployed broker URL. The static
`NEEME_SYNC_AUTH_TOKEN` env path (the spike approach above) still works as a fallback
if the broker is not configured.

```sh
NEEME_SYNC=on \
NEEME_SYNC_BROKER_URL=https://your-broker.vercel.app \
NEEME_SYNC_ENCRYPTION_KEY=<64-hex-chars> \
NEEME_EMBEDDER=hash \
pnpm dev
```

> Note: `NEEME_SYNC_URL` and `NEEME_SYNC_AUTH_TOKEN` do **not** need to be set manually
> in broker mode — main fetches them from the broker at boot and injects them before
> forking the worker.

### Future items (not broker-specific)

1. **safeStorage key custody** — derive + seal `NEEME_SYNC_ENCRYPTION_KEY` in Electron
   `safeStorage` instead of env. See `todo: at-rest-encryption` in the plan.
2. **Account deletion / teardown** — delete the user's Turso DB via the Platform API
   when the account is deleted (ADR 0008 action item #4).
3. **CSP** — add the broker + Logto/JWKS origins to `apps/desktop/src/renderer/index.html`
   once the broker URL is known (ADR 0008 action item #5).

See `docs/plans/sync-cloud-offload.plan.md` for the full architecture and
`services/token-broker/README.md` for the broker service documentation.