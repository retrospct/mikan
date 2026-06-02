/**
 * Thin Turso Platform API client.
 *
 * Wraps the three operations the broker needs:
 *   1. provisionOrLookupDb — create a per-user DB (idempotent: 409 = already exists).
 *   2. getDbUrl           — resolve the libSQL sync URL.
 *   3. mintDbToken        — mint a short-lived, DB-scoped token.
 *
 * All network calls are behind this module so tests can mock `fetch` cleanly.
 *
 * Config (env):
 *   TURSO_PLATFORM_TOKEN — org-admin token (server-only, never leaves the broker)
 *   TURSO_ORG            — Turso org slug
 *   TURSO_GROUP          — Turso group name (e.g. "nimi-primary")
 *   TOKEN_TTL_SECONDS    — (optional) DB token lifetime in seconds; default 3600
 *
 * Docs: https://docs.turso.tech/api-reference/databases
 */

const TURSO_API = 'https://api.turso.tech/v1'
const DEFAULT_TTL_SECONDS = 3600

function headers(): Record<string, string> {
  const token = process.env.TURSO_PLATFORM_TOKEN
  if (!token) throw new TursoApiError('TURSO_PLATFORM_TOKEN is not set', 500)
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function org(): string {
  const o = process.env.TURSO_ORG
  if (!o) throw new TursoApiError('TURSO_ORG is not set', 500)
  return o
}

function group(): string {
  const g = process.env.TURSO_GROUP
  if (!g) throw new TursoApiError('TURSO_GROUP is not set', 500)
  return g
}

/**
 * Create the DB if it doesn't exist, or accept a 409 (already exists).
 * The database name is deterministic per user (`neeme-<shortHash(sub)>`),
 * so concurrent requests for the same user are safe.
 */
export async function provisionOrLookupDb(name: string): Promise<void> {
  const url = `${TURSO_API}/organizations/${org()}/databases`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, group: group() })
  })
  if (res.status === 409) return // DB already exists — idempotent
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new TursoApiError(`Failed to create DB "${name}": ${body.slice(0, 200)}`, 502)
  }
}

/**
 * Get the libSQL sync URL for the named database.
 * Returns the string the client passes to `createClient({ syncUrl })`.
 */
export async function getDbUrl(name: string): Promise<string> {
  const url = `${TURSO_API}/organizations/${org()}/databases/${name}`
  const res = await fetch(url, { headers: headers() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new TursoApiError(`Failed to get DB "${name}": ${body.slice(0, 200)}`, 502)
  }
  const data = (await res.json()) as { database?: { hostname?: string } }
  const hostname = data.database?.hostname
  if (!hostname) throw new TursoApiError(`DB "${name}" has no hostname`, 502)
  return `libsql://${hostname}`
}

/**
 * Mint a short-lived, DB-scoped auth token and return it.
 * The expiry is controlled by TOKEN_TTL_SECONDS (env) or DEFAULT_TTL_SECONDS.
 * Returns the raw JWT string and the expiry as a Unix timestamp in ms.
 */
export async function mintDbToken(name: string): Promise<{ authToken: string; expiresAt: number }> {
  const ttl = parseInt(process.env.TOKEN_TTL_SECONDS ?? String(DEFAULT_TTL_SECONDS), 10)
  const safeTtl = isNaN(ttl) || ttl < 60 ? DEFAULT_TTL_SECONDS : ttl

  const url = `${TURSO_API}/organizations/${org()}/databases/${name}/auth/tokens`
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ expiration: `${safeTtl}s`, authorization: 'full-access' })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new TursoApiError(`Failed to mint token for "${name}": ${body.slice(0, 200)}`, 502)
  }
  const data = (await res.json()) as { jwt?: string }
  const jwt = data.jwt
  if (!jwt) throw new TursoApiError(`Turso returned no JWT for "${name}"`, 502)

  return { authToken: jwt, expiresAt: Date.now() + safeTtl * 1000 }
}

export class TursoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'TursoApiError'
  }
}
