/**
 * Pure OIDC helpers for the Logto native-app flow — deliberately free of
 * `electron` and `import.meta.env` so they can be unit-tested in plain Node.
 *
 * `logto.ts` is the stateful shell (env config, session, persistence, IPC); the
 * standalone, side-effect-free pieces of the flow live here: PKCE, the authorize
 * URL, claim extraction, and id_token verification (signature + iss/aud/exp/nonce).
 */
import { createHash, randomBytes } from 'node:crypto'
import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { AuthClaims } from '@nimi/contract/ipc'

/** A verification key: a resolver (prod JWKS) or a concrete key (tests). */
type VerifyKey = JWTVerifyGetKey | CryptoKey | Uint8Array

/** RFC 4648 §5 base64url (no padding) — used for PKCE verifier/challenge + state/nonce. */
export function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A high-entropy PKCE code verifier (RFC 7636 — 43–128 chars of base64url). */
export function randomVerifier(): string {
  return base64url(randomBytes(32))
}

/** Opaque CSRF state, echoed back on the callback and checked for a match. */
export function randomState(): string {
  return base64url(randomBytes(16))
}

/** Opaque nonce, bound into the id_token and checked after signature verify. */
export function randomNonce(): string {
  return base64url(randomBytes(16))
}

/** S256 PKCE challenge for a given verifier. */
export function pkceChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

export interface AuthorizeUrlParams {
  authorizationEndpoint: string
  clientId: string
  redirectUri: string
  scope: string
  challenge: string
  state: string
  nonce: string
  resource?: string
}

/** Build the system-browser authorize URL (Authorization Code + PKCE). */
export function buildAuthorizeUrl(p: AuthorizeUrlParams): string {
  const url = new URL(p.authorizationEndpoint)
  url.searchParams.set('client_id', p.clientId)
  url.searchParams.set('redirect_uri', p.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', p.scope)
  url.searchParams.set('code_challenge', p.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', p.state)
  url.searchParams.set('nonce', p.nonce)
  url.searchParams.set('prompt', 'consent')
  if (p.resource) url.searchParams.set('resource', p.resource)
  return url.toString()
}

/** Project a verified JWT payload to the display claims the UI shows. */
export function claimsFromPayload(payload: JWTPayload): AuthClaims {
  return {
    sub: String(payload.sub ?? ''),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined
  }
}

export interface VerifyIdTokenOptions {
  /** JWKS resolver (prod: `createRemoteJWKSet(...)`; tests: a local public key). */
  jwks: VerifyKey
  issuer: string
  /** Expected audience — the OIDC client_id (Logto App ID). */
  audience: string
  /** The nonce sent on the authorize request; must match the token's `nonce`. */
  nonce?: string
}

/**
 * Verify an id_token's signature and standard claims (iss/aud/exp) via JWKS,
 * then assert the `nonce` binding. Throws on any failure. Returns the payload.
 */
export async function verifyIdToken(
  idToken: string,
  opts: VerifyIdTokenOptions
): Promise<JWTPayload> {
  const claims = { issuer: opts.issuer, audience: opts.audience }
  // Two jwtVerify overloads — a key resolver (prod JWKS) vs. a concrete key
  // (tests). Narrow on `function` so each call binds to a single overload.
  const { payload } =
    typeof opts.jwks === 'function'
      ? await jwtVerify(idToken, opts.jwks, claims)
      : await jwtVerify(idToken, opts.jwks, claims)
  if (opts.nonce && payload.nonce !== opts.nonce) {
    throw new Error('id_token nonce mismatch')
  }
  return payload
}
