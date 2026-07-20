/**
 * Unit test for reconfigureSyncAuth (src/main/db/index.ts).
 *
 * The default test env (test/setup.ts) never sets NEEME_SYNC=on, so
 * getSyncConfig().enabled is false for every worker-service test — this
 * exercises that "forked local-only" guard. Swapping a *live* replica client
 * requires a real Turso primary and isn't unit-testable; that path is covered
 * by the live `pnpm dev` smoke test (see apps/desktop/CLAUDE.md).
 */
import { describe, it, expect } from 'vitest'
import { client, reconfigureSyncAuth } from '../../src/main/db/index'

describe('reconfigureSyncAuth', () => {
  it('is a no-op and returns false when this worker forked without sync enabled', async () => {
    const before = client
    const applied = await reconfigureSyncAuth('libsql://example.turso.io', 'tok')
    expect(applied).toBe(false)
    expect(client).toBe(before) // client export untouched
  })
})
