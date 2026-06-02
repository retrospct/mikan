/**
 * Logto access-token verifier for the token broker.
 *
 * Mirrors the desktop pattern in apps/desktop/src/main/auth/logto.ts:
 * uses `jose` `createRemoteJWKSet` + `jwtVerify` so the same verification
 * logic runs server-side. The broker trusts the `sub` claim only after the
 * full iss/aud/exp/signature check passes.
 *
 * Config (env):
 *   LOGTO_JWKS_URL   — e.g. https://<logto-domain>/oidc/jwks
 *   LOGTO_ISSUER     — e.g. https://<logto-domain>/oidc
 *   LOGTO_AUDIENCE   — the Logto API resource indicator (or app-id for M2M)
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'

let jwksResolver: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksResolver) {
    const jwksUrl = process.env.LOGTO_JWKS_URL
    if (!jwksUrl) throw new Error('LOGTO_JWKS_URL is not set')
    jwksResolver = createRemoteJWKSet(new URL(jwksUrl))
  }
  return jwksResolver
}

/**
 * Verify a Logto access token and return the `sub` claim.
 * Throws `LogtoVerifyError` on any verification failure (expired, wrong iss,
 * wrong aud, bad signature). The caller should map this to HTTP 401.
 */
export async function verifyLogtoToken(token: string): Promise<string> {
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

export class LogtoVerifyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LogtoVerifyError'
  }
}
