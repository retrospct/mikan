import { describe, it, expect } from 'vitest'
import { NullDrafter } from '../../src/main/pipeline/draft'
import type { DraftInput } from '../../src/main/pipeline/draft'

const EMPTY_INPUT: DraftInput = {
  title: 'Test task',
  notes: null,
  pinnedIds: [],
  context: []
}

const RICH_INPUT: DraftInput = {
  title: 'Write quarterly report',
  notes: 'Focus on engineering metrics',
  pinnedIds: ['item-1'],
  context: [
    {
      itemId: 'item-1',
      sourceName: 'metrics.md',
      contentType: 'text',
      excerpt: 'Q3 engineering metrics: 200 deployments, 99.9% uptime',
      rel: 0.9
    },
    {
      itemId: 'item-2',
      sourceName: 'notes.txt',
      contentType: 'text',
      excerpt: 'Previous quarter numbers for comparison',
      rel: 0.6
    }
  ]
}

describe('NullDrafter', () => {
  const drafter = new NullDrafter()

  it('name is "null-drafter"', () => {
    expect(drafter.name).toBe('null-drafter')
  })

  it('returns status: "gathered" with all nullable fields null', async () => {
    const result = await drafter.draft(EMPTY_INPUT)
    expect(result.status).toBe('gathered')
    expect(result.brief).toBeNull()
    expect(result.draft).toBeNull()
    expect(result.draftNote).toBeNull()
    expect(result.note).toBeNull()
    expect(result.noteKind).toBeNull()
    expect(result.conf).toBeNull()
    expect(result.why).toEqual({})
  })

  it('ignores a rich input and still returns null fields', async () => {
    const result = await drafter.draft(RICH_INPUT)
    expect(result.status).toBe('gathered')
    expect(result.brief).toBeNull()
    expect(result.draft).toBeNull()
    expect(result.why).toEqual({})
  })

  it('resolves (does not throw or reject)', async () => {
    await expect(drafter.draft(EMPTY_INPUT)).resolves.toBeDefined()
  })
})
