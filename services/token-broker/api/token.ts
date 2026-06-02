/**
 * Token broker — Vercel Serverless Function (self-contained).
 *
 * All logic is inlined here so Vercel has a single entry point with no local
 * file imports to resolve at runtime.
 *
 * POST /token  — Authorization: Bearer <logto_access_token>
 *                → { syncUrl, authToken, expiresAt }
 * GET  /health — readiness probe
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'

// ── Types ────────────────────────────────────────────────────────────────────

interface BrokerTokenResponse {
  syncUrl: string
  authToken: string
  expiresAt: number
}

// ── Logto verification ────────────────────────────────────────────────────────

class LogtoVerifyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LogtoVerifyError'
  }
}

let jwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksResolver) {
    const jwksUrl = process.env.LOGTO_JWKS_URL
    if (!jwksUrl) throw new Error('LOGTO_JWKS_URL is not set')
    jwksResolver = createRemoteJWKSet(new URL(jwksUrl))
  }
  return jwksResolver
}

async function verifyLogtoToken(token: string): Promise<string> {
  const issuer = process.env.LOGTO_ISSUER
  const audience = process.env.LOGTO_AUDIENCE
  if (!issuer || !audience) throw new Error('LOGTO_ISSUER or LOGTO_AUDIENCE is not set')
  try {
    const { payload } = await jwtVerify(token, getJwks(), { issuer, audience })
    const sub = payload.sub
    if (!sub) throw new LogtoVerifyError('Token has no sub claim')
    return sub
  } catch (err) {
    if (err instanceof LogtoVerifyError) throw err
    throw new LogtoVerifyError(err instanceof Error ? err.message : String(err))
  }
}

// ── Turso Platform API ────────────────────────────────────────────────────────

const TURSO_API = 'https://api.turso.tech/v1'
const DEFAULT_TTL_SECONDS = 3600

class TursoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'TursoApiError'
  }
}

function tursoHeaders(): Record<string, string> {
  const token = process.env.TURSO_PLATFORM_TOKEN
  if (!token) throw new TursoApiError('TURSO_PLATFORM_TOKEN is not set', 500)
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function tursoOrg(): string {
  const o = process.env.TURSO_ORG
  if (!o) throw new TursoApiError('TURSO_ORG is not set', 500)
  return o
}

function tursoGroup(): string {
  const g = process.env.TURSO_GROUP
  if (!g) throw new TursoApiError('TURSO_GROUP is not set', 500)
  return g
}

async function provisionOrLookupDb(name: string): Promise<void> {
  const res = await fetch(`${TURSO_API}/organizations/${tursoOrg()}/databases`, {
    method: 'POST',
    headers: tursoHeaders(),
    body: JSON.stringify({ name, group: tursoGroup() })
  })
  if (res.status === 409) return
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new TursoApiError(`Failed to create DB "${name}": ${body.slice(0, 200)}`, 502)
  }
}

async function getDbUrl(name: string): Promise<string> {
  const res = await fetch(`${TURSO_API}/organizations/${tursoOrg()}/databases/${name}`, {
    headers: tursoHeaders()
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new TursoApiError(`Failed to get DB "${name}": ${body.slice(0, 200)}`, 502)
  }
  const data = (await res.json()) as { database?: { hostname?: string } }
  const hostname = data.database?.hostname
  if (!hostname) throw new TursoApiError(`DB "${name}" has no hostname`, 502)
  return `libsql://${hostname}`
}

async function mintDbToken(name: string): Promise<{ authToken: string; expiresAt: number }> {
  const ttl = parseInt(process.env.TOKEN_TTL_SECONDS ?? String(DEFAULT_TTL_SECONDS), 10)
  const safeTtl = isNaN(ttl) || ttl < 60 ? DEFAULT_TTL_SECONDS : ttl
  const res = await fetch(
    `${TURSO_API}/organizations/${tursoOrg()}/databases/${name}/auth/tokens`,
    {
      method: 'POST',
      headers: tursoHeaders(),
      body: JSON.stringify({ expiration: `${safeTtl}s`, authorization: 'full-access' })
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new TursoApiError(`Failed to mint token for "${name}": ${body.slice(0, 200)}`, 502)
  }
  const data = (await res.json()) as { jwt?: string }
  const jwt = data.jwt
  if (!jwt) throw new TursoApiError(`Turso returned no JWT for "${name}"`, 502)
  return { authToken: jwt, expiresAt: Date.now() + safeTtl * 1000 }
}

// ── Broker orchestration ──────────────────────────────────────────────────────

function dbNameForSub(sub: string): string {
  const hash = createHash('sha256').update(sub).digest('hex').slice(0, 16)
  return `neeme-${hash}`
}

async function exchangeToken(logtoAccessToken: string): Promise<BrokerTokenResponse> {
  const sub = await verifyLogtoToken(logtoAccessToken)
  const dbName = dbNameForSub(sub)
  await provisionOrLookupDb(dbName)
  const [syncUrl, { authToken, expiresAt }] = await Promise.all([
    getDbUrl(dbName),
    mintDbToken(dbName)
  ])
  return { syncUrl, authToken, expiresAt }
}

// ── Hono app ──────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'LOGTO_JWKS_URL',
  'LOGTO_ISSUER',
  'LOGTO_AUDIENCE',
  'TURSO_PLATFORM_TOKEN',
  'TURSO_ORG',
  'TURSO_GROUP'
] as const

const app = new Hono()

app.get('/health', (c) => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k])
  if (missing.length > 0) return c.json({ ok: false, missing }, 503)
  return c.json({ ok: true })
})

app.post('/token', async (c) => {
  const auth = c.req.header('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401)
  }
  try {
    const result = await exchangeToken(auth.slice(7))
    return c.json(result)
  } catch (err) {
    if (err instanceof LogtoVerifyError) {
      return c.json({ error: `Token verification failed: ${err.message}` }, 401)
    }
    if (err instanceof TursoApiError) {
      console.error('[broker] Turso API error:', err.message)
      return c.json({ error: 'Upstream provisioning error' }, err.statusCode as 502)
    }
    console.error('[broker] Unexpected error:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ── Vercel handler ────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  return app.fetch(req)
}

export const config = { runtime: 'nodejs' }
