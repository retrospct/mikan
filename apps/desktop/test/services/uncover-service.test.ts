/**
 * Integration tests for uncoverService.
 *
 * Runs with NEEME_DRAFTER=off (NullDrafter) + NEEME_EMBEDDER=hash, set by
 * test/setup.ts. Covers:
 *
 *   • graceful-degrade: empty feed and NullDrafter both return []
 *   • cache write: first call persists a result to the meta table
 *   • cache hit: second call with identical feed returns from cache (no drafter call)
 *   • cache invalidation: a new capture changes the feed hash → stale cache replaced
 *
 * The live-key path (CloudDrafter returning real inferences) is covered by the
 * GUI runbook: docs/testing/uncovered-todos-gui-runbook.md §5.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, client } from '../../src/main/db/index'
import { pipelineService } from '../../src/main/services/pipeline-service'
import { uncoverService } from '../../src/main/services/uncover-service'
import { clearTables } from '../helpers'

beforeAll(async () => {
  await initDb()
})

beforeEach(async () => {
  await clearTables()
})

// ── graceful-degrade ────────────────────────────────────────────────────────

describe('uncoverService.uncoverTodos — graceful-degrade (NullDrafter)', () => {
  it('returns [] when the feed is empty', async () => {
    const todos = await uncoverService.uncoverTodos()
    expect(todos).toEqual([])
  })

  it('returns [] when feed has items but NEEME_DRAFTER=off (NullDrafter)', async () => {
    await pipelineService.captureText(
      'Priya needs the Q3 one-pager by Friday — board reads Monday.',
      'note.md'
    )
    await pipelineService.captureText(
      "Sarah's free the 18th or 25th for the cabin — pick one so she can book it.",
      'note.md'
    )
    const todos = await uncoverService.uncoverTodos()
    expect(todos).toEqual([])
  })
})

// ── cache write ─────────────────────────────────────────────────────────────

describe('uncoverService.uncoverTodos — cache write', () => {
  it('writes a cache entry to the meta table after the first call', async () => {
    await pipelineService.captureText('Book dentist appointment next week.', 'note.md')

    await uncoverService.uncoverTodos()

    const res = await client.execute({
      sql: "SELECT value FROM meta WHERE key = 'uncovered'",
      args: []
    })
    expect(res.rows.length).toBe(1)
    const cached = JSON.parse(res.rows[0]!.value as string) as { hash: string; todos: unknown[] }
    expect(typeof cached.hash).toBe('string')
    expect(cached.hash.length).toBeGreaterThan(0)
    expect(Array.isArray(cached.todos)).toBe(true)
  })

  it('stores the hash of the current feed window in the cache entry', async () => {
    await pipelineService.captureText('Reply to Marcus about the budget spreadsheet.', 'note.md')
    await uncoverService.uncoverTodos()

    const res = await client.execute({
      sql: "SELECT value FROM meta WHERE key = 'uncovered'",
      args: []
    })
    const cached = JSON.parse(res.rows[0]!.value as string) as { hash: string; todos: unknown[] }
    // hash is a 40-char sha1 hex string
    expect(cached.hash).toMatch(/^[0-9a-f]{40}$/)
  })
})

// ── cache hit ───────────────────────────────────────────────────────────────

describe('uncoverService.uncoverTodos — cache hit', () => {
  it('returns the cached todos without re-calling the drafter on unchanged feed', async () => {
    await pipelineService.captureText('Send the updated deck to Jordan by EOD.', 'note.md')

    // First call — NullDrafter returns [], writes {hash, todos:[]} to cache
    await uncoverService.uncoverTodos()

    // Inject a known non-empty result into the cache to prove the second call
    // reads from cache (not from the drafter, which would return []).
    const hashRes = await client.execute({
      sql: "SELECT value FROM meta WHERE key = 'uncovered'",
      args: []
    })
    const existing = JSON.parse(hashRes.rows[0]!.value as string) as { hash: string }
    const injected = [{ id: 'fake-1', title: 'Send the deck', why: 'Jordan is waiting', conf: 0.9, ctx: [] }]
    await client.execute({
      sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      args: ['uncovered', JSON.stringify({ hash: existing.hash, todos: injected })]
    })

    // Second call — feed unchanged, cache hash matches → must return injected result
    const todos = await uncoverService.uncoverTodos()
    expect(todos).toEqual(injected)
  })
})

// ── cache invalidation ──────────────────────────────────────────────────────

describe('uncoverService.uncoverTodos — cache invalidation', () => {
  it('replaces stale cache when a new item is captured', async () => {
    await pipelineService.captureText('Confirm lunch with Yuki on Thursday.', 'note.md')
    await uncoverService.uncoverTodos()

    // Inject fake todos so cache is non-empty
    const hashRes = await client.execute({
      sql: "SELECT value FROM meta WHERE key = 'uncovered'",
      args: []
    })
    const existing = JSON.parse(hashRes.rows[0]!.value as string) as { hash: string }
    const stale = [{ id: 'stale-1', title: 'stale todo', why: 'from old feed', conf: 0.5, ctx: [] }]
    await client.execute({
      sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      args: ['uncovered', JSON.stringify({ hash: existing.hash, todos: stale })]
    })

    // New capture changes the feed hash
    await pipelineService.captureText('Book flight to Austin before prices go up.', 'note.md')

    // Call after new capture — hash mismatch → stale cache replaced → NullDrafter returns []
    const todos = await uncoverService.uncoverTodos()
    expect(todos).toEqual([])
    expect(todos).not.toEqual(stale)

    // New cache entry has a different hash
    const newHashRes = await client.execute({
      sql: "SELECT value FROM meta WHERE key = 'uncovered'",
      args: []
    })
    const newCached = JSON.parse(newHashRes.rows[0]!.value as string) as { hash: string }
    expect(newCached.hash).not.toBe(existing.hash)
  })
})
