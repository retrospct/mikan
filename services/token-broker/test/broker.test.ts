/**
 * Token broker tests — fully offline (no real Logto or Turso creds needed).
 *
 * Uses:
 *   - A locally generated RSA-2048 keypair (jose generateKeyPair) to sign JWTs.
 *   - A stubbed JWKS endpoint via fetch mock.
 *   - A mocked fetch for all Turso Platform API calls.
 *
 * All logic lives in a single self-contained api/token.ts (no framework), so
 * the HTTP layer is tested via the pure handleRequest() core rather than a
 * server.
 */
import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

// ── Key generation (once per suite) ──────────────────────────────────────────

interface KeySet {
  sign: (payload: { sub: string; exp?: number }) => Promise<string>
  jwks: () => object
}

async function makeKeySet(): Promise<KeySet> {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const pub = await exportJWK(publicKey)
  pub.kid = 'test-key-1'
  pub.use = 'sig'
  pub.alg = 'RS256'

  const sign = async (payload: { sub: string; exp?: number }): Promise<string> => {
    return new SignJWT({ sub: payload.sub })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setIssuer('https://logto.test/oidc')
      .setAudience('test-audience')
      .setIssuedAt()
      .setExpirationTime(payload.exp ? new Date(payload.exp * 1000) : '1h')
      .sign(privateKey)
  }

  const jwks = () => ({ keys: [pub] })

  return { sign, jwks }
}

// ── Env helpers ───────────────────────────────────────────────────────────────

function setEnv(overrides: Record<string, string> = {}): void {
  process.env.LOGTO_JWKS_URL = 'https://logto.test/oidc/jwks'
  process.env.LOGTO_ISSUER = 'https://logto.test/oidc'
  process.env.LOGTO_AUDIENCE = 'test-audience'
  process.env.TURSO_PLATFORM_TOKEN = 'test-turso-token'
  process.env.TURSO_ORG = 'test-org'
  process.env.TURSO_GROUP = 'test-group'
  process.env.TOKEN_TTL_SECONDS = '3600'
  Object.assign(process.env, overrides)
}

// ── Turso API mock helpers ────────────────────────────────────────────────────

function makeTursoFetch(opts: { createStatus?: number; getStatus?: number; mintStatus?: number } = {}) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method?.toUpperCase() ?? 'GET'
    const urlStr = String(url)

    // JWKS endpoint (Logto)
    if (urlStr.includes('logto.test')) {
      return new Response(JSON.stringify(keySet.jwks()), { status: 200 })
    }

    // Turso: POST /databases → create
    if (method === 'POST' && urlStr.includes('/databases') && !urlStr.includes('/auth')) {
      const status = opts.createStatus ?? 201
      if (status === 409) return new Response(JSON.stringify({ error: 'already exists' }), { status: 409 })
      if (status >= 400) return new Response('error', { status })
      return new Response(JSON.stringify({ database: { name: 'neeme-test' } }), { status: 201 })
    }

    // Turso: GET /databases/:name → db info
    if (method === 'GET' && urlStr.match(/\/databases\/[^/]+$/)) {
      const status = opts.getStatus ?? 200
      if (status >= 400) return new Response('error', { status })
      return new Response(JSON.stringify({ database: { hostname: 'neeme-test-test-org.turso.io' } }), { status: 200 })
    }

    // Turso: POST /databases/:name/auth/tokens → mint
    if (method === 'POST' && urlStr.includes('/auth/tokens')) {
      const status = opts.mintStatus ?? 200
      if (status >= 400) return new Response('error', { status })
      return new Response(JSON.stringify({ jwt: 'minted-turso-jwt' }), { status: 200 })
    }

    return new Response('unexpected url: ' + urlStr, { status: 404 })
  }
}

// ── Test state ────────────────────────────────────────────────────────────────

let keySet: KeySet

beforeAll(async () => {
  keySet = await makeKeySet()
})

beforeEach(() => {
  setEnv()
  // api/token.ts caches the JWKS resolver in a module-level singleton — reset
  // the module registry so each test gets a fresh resolver.
  vi.resetModules()
})

// ── exchangeToken — happy path ──────────────────────────────────────────────────

