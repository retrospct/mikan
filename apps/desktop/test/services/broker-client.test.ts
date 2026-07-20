/**
 * Unit tests for apps/desktop/src/main/sync/broker.ts
 *
 * The broker client imports from Electron (`app`, `safeStorage`) and from
 * `node:fs/promises`. Both are mocked so these tests run in plain Node.
 *
 * Covers:
 *   - isBrokerConfigured() (env-driven flag)
 *   - getSyncToken() returns cached token when fresh
 *   - getSyncToken() re-fetches when cached token is near expiry
 *   - getSyncToken() returns null when broker is not configured
 *   - clearSyncToken() clears in-memory cache
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Electron mock ────────────────────────────────────────────────────────────

const mockSafeStorage = {
  isEncryptionAvailable: vi.fn(() => false), // plaintext fallback for tests
  encryptString: vi.fn((s: string) => Buffer.from(s, 'utf8')),
  decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
}
const mockApp = {
  getPath: vi.fn(() => '/tmp/mikan-test-broker')
}

vi.mock('electron', () => ({
  app: mockApp,
  safeStorage: mockSafeStorage
}))

// ── fs/promises mock ─────────────────────────────────────────────────────────

const mockReadFile = vi.fn<() => Promise<Buffer>>()
const mockWriteFile = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
const mockRm = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...(args as [])),
  writeFile: (...args: unknown[]) => mockWriteFile(...(args as [])),
  rm: (...args: unknown[]) => mockRm(...(args as []))
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { BrokerTokenResponse } from '@mikan/contract/ipc'

function freshToken(overrides: Partial<BrokerTokenResponse> = {}): BrokerTokenResponse {
  return {
    syncUrl: 'libsql://neeme-test.turso.io',
    authToken: 'tok_fresh',
    expiresAt: Date.now() + 3600_000, // 1 h from now
    ...overrides
  }
}

function staleToken(): BrokerTokenResponse {
  return freshToken({ expiresAt: Date.now() + 30_000 }) // 30 s — below REFRESH_BUFFER_MS
}

function makeFetch(response: BrokerTokenResponse | null, status = 200): typeof fetch {
  return vi.fn(async () => {
    if (response === null) return new Response('bad', { status: 500 })
    return new Response(JSON.stringify(response), { status })
  }) as unknown as typeof fetch
}

// ── Test state ────────────────────────────────────────────────────────────────

const BROKER_URL = 'https://broker.test'
const LOGTO_TOKEN = 'logto-access-token'

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = { NEEME_SYNC_BROKER_URL: process.env.NEEME_SYNC_BROKER_URL }
  process.env.NEEME_SYNC_BROKER_URL = BROKER_URL
  // Clear call counts and reset mock implementations for this test.
  vi.clearAllMocks()
  mockReadFile.mockRejectedValue(new Error('no file'))
  mockWriteFile.mockResolvedValue(undefined)
  mockRm.mockResolvedValue(undefined)
  vi.resetModules()
})

afterEach(() => {
  if (savedEnv.NEEME_SYNC_BROKER_URL === undefined) delete process.env.NEEME_SYNC_BROKER_URL
  else process.env.NEEME_SYNC_BROKER_URL = savedEnv.NEEME_SYNC_BROKER_URL
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isBrokerConfigured', () => {
  it('returns true when NEEME_SYNC_BROKER_URL is set', async () => {
    const { isBrokerConfigured } = await import('../../src/main/sync/broker')
    expect(isBrokerConfigured()).toBe(true)
  })

  it('returns false when NEEME_SYNC_BROKER_URL is absent', async () => {
    delete process.env.NEEME_SYNC_BROKER_URL
    const { isBrokerConfigured } = await import('../../src/main/sync/broker')
    expect(isBrokerConfigured()).toBe(false)
  })
})

describe('getSyncToken', () => {
  it('returns null when broker is not configured', async () => {
    delete process.env.NEEME_SYNC_BROKER_URL
    const { getSyncToken } = await import('../../src/main/sync/broker')
    const result = await getSyncToken(LOGTO_TOKEN)
    expect(result).toBeNull()
  })

  it('fetches from the broker on first call', async () => {
    const token = freshToken()
    vi.stubGlobal('fetch', makeFetch(token))
    const { getSyncToken } = await import('../../src/main/sync/broker')
    const result = await getSyncToken(LOGTO_TOKEN)
    expect(result).toEqual(token)
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('sends Authorization: Bearer header to the broker', async () => {
    const token = freshToken()
    const mockFetch = makeFetch(token)
    vi.stubGlobal('fetch', mockFetch)
    const { getSyncToken } = await import('../../src/main/sync/broker')
    await getSyncToken(LOGTO_TOKEN)
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${LOGTO_TOKEN}`)
  })

  it('returns the cached token on the second call without a second fetch', async () => {
    const token = freshToken()
    vi.stubGlobal('fetch', makeFetch(token))
    const { getSyncToken } = await import('../../src/main/sync/broker')
    await getSyncToken(LOGTO_TOKEN)
    await getSyncToken(LOGTO_TOKEN)
    expect(global.fetch).toHaveBeenCalledOnce() // only one network call
  })

  it('re-fetches when the cached token is within the 60 s refresh buffer', async () => {
    const stale = staleToken()
    const fresh = freshToken({ authToken: 'tok_refreshed' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(stale), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(fresh), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { getSyncToken } = await import('../../src/main/sync/broker')
    await getSyncToken(LOGTO_TOKEN) // fetches stale (30 s left → below buffer)
    const result = await getSyncToken(LOGTO_TOKEN) // should re-fetch
    expect(result?.authToken).toBe('tok_refreshed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws when the broker returns a non-200 status', async () => {
    vi.stubGlobal('fetch', makeFetch(null, 500))
    const { getSyncToken } = await import('../../src/main/sync/broker')
    await expect(getSyncToken(LOGTO_TOKEN)).rejects.toThrow('HTTP 500')
  })

  it('persists the token to disk after a successful fetch', async () => {
    const token = freshToken()
    vi.stubGlobal('fetch', makeFetch(token))
    const { getSyncToken } = await import('../../src/main/sync/broker')
    await getSyncToken(LOGTO_TOKEN)
    expect(mockWriteFile).toHaveBeenCalledOnce()
  })
})

describe('clearSyncToken', () => {
  it('causes the next getSyncToken call to re-fetch', async () => {
    const token = freshToken()
    vi.stubGlobal('fetch', makeFetch(token))
    const { getSyncToken, clearSyncToken } = await import('../../src/main/sync/broker')
    await getSyncToken(LOGTO_TOKEN)
    await clearSyncToken()
    await getSyncToken(LOGTO_TOKEN)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('removes the persisted token from disk', async () => {
    // clearSyncToken() goes through the shared secrets vault (secrets/store.ts),
    // which re-seals the vault without the `broker` key rather than deleting a
    // per-secret file — so this observes a writeFile, not an rm.
    const { clearSyncToken } = await import('../../src/main/sync/broker')
    await clearSyncToken()
    expect(mockWriteFile).toHaveBeenCalledOnce()
  })
})

describe('refreshSyncToken', () => {
  it('bypasses a still-fresh cache and always hits the broker', async () => {
    const stillFresh = freshToken()
    const refreshed = freshToken({ authToken: 'tok_refreshed' })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(stillFresh), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(refreshed), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { getSyncToken, refreshSyncToken } = await import('../../src/main/sync/broker')
    await getSyncToken(LOGTO_TOKEN) // caches `stillFresh`
    const result = await refreshSyncToken(LOGTO_TOKEN) // must NOT return the cache as-is
    expect(result.authToken).toBe('tok_refreshed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('updates the cache so a subsequent getSyncToken sees the refreshed token', async () => {
    const refreshed = freshToken({ authToken: 'tok_refreshed' })
    vi.stubGlobal('fetch', makeFetch(refreshed))
    const { getSyncToken, refreshSyncToken } = await import('../../src/main/sync/broker')
    await refreshSyncToken(LOGTO_TOKEN)
    const result = await getSyncToken(LOGTO_TOKEN)
    expect(result?.authToken).toBe('tok_refreshed')
    expect(global.fetch).toHaveBeenCalledOnce() // getSyncToken hit the cache, not the broker
  })
})

describe('getCachedToken', () => {
  it('returns null before any fetch', async () => {
    const { getCachedToken } = await import('../../src/main/sync/broker')
    expect(getCachedToken()).toBeNull()
  })

  it('returns the last fetched token', async () => {
    const token = freshToken()
    vi.stubGlobal('fetch', makeFetch(token))
    const { getSyncToken, getCachedToken } = await import('../../src/main/sync/broker')
    await getSyncToken(LOGTO_TOKEN)
    expect(getCachedToken()).toEqual(token)
  })
})

describe('restoreCachedToken', () => {
  it('populates the in-memory cache from a fresh disk token', async () => {
    const token = freshToken()
    // The vault file holds the whole SecretsShape, not a bare BrokerTokenResponse.
    mockReadFile.mockResolvedValue(Buffer.from(JSON.stringify({ broker: token }), 'utf8'))
    vi.stubGlobal('fetch', vi.fn()) // should not be called
    // restoreCachedToken() reads the secrets vault's in-memory cache, populated
    // by loadAll() — mirrors the real boot sequence (main/index.ts calls
    // secrets.loadAll() before broker.restoreCachedToken()).
    const { loadAll } = await import('../../src/main/secrets/store')
    const { restoreCachedToken, getSyncToken } = await import('../../src/main/sync/broker')
    await loadAll()
    await restoreCachedToken()
    const result = await getSyncToken(LOGTO_TOKEN)
    expect(result).toEqual(token)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('ignores an expired disk token (does not cache it)', async () => {
    const expired = freshToken({ expiresAt: Date.now() - 1000 })
    mockReadFile.mockResolvedValue(Buffer.from(JSON.stringify({ broker: expired }), 'utf8'))
    const fresh = freshToken()
    vi.stubGlobal('fetch', makeFetch(fresh))
    const { loadAll } = await import('../../src/main/secrets/store')
    const { restoreCachedToken, getSyncToken } = await import('../../src/main/sync/broker')
    await loadAll()
    await restoreCachedToken()
    await getSyncToken(LOGTO_TOKEN) // should hit the broker since disk token was expired
    expect(global.fetch).toHaveBeenCalledOnce()
  })

  it('is a no-op when broker is not configured', async () => {
    delete process.env.NEEME_SYNC_BROKER_URL
    const { restoreCachedToken } = await import('../../src/main/sync/broker')
    await expect(restoreCachedToken()).resolves.toBeUndefined()
    expect(mockReadFile).not.toHaveBeenCalled()
  })
})
