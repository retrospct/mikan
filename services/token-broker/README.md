# @mikan/token-broker

Logto → Turso token broker. Implements ADR 0008: a stateless server-side TS service that JWKS-verifies the Logto access token and mints a short-lived, DB-scoped Turso token for the caller's personal embedded replica.

**Never placed in the client.** The Turso org-admin token lives here only.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/token` | Exchange a Logto access token for a Turso sync token |
| `GET` | `/health` | Readiness probe — reports missing env vars |

### POST /token

```
Authorization: Bearer <logto_access_token>
→ 200 { syncUrl: string, authToken: string, expiresAt: number }
→ 401 if token is invalid or expired
→ 502 if the Turso Platform API fails
→ 503 if required env vars are missing (/health)
```

`expiresAt` is a Unix timestamp in milliseconds. The desktop client refreshes ~60 s before expiry.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LOGTO_JWKS_URL` | yes | Logto JWKS endpoint, e.g. `https://<domain>/oidc/jwks` |
| `LOGTO_ISSUER` | yes | Logto issuer, e.g. `https://<domain>/oidc` |
| `LOGTO_AUDIENCE` | yes | Logto API resource or app-id |
| `TURSO_PLATFORM_TOKEN` | yes | Turso org-admin token (never shipped to clients) |
| `TURSO_ORG` | yes | Turso org slug |
| `TURSO_GROUP` | yes | Turso group name, e.g. `nimi-primary` |
| `TOKEN_TTL_SECONDS` | no | DB token lifetime; default 3600 (1 h) |
| `PORT` | no | Local dev port; default 3100 |

## Local development

```sh
# From the monorepo root
cd services/token-broker

# Set env vars (or use a .env file with `dotenv-cli`)
export LOGTO_JWKS_URL=https://your-logto-domain/oidc/jwks
export LOGTO_ISSUER=https://your-logto-domain/oidc
export LOGTO_AUDIENCE=your-api-resource
export TURSO_PLATFORM_TOKEN=your-turso-token
export TURSO_ORG=your-org-slug
export TURSO_GROUP=nimi-primary

pnpm dev
# → http://localhost:3100

# Quick smoke (health check with placeholder env)
curl http://localhost:3100/health
```

## Deployment (Vercel)

```sh
# From services/token-broker
vercel env add LOGTO_JWKS_URL production
# ... repeat for all env vars ...
vercel --prod
```

Set the deployed URL as `NEEME_SYNC_BROKER_URL` in the desktop app's env (or Electron launch config). The broker origin also needs to be added to the CSP in `apps/desktop/src/renderer/index.html` (ADR 0008 action item #5).

## Tests

```sh
pnpm test   # runs offline — no real Logto or Turso creds needed
```

The test suite generates a local RSA keypair with `jose`, stubs a JWKS endpoint, and mocks `fetch` for the Turso Platform API. See `test/broker.test.ts`.

## Database naming

Each user's Turso DB is named `neeme-<16 hex chars of SHA-256(sub)>`. The name is deterministic and stable per Logto `sub`, so:
- Every device of the same user gets the same `syncUrl`.
- Concurrent first-login requests for the same user are safe (Turso returns 409 on duplicate create, which the broker treats as success).
- DB names stay within Turso's 63-character limit.

## Implementation note

All logic lives in a **single self-contained `api/token.ts`** with no relative imports and no web framework — just the native Vercel `(req, res)` Node handler. This is deliberate: Vercel's `@vercel/node` builder compiles each `api/*` entry point but does not reliably bundle local `./src/*` imports under `"type": "module"`, leaving extensionless ESM imports that crash at runtime (`ERR_MODULE_NOT_FOUND`). Keep new logic inline here rather than splitting it back into `src/` modules. `src/index.ts` is a local-dev-only HTTP server that reuses the same `handleRequest()` core and is never deployed.

## Architecture reference

See [docs/adr/0008-sync-auth-token-broker.md](../../docs/adr/0008-sync-auth-token-broker.md) for the full decision record (threat model, option table, token lifecycle, open questions).
