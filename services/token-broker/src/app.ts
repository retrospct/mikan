/**
 * Token broker — Hono HTTP app factory.
 *
 * Endpoints:
 *   POST /token   — Exchange a Logto access token for a DB-scoped Turso token.
 *                   Authorization: Bearer <logto_access_token>
 *   GET  /health  — Readiness probe (checks required env vars).
 *
 * Imported by both the local dev server (src/index.ts) and the Vercel handler
 * (api/token.ts). Stateless — safe to call multiple times.
 */
import { Hono } from 'hono'
import { exchangeToken, LogtoVerifyError, TursoApiError } from './broker.ts'

export const REQUIRED_ENV = [
  'LOGTO_JWKS_URL',
  'LOGTO_ISSUER',
  'LOGTO_AUDIENCE',
  'TURSO_PLATFORM_TOKEN',
  'TURSO_ORG',
  'TURSO_GROUP'
] as const

export function createApp(): Hono {
  const app = new Hono()

  app.get('/health', (c) => {
    const missing = REQUIRED_ENV.filter((k) => !process.env[k])
    if (missing.length > 0) {
      return c.json({ ok: false, missing }, 503)
    }
    return c.json({ ok: true })
  })

  app.post('/token', async (c) => {
    const auth = c.req.header('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or malformed Authorization header' }, 401)
    }
    const logtoToken = auth.slice(7)

    try {
      const result = await exchangeToken(logtoToken)
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

  return app
}
