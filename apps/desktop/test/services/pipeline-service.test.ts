/**
 * Integration tests for pipelineService.
 * Requires NEEME_USER_DATA + NEEME_EMBEDDER=hash (set by test/setup.ts).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, client } from '../../src/main/db/index'
import { pipelineService } from '../../src/main/services/pipeline-service'
import { clearTables } from '../helpers'

beforeAll(async () => {
  await initDb()
})

beforeEach(async () => {
  await clearTables()
})

// ── captureText ────────────────────────────────────────────────────────────────

describe('pipelineService.captureText', () => {
  it('captures text and returns created:true on first call', async () => {
    const result = await pipelineService.captureText('Hello mikan world', 'note.md')
    expect(result.created).toBe(true)
    expect(result.memory.id).toBeTruthy()
    expect(result.memory.title).toBe('Hello mikan world')
  })

  it('returns created:false (idempotent) for identical content', async () => {
    const text = 'Idempotency test content'
    const r1 = await pipelineService.captureText(text)
    const r2 = await pipelineService.captureText(text)
    expect(r1.created).toBe(true)
    expect(r2.created).toBe(false)
    // Same memory id
    expect(r2.memory.id).toBe(r1.memory.id)
  })

  it('treats different text as a new capture', async () => {
    const r1 = await pipelineService.captureText('First document content')
    const r2 = await pipelineService.captureText('Second document content')
    expect(r1.created).toBe(true)
    expect(r2.created).toBe(true)
    expect(r2.memory.id).not.toBe(r1.memory.id)
  })

  it('captures multiple items and lists them', async () => {
    await pipelineService.captureText('Item A text', 'a.md')
    await pipelineService.captureText('Item B text', 'b.md')
    const items = await pipelineService.listItems()
    expect(items.length).toBe(2)
  })
})

// ── captureFile ────────────────────────────────────────────────────────────────

describe('pipelineService.captureFile', () => {
  it('captures raw bytes as a text file', async () => {
    const bytes = new TextEncoder().encode('File content for testing')
    const result = await pipelineService.captureFile(bytes, 'test.txt', 'text/plain')
    expect(result.created).toBe(true)
    expect(result.memory.kind).toBe('note')
  })

  it('is idempotent — same bytes + name gives created:false', async () => {
    const bytes = new TextEncoder().encode('Repeated file content')
    const r1 = await pipelineService.captureFile(bytes, 'file.txt')
    const r2 = await pipelineService.captureFile(bytes, 'file.txt')
    expect(r1.created).toBe(true)
    expect(r2.created).toBe(false)
  })
})

// ── search + match ────────────────────────────────────────────────────────────

describe('pipelineService.search', () => {
  it('returns empty array when no items captured', async () => {
    const hits = await pipelineService.search('anything')
    expect(hits).toEqual([])
  })

  it('finds a captured item when the query shares tokens', async () => {
    await pipelineService.captureText(
      'machine learning neural network training optimization',
      'ml.md'
    )
    await pipelineService.captureText(
      'cooking pasta recipe ingredients dinner preparation',
      'food.md'
    )
    const hits = await pipelineService.search('neural network machine learning', 8)
    expect(hits.length).toBeGreaterThan(0)
    // ML document should appear somewhere in results
    const sources = hits.map((h) => h.sourceName)
    expect(sources).toContain('ml.md')
  })

  it('returns hits sorted by score ascending (lowest cosine distance first)', async () => {
    await pipelineService.captureText('alpha beta gamma delta epsilon', 'doc1.md')
    await pipelineService.captureText('zeta eta theta iota kappa', 'doc2.md')
    const hits = await pipelineService.search('alpha beta gamma', 10)
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.score).toBeGreaterThanOrEqual(hits[i - 1]!.score)
    }
  })
})

describe('pipelineService.match', () => {
  it('returns MatchHit[] with rel in 0..1 range', async () => {
    await pipelineService.captureText('project deadline milestone sprint planning', 'proj.md')
    const hits = await pipelineService.match('sprint planning milestone', 8)
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) {
      expect(h.rel).toBeGreaterThanOrEqual(0)
      expect(h.rel).toBeLessThanOrEqual(1)
    }
  })

  it('deduplicates — at most one hit per item', async () => {
    // Long text will be chunked into multiple chunks
    const longText = 'semantic search relevance score '.repeat(100)
    await pipelineService.captureText(longText, 'long.md')
    const hits = await pipelineService.match('semantic search relevance', 20)
    const ids = hits.map((h) => h.id)
    const unique = new Set(ids)
    expect(ids.length).toBe(unique.size)
  })

  it('returns hits sorted by rel descending (most relevant first)', async () => {
    await pipelineService.captureText('vitest unit testing coverage assertions', 'tests.md')
    await pipelineService.captureText('unrelated content xyz abc qrs tuv', 'other.md')
    const hits = await pipelineService.match('unit testing vitest', 8)
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i]!.rel).toBeLessThanOrEqual(hits[i - 1]!.rel)
    }
  })
})

// ── archive + feed ────────────────────────────────────────────────────────────

describe('pipelineService.archive + feed', () => {
  it('archive returns Memory[] for all captured items', async () => {
    await pipelineService.captureText('Memory one content', 'one.md')
    await pipelineService.captureText('Memory two content', 'two.md')
    const memories = await pipelineService.archive()
    expect(memories.length).toBe(2)
    expect(memories[0]).toHaveProperty('id')
    expect(memories[0]).toHaveProperty('kind')
    expect(memories[0]).toHaveProperty('title')
  })

  it('feed returns FedItem[] with status done for extracted items', async () => {
    await pipelineService.captureText('Feed item text content here', 'feed.md')
    const feed = await pipelineService.feed()
    expect(feed.length).toBe(1)
    expect(feed[0]!.status).toBe('done')
  })
})

// ── reindexAll ────────────────────────────────────────────────────────────────

describe('pipelineService.reindexAll', () => {
  it('returns 0 when no items exist', async () => {
    const n = await pipelineService.reindexAll()
    expect(n).toBe(0)
  })

  it('returns count of re-indexed items', async () => {
    await pipelineService.captureText('Reindex document one text', 'r1.md')
    await pipelineService.captureText('Reindex document two text', 'r2.md')
    const n = await pipelineService.reindexAll()
    expect(n).toBe(2)
  })

  it('chunks are still searchable after reindex', async () => {
    await pipelineService.captureText('reindex search verification test content', 'doc.md')
    await pipelineService.reindexAll()
    const hits = await pipelineService.search('reindex search verification', 5)
    expect(hits.length).toBeGreaterThan(0)
  })
})

// ── syncEmbedder ──────────────────────────────────────────────────────────────

describe('pipelineService.syncEmbedder', () => {
  it('sets meta.embedder to the active embedder name', async () => {
    await pipelineService.syncEmbedder()
    const res = await client.execute({
      sql: 'SELECT value FROM meta WHERE key = ?',
      args: ['embedder']
    })
    expect(res.rows[0]?.value).toBe('hash-placeholder')
  })

  it('is a no-op on second call with the same embedder', async () => {
    await pipelineService.captureText('sync embedder idempotency test', 'doc.md')
    await pipelineService.syncEmbedder()

    // Count chunks after first sync
    const before = await client.execute('SELECT COUNT(*) AS n FROM chunks')
    const countBefore = Number(before.rows[0]!.n)

    await pipelineService.syncEmbedder()

    const after = await client.execute('SELECT COUNT(*) AS n FROM chunks')
    const countAfter = Number(after.rows[0]!.n)

    // No additional chunks created — reindexAll was not called
    expect(countAfter).toBe(countBefore)
  })

  it('reindexes when meta.embedder differs from the active embedder', async () => {
    await pipelineService.captureText('embedder change triggers reindex content', 'doc.md')

    // Simulate a stale embedder record
    await client.execute({
      sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      args: ['embedder', 'old-embedder-name']
    })

    await pipelineService.syncEmbedder()

    // Meta should now reflect the current embedder
    const res = await client.execute({
      sql: 'SELECT value FROM meta WHERE key = ?',
      args: ['embedder']
    })
    expect(res.rows[0]?.value).toBe('hash-placeholder')

    // Chunks were rebuilt — still searchable
    const hits = await pipelineService.search('embedder change reindex', 5)
    expect(hits.length).toBeGreaterThan(0)
  })
})
