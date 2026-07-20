/**
 * Unit tests for apps/desktop/src/main/sync/sync-control.ts.
 *
 * Only the pure scheduling math (computeRefreshDelay) is exercised here — the
 * rest of the module (prepareSyncEnv, onLoginEnableSync, the proactive refresh
 * loop) touches the worker RPC, the Logto session, and the keychain-backed
 * prefs store, and is covered by the live `pnpm dev` smoke test instead
 * (worker/Electron behavior isn't available in CI — see apps/desktop/CLAUDE.md).
 *
 * `electron` is mocked (mirrors broker-client.test.ts) purely so the module's
 * import chain (secrets/store, sync-prefs) resolves in plain Node.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/mikan-test-sync-control') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((s: string) => Buffer.from(s, 'utf8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  utilityProcess: { fork: vi.fn() }
}))

describe('computeRefreshDelay', () => {
  it('schedules ~2 minutes before a far-future expiry', async () => {
    const { computeRefreshDelay } = await import('../../src/main/sync/sync-control')
    const now = 1_000_000
    const expiresAt = now + 3600_000 // 1h from now
    expect(computeRefreshDelay(expiresAt, now)).toBe(3600_000 - 120_000)
  })

  it('clamps to the 30s floor when the token is already near/past expiry', async () => {
    const { computeRefreshDelay } = await import('../../src/main/sync/sync-control')
    const now = 1_000_000
    expect(computeRefreshDelay(now + 60_000, now)).toBe(30_000) // 60s left < 120s early-mark
    expect(computeRefreshDelay(now - 10_000, now)).toBe(30_000) // already expired
  })
})