describe('exchangeToken — happy path', () => {
  it('returns syncUrl + authToken + expiresAt for a valid token', async () => {
    const jwt = await keySet.sign({ sub: 'user-123' })
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch()))

    const { exchangeToken } = await import('../api/token')
    const result = await exchangeToken(jwt)

    expect(result.syncUrl).toBe('libsql://neeme-test-test-org.turso.io')
    expect(result.authToken).toBe('minted-turso-jwt')
    expect(result.expiresAt).toBeGreaterThan(Date.now())
  })

  it('idempotent on 409 (DB already exists)', async () => {
    const jwt = await keySet.sign({ sub: 'existing-user' })
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch({ createStatus: 409 })))

    const { exchangeToken } = await import('../api/token')
    const result = await exchangeToken(jwt)

    expect(result.syncUrl).toContain('libsql://')
    expect(result.authToken).toBe('minted-turso-jwt')
  })

  it('derives a consistent DB name from the same sub', async () => {
    const jwt1 = await keySet.sign({ sub: 'stable-user' })
    const jwt2 = await keySet.sign({ sub: 'stable-user' })
    const calls: string[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return makeTursoFetch()(url, init)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { exchangeToken } = await import('../api/token')
    await exchangeToken(jwt1)
    const dbCallsForFirst = calls.filter(c => c.includes('/databases/')).map(c => c.replace(/.*\/databases\//, '').split('/')[0])

    calls.length = 0
    await exchangeToken(jwt2)
    const dbCallsForSecond = calls.filter(c => c.includes('/databases/')).map(c => c.replace(/.*\/databases\//, '').split('/')[0])

    expect(dbCallsForFirst[0]).toBe(dbCallsForSecond[0])
  })
})

// ── exchangeToken — invalid Logto token ──────────────────────────────────────────

describe('exchangeToken — invalid Logto token', () => {
  it('throws LogtoVerifyError for a garbage token', async () => {
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch()))

    const { exchangeToken, LogtoVerifyError } = await import('../api/token')
    await expect(exchangeToken('not.a.jwt')).rejects.toThrow(LogtoVerifyError)
  })

  it('throws LogtoVerifyError for an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    const jwt = await keySet.sign({ sub: 'expired-user', exp: past })
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch()))

    const { exchangeToken, LogtoVerifyError } = await import('../api/token')
    await expect(exchangeToken(jwt)).rejects.toThrow(LogtoVerifyError)
  })

  it('throws LogtoVerifyError when JWKS fetch fails', async () => {
    const jwt = await keySet.sign({ sub: 'user-x' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('logto.test')) return new Response('gone', { status: 503 })
      return makeTursoFetch()(url)
    }))

    const { exchangeToken, LogtoVerifyError } = await import('../api/token')
    await expect(exchangeToken(jwt)).rejects.toThrow(LogtoVerifyError)
  })
})

// ── exchangeToken — Turso API failures ────────────────────────────────────────────

describe('exchangeToken — Turso API failures', () => {
  it('throws TursoApiError when DB creation fails (non-409 error)', async () => {
    const jwt = await keySet.sign({ sub: 'user-fail' })
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch({ createStatus: 500 })))

    const { exchangeToken, TursoApiError } = await import('../api/token')
    await expect(exchangeToken(jwt)).rejects.toThrow(TursoApiError)
  })

  it('throws TursoApiError when token mint fails', async () => {
    const jwt = await keySet.sign({ sub: 'user-mintfail' })
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch({ mintStatus: 500 })))

    const { exchangeToken, TursoApiError } = await import('../api/token')
    await expect(exchangeToken(jwt)).rejects.toThrow(TursoApiError)
  })
})

// ── handleRequest — HTTP layer (no framework) ─────────────────────────────────────

describe('handleRequest — HTTP layer', () => {
  it('GET /health returns 503 when env vars are missing', async () => {
    delete process.env.TURSO_PLATFORM_TOKEN
    const { handleRequest } = await import('../api/token')
    const res = await handleRequest('GET', '/health', null)
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
    expect(res.body.missing).toContain('TURSO_PLATFORM_TOKEN')
  })

  it('GET /health returns 200 when all env vars are set', async () => {
    setEnv()
    const { handleRequest } = await import('../api/token')
    const res = await handleRequest('GET', '/health', null)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it('POST /token without Authorization returns 401', async () => {
    setEnv()
    const { handleRequest } = await import('../api/token')
    const res = await handleRequest('POST', '/token', null)
    expect(res.status).toBe(401)
  })

  it('POST /token with a valid JWT returns 200 + BrokerTokenResponse', async () => {
    setEnv()
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch()))
    const jwt = await keySet.sign({ sub: 'http-user' })
    const { handleRequest } = await import('../api/token')
    const res = await handleRequest('POST', '/token', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(res.body.syncUrl).toContain('libsql://')
    expect(res.body.authToken).toBe('minted-turso-jwt')
    expect(res.body.expiresAt as number).toBeGreaterThan(Date.now())
  })

  it('POST /token with an invalid JWT returns 401', async () => {
    setEnv()
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch()))
    const { handleRequest } = await import('../api/token')
    const res = await handleRequest('POST', '/token', 'Bearer bad.token.here')
    expect(res.status).toBe(401)
  })

  it('routes to /token when path is the Vercel rewrite target /api/token', async () => {
    setEnv()
    vi.stubGlobal('fetch', vi.fn(makeTursoFetch()))
    const jwt = await keySet.sign({ sub: 'rewrite-user' })
    const { handleRequest } = await import('../api/token')
    const res = await handleRequest('POST', '/api/token', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(res.body.authToken).toBe('minted-turso-jwt')
  })
})
