/**
 * Token broker — Vercel Serverless Function (self-contained, no framework).
 *
 * Deliberately a SINGLE file with zero relative imports: Vercel's @vercel/node
 * builder compiles each api/* entry point but does not reliably bundle local
 * `./src/*` imports under `"type": "module"` (it leaves extensionless ESM
 * imports that Node can't resolve at runtime). Keeping everything inline — and
 * using the native (req, res) Node handler instead of a web framework — sidesteps
 * the whole bundling/resolution problem.
 *
 * POST /token  — Authorization: Bearer <logto_access_token>
 *                → 200 { syncUrl, authToken, expiresAt }
 * GET  /health — readiness probe → 200 { ok: true } | 503 { ok: false, missing }
 *
 * The HTTP plumbing is split from the logic via `handleRequest()`, a pure
 * function over (method, pathname, authHeader) that returns { status, body }.
 * That keeps the broker fully unit-testable without spinning up a server.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createHash } from 'node:crypto'

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrokerTokenResponse {
  syncUrl: string
  authToken: string
  expiresAt: number
}

// ── Logto verification ────────────────────────────────────────────────────────

export class LogtoVerifyError extends Error {
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

export class TursoApiError extends Error {
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

export async function exchangeToken(logtoAccessToken: string): Promise<BrokerTokenResponse> {
  const sub = await verifyLogtoToken(logtoAccessToken)
  const dbName = dbNameForSub(sub)
  await provisionOrLookupDb(dbName)
  const [syncUrl, { authToken, expiresAt }] = await Promise.all([
    getDbUrl(dbName),
    mintDbToken(dbName)
  ])
  return { syncUrl, authToken, expiresAt }
}

// ── Pure HTTP router (framework-agnostic, fully testable) ──────────────────────

export const REQUIRED_ENV = [
  'LOGTO_JWKS_URL',
  'LOGTO_ISSUER',
  'LOGTO_AUDIENCE',
  'TURSO_PLATFORM_TOKEN',
  'TURSO_ORG',
  'TURSO_GROUP'
] as const

export interface HandlerResult {
  status: number
  body: Record<string, unknown>
}

/**
 * Core request handler. Routes on pathname (falling back to method so it works
 * whether Vercel preserves the original /token|/health path or rewrites to
 * /api/token). No I/O beyond the broker exchange — trivial to unit test.
 */
export async function handleRequest(
  method: string,
  pathname: string,
  authHeader: string | null
): Promise<HandlerResult> {
  const isHealth = pathname.endsWith('/health') || (method === 'GET' && !pathname.endsWith('/token'))

  if (isHealth) {
    const missing = REQUIRED_ENV.filter((k) => !process.env[k])
    return missing.length > 0
      ? { status: 503, body: { ok: false, missing } }
      : { status: 200, body: { ok: true } }
  }

  if (method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' } }
  }

  const auth = authHeader ?? ''
  if (!auth.startsWith('Bearer ')) {
    return { status: 401, body: { error: 'Missing or malformed Authorization header' } }
  }

  try {
    const result = await exchangeToken(auth.slice(7))
    return { status: 200, body: { ...result } }
  } catch (err) {
    if (err instanceof LogtoVerifyError) {
      return { status: 401, body: { error: `Token verification failed: ${err.message}` } }
    }
    if (err instanceof TursoApiError) {
      console.error('[broker] Turso API error:', err.message)
      return { status: err.statusCode, body: { error: 'Upstream provisioning error' } }
    }
    console.error('[broker] Unexpected error:', err)
    return { status: 500, body: { error: 'Internal server error' } }
  }
}

// ── Vercel Node handler ────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const method = req.method ?? 'GET'
  const pathname = (req.url ?? '/').split('?')[0]
  const authHeader = (req.headers['authorization'] as string | undefined) ?? null

  const { status, body } = await handleRequest(method, pathname, authHeader)

  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export const config = { runtime: 'nodejs' }
