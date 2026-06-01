/**
 * Unit tests for the pure OIDC helpers (src/main/auth/oidc.ts).
 *
 * Tier A: no Electron, no DB, no network. id_token verification is exercised
 * against a locally generated keypair — we sign tokens with the private key and
 * verify with the matching public key, so JWKS behavior is covered offline.
 */
import { describe, it, expect } from 'vitest'
import { SignJWT, generateKeyPair } from 'jose'
import {
  buildAuthorizeUrl,
  claimsFromPayload,
  pkceChallenge,
  randomNonce,
  randomState,
  randomVerifier,
  verifyIdToken
} from '../../src/main/auth/oidc'

const ISS = 'https://tenant.logto.app/oidc'
const AUD = 'my-app-id'

// ── PKCE + random tokens ────────────────────────────────────────────────────

describe('pkceChallenge', () => {
  it('is deterministic for a fixed verifier', () => {
    expect(pkceChallenge('fixed-verifier')).toBe(pkceChallenge('fixed-verifier'))
  })

  it('produces a base64url S256 digest (43 chars, no padding)', () => {
    const challenge = pkceChallenge(randomVerifier())
    expect(challenge).toHaveLength(43)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('differs across distinct verifiers', () => {
    expect(pkceChallenge('a')).not.toBe(pkceChallenge('b'))
  })
})

describe('random token generators', () => {
  it('emit base64url with sufficient entropy and uniqueness', () => {
    for (const gen of [randomVerifier, randomState, randomNonce]) {
      const a = gen()
      const b = gen()
      expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(a.length).toBeGreaterThanOrEqual(22)
      expect(a).not.toBe(b)
    }
  })
})

// ── authorize URL ───────────────────────────────────────────────────────────

describe('buildAuthorizeUrl', () => {
  const base = {
    authorizationEndpoint: 'https://tenant.logto.app/oidc/auth',
    clientId: AUD,
    redirectUri: 'neeme://callback',
    scope: 'openid profile offline_access',
    challenge: 'CHALLENGE',
    state: 'STATE',
    nonce: 'NONCE'
  }

  it('sets the required Authorization Code + PKCE params', () => {
    const url = new URL(buildAuthorizeUrl(base))
    const q = url.searchParams
    expect(q.get('client_id')).toBe(AUD)
    expect(q.get('redirect_uri')).toBe('neeme://callback')
    expect(q.get('response_type')).toBe('code')
    expect(q.get('scope')).toBe('openid profile offline_access')
    expect(q.get('code_challenge')).toBe('CHALLENGE')
    expect(q.get('code_challenge_method')).toBe('S256')
    expect(q.get('state')).toBe('STATE')
    expect(q.get('nonce')).toBe('NONCE')
  })

  it('omits resource when not provided and includes it when set', () => {
    expect(new URL(buildAuthorizeUrl(base)).searchParams.has('resource')).toBe(false)
    const withRes = new URL(buildAuthorizeUrl({ ...base, resource: 'https://api.neeme.app' }))
    expect(withRes.searchParams.get('resource')).toBe('https://api.neeme.app')
  })
})

// ── claims projection ─────────────────────────────────────────────────────────

describe('claimsFromPayload', () => {
  it('maps the display claims and drops non-string fields', () => {
    expect(
      claimsFromPayload({ sub: 'u1', email: 'a@b.co', name: 'Ada', picture: 'http://x/p.png' })
    ).toEqual({ sub: 'u1', email: 'a@b.co', name: 'Ada', picture: 'http://x/p.png' })

    expect(claimsFromPayload({ sub: 'u2', email: 42 as unknown as string })).toEqual({
      sub: 'u2',
      email: undefined,
      name: undefined,
      picture: undefined
    })
  })
})

// ── id_token verification ─────────────────────────────────────────────────────

async function signIdToken(
  key: CryptoKey,
  claims: Record<string, unknown> = {},
  opts: { iss?: string; aud?: string; exp?: string | number } = {}
): Promise<string> {
  return new SignJWT({ nonce: 'NONCE', ...claims })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? AUD)
    .setSubject('user-123')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(key)
}

describe('verifyIdToken', () => {
  it('accepts a correctly signed token and returns the payload', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signIdToken(privateKey, { email: 'a@b.co', name: 'Ada' })
    const payload = await verifyIdToken(token, {
      jwks: publicKey,
      issuer: ISS,
      audience: AUD,
      nonce: 'NONCE'
    })
    expect(payload.sub).toBe('user-123')
    expect(claimsFromPayload(payload)).toMatchObject({ email: 'a@b.co', name: 'Ada' })
  })

  it('rejects a tampered signature', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signIdToken(privateKey)
    const tampered = token.slice(0, -3) + (token.endsWith('A') ? 'BBB' : 'AAA')
    await expect(
      verifyIdToken(tampered, { jwks: publicKey, issuer: ISS, audience: AUD, nonce: 'NONCE' })
    ).rejects.toThrow()
  })

  it('rejects a wrong issuer', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signIdToken(privateKey, {}, { iss: 'https://evil.example/oidc' })
    await expect(
      verifyIdToken(token, { jwks: publicKey, issuer: ISS, audience: AUD, nonce: 'NONCE' })
    ).rejects.toThrow()
  })

  it('rejects a wrong audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signIdToken(privateKey, {}, { aud: 'someone-else' })
    await expect(
      verifyIdToken(token, { jwks: publicKey, issuer: ISS, audience: AUD, nonce: 'NONCE' })
    ).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signIdToken(privateKey, {}, { exp: Math.floor(Date.now() / 1000) - 60 })
    await expect(
      verifyIdToken(token, { jwks: publicKey, issuer: ISS, audience: AUD, nonce: 'NONCE' })
    ).rejects.toThrow()
  })

  it('rejects a nonce mismatch', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signIdToken(privateKey, { nonce: 'OTHER' })
    await expect(
      verifyIdToken(token, { jwks: publicKey, issuer: ISS, audience: AUD, nonce: 'NONCE' })
    ).rejects.toThrow(/nonce/)
  })

  it('skips the nonce check when no nonce is expected (refresh grant)', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const token = await signIdToken(privateKey, { nonce: 'WHATEVER' })
    const payload = await verifyIdToken(token, { jwks: publicKey, issuer: ISS, audience: AUD })
    expect(payload.sub).toBe('user-123')
  })
})
