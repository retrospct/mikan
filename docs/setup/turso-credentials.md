# Turso credentials handoff — ROADMAP #10 spike

This document tells you exactly what to create in Turso Cloud to flip `NEEME_SYNC=on`
and run the first two-device replica smoke test. Everything in the codebase is already
wired; you just need the credentials below.

---

## What you need to create (one-time)

### 1. Turso account + org

1. Sign in at <https://turso.tech>.
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

### 5. (Optional) Encryption key

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
# Required to enable sync
NEEME_SYNC=on
NEEME_SYNC_URL=libsql://nimi-test-<org>.turso.io    # from step 3
NEEME_SYNC_AUTH_TOKEN=eyJ...                         # from step 4

# Optional: at-rest field encryption (strongly recommended before any real data)
NEEME_SYNC_ENCRYPTION_KEY=<64-hex-chars>             # from step 5

# Optional: sync interval (default 300 s = 5 min)
NEEME_SYNC_INTERVAL_S=60
```

Then launch the app:

```sh
NEEME_SYNC=on \
NEEME_SYNC_URL=libsql://nimi-test-<org>.turso.io \
NEEME_SYNC_AUTH_TOKEN=eyJ... \
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
   (+ same `NEEME_SYNC_ENCRYPTION_KEY` if using encryption). On boot the worker calls
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

## Future automation (after the spike validates)

Once the two-device loop works, the next steps are:

1. **Token broker** — a Vercel/Hono function that JWKS-verifies the Logto access token,
   provisions a per-user Turso DB via the Platform API, and mints a short-lived token.
   Env vars: `TURSO_PLATFORM_TOKEN`, `TURSO_ORG`, `TURSO_GROUP`, `LOGTO_ISSUER`,
   `LOGTO_AUDIENCE`, `LOGTO_JWKS_URL`.
2. **Per-user DB naming** — local replica path keyed by `shortHash(sub)` so account
   switching uses a separate replica. See `todo: identity-per-user-db` in the plan.
3. **safeStorage key custody** — derive + seal `NEEME_SYNC_ENCRYPTION_KEY` in Electron
   `safeStorage` instead of env. See `todo: at-rest-encryption` in the plan.

See `docs/plans/sync-cloud-offload.plan.md` for the full architecture.
