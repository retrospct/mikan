/**
 * Broker orchestration — the core of ADR 0008.
 *
 * Given a raw Logto access token:
 *   1. JWKS-verify it → extract the `sub` claim.
 *   2. Derive a stable DB name: `neeme-<shortHash(sub)>`.
 *   3. Provision-or-lookup the user's Turso DB via the Platform API.
 *   4. Mint a short-lived, DB-scoped token.
 *   5. Return { syncUrl, authToken, expiresAt }.
 *
 * Fail-closed: any error in steps 1–4 propagates as a typed error that the
 * Hono handler maps to the appropriate HTTP status code.
 */
import { createHash } from 'node:crypto'
import { verifyLogtoToken, LogtoVerifyError } from './logto.ts'
import { provisionOrLookupDb, getDbUrl, mintDbToken, TursoApiError } from './turso.ts'

export { LogtoVerifyError, TursoApiError }

export interface BrokerTokenResponse {
  syncUrl: string
  authToken: string
  expiresAt: number
}

/**
 * Derive a stable, url-safe database name from a Logto sub claim.
 * Uses the first 16 hex chars of the SHA-256 of the sub — long enough to be
 * collision-resistant for realistic user counts, short enough for Turso's
 * 63-char DB name limit. Format: `neeme-<16 hex chars>`.
 */
function dbNameForSub(sub: string): string {
  const hash = createHash('sha256').update(sub).digest('hex').slice(0, 16)
  return `neeme-${hash}`
}

/**
 * Exchange a Logto access token for a DB-scoped Turso sync token.
 * Throws `LogtoVerifyError` (→ 401) or `TursoApiError` (→ 502).
 */
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
