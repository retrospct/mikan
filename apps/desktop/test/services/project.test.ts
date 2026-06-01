import { describe, it, expect } from 'vitest'
import {
  toMemory,
  toFedItem,
  toMatchHits,
  toTask,
  toBacklogItem
} from '../../src/main/services/project'
import type { Item, Todo, ContextEntry } from '@nimi/contract/ipc'
import type { TaskDraft } from '../../src/main/pipeline/draft'

// ── factories ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    sourceName: 'note.md',
    contentType: 'text',
    sizeBytes: 100,
    status: 'extracted',
    text: 'Hello world',
    createdAt: new Date(Date.now() - 30_000), // 30 seconds ago
    ...overrides
  }
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'todo-1',
    title: 'Write tests',
    notes: null,
    status: 'open',
    day: new Date().toISOString().slice(0, 10),
    position: 0,
    createdAt: new Date(),
    completedAt: null,
    ...overrides
  }
}

function makeContext(overrides: Partial<ContextEntry> = {}): ContextEntry {
  return {
    itemId: 'item-1',
    score: 0.2,
    sourceName: 'note.md',
    contentType: 'text',
    excerpt: 'Relevant excerpt',
    state: 'surfaced',
    why: null,
    ...overrides
  }
}

function makeDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    brief: 'Here is a brief',
    draft: ['Step 1', 'Step 2'],
    draftNote: 'draft note',
    note: 'Nimi note',
    noteKind: 'ready',
    status: 'drafted',
    conf: 0.85,
    why: { 'item-1': 'The most relevant document' },
    ...overrides
  }
}

// ── toMemory ──────────────────────────────────────────────────────────────────

describe('toMemory', () => {
  it('maps a text/md item to kind "note"', () => {
    const m = toMemory(makeItem({ sourceName: 'diary.md', contentType: 'text' }))
    expect(m.kind).toBe('note')
  })

  it('maps a text/.txt item to kind "note"', () => {
    const m = toMemory(makeItem({ sourceName: 'readme.txt', contentType: 'text' }))
    expect(m.kind).toBe('note')
  })

  it('maps a text item without md/txt extension to kind "text"', () => {
    const m = toMemory(makeItem({ sourceName: 'data.csv', contentType: 'text' }))
    expect(m.kind).toBe('text')
  })

  it('maps a pdf item to kind "pdf"', () => {
    const m = toMemory(makeItem({ sourceName: 'report.pdf', contentType: 'pdf' }))
    expect(m.kind).toBe('pdf')
  })

  it('maps a png image to kind "screenshot"', () => {
    const m = toMemory(makeItem({ sourceName: 'screen.png', contentType: 'image' }))
    expect(m.kind).toBe('screenshot')
  })

  it('maps a jpg image to kind "image"', () => {
    const m = toMemory(makeItem({ sourceName: 'photo.jpg', contentType: 'image' }))
    expect(m.kind).toBe('image')
  })

  it('maps an audio item to kind "voice"', () => {
    const m = toMemory(makeItem({ sourceName: 'memo.m4a', contentType: 'audio' }))
    expect(m.kind).toBe('voice')
  })

  it('derives title from the first non-empty line of text', () => {
    const m = toMemory(makeItem({ text: '\nFirst line\nSecond line' }))
    expect(m.title).toBe('First line')
  })

  it('falls back to sourceName when text is empty', () => {
    const m = toMemory(makeItem({ text: '' }))
    expect(m.title).toBe('note.md')
  })

  it('truncates title longer than 80 chars with ellipsis', () => {
    const longLine = 'a'.repeat(100)
    const m = toMemory(makeItem({ text: longLine }))
    expect(m.title).toHaveLength(80) // 79 chars + ellipsis char
    expect(m.title.endsWith('…')).toBe(true)
  })

  it('truncates snip longer than 160 chars with ellipsis', () => {
    const m = toMemory(makeItem({ text: 'x'.repeat(200) }))
    expect(m.snip).toHaveLength(160)
    expect(m.snip.endsWith('…')).toBe(true)
  })

  it('snip collapses whitespace', () => {
    const m = toMemory(makeItem({ text: 'word1\nword2\n  word3' }))
    expect(m.snip).toBe('word1 word2 word3')
  })

  it('sets src to sourceName', () => {
    const m = toMemory(makeItem({ sourceName: 'my-file.md' }))
    expect(m.src).toBe('my-file.md')
  })

  it('sets id', () => {
    const m = toMemory(makeItem({ id: 'abc123' }))
    expect(m.id).toBe('abc123')
  })

  it('sets when to a human-readable relative string', () => {
    const m = toMemory(makeItem({ createdAt: new Date(Date.now() - 30_000) }))
    expect(m.when).toMatch(/just now|min ago/)
  })

  it('formats old dates as ISO date string', () => {
    const old = new Date('2024-01-15')
    const m = toMemory(makeItem({ createdAt: old }))
    expect(m.when).toBe('2024-01-15')
  })
})

// ── toFedItem ─────────────────────────────────────────────────────────────────

describe('toFedItem', () => {
  it('status is "done" for extracted items', () => {
    const f = toFedItem(makeItem({ status: 'extracted' }))
    expect(f.status).toBe('done')
  })

  it('status is "done" for captured items', () => {
    const f = toFedItem(makeItem({ status: 'captured' }))
    expect(f.status).toBe('done')
  })

  it('status is "pending" for pending items', () => {
    const f = toFedItem(makeItem({ status: 'pending' }))
    expect(f.status).toBe('pending')
  })

  it('status is "pending" for failed items', () => {
    const f = toFedItem(makeItem({ status: 'failed' }))
    expect(f.status).toBe('pending')
  })

  it('has id, kind, title, when fields', () => {
    const f = toFedItem(makeItem())
    expect(f).toHaveProperty('id')
    expect(f).toHaveProperty('kind')
    expect(f).toHaveProperty('title')
    expect(f).toHaveProperty('when')
  })
})

// ── toMatchHits ───────────────────────────────────────────────────────────────

describe('toMatchHits', () => {
  it('returns empty array for empty input', () => {
    expect(toMatchHits([])).toEqual([])
  })

  it('converts cosine distance to 0..1 relevance (lower dist = higher rel)', () => {
    const hits = toMatchHits([{ itemId: 'a', score: 0.1 }])
    expect(hits[0]!.rel).toBeCloseTo(0.9, 5)
  })

  it('clamps rel to 0 for distance ≥ 1', () => {
    const hits = toMatchHits([{ itemId: 'a', score: 1.5 }])
    expect(hits[0]!.rel).toBe(0)
  })

  it('keeps best (lowest distance) chunk per item', () => {
    const raw = [
      { itemId: 'a', score: 0.3 },
      { itemId: 'a', score: 0.1 }, // better chunk for item a
      { itemId: 'b', score: 0.5 }
    ]
    const hits = toMatchHits(raw)
    const itemA = hits.find((h) => h.id === 'a')!
    expect(itemA.rel).toBeCloseTo(1 - 0.1, 5)
    expect(hits).toHaveLength(2)
  })

  it('sorts results by rel descending (closest first)', () => {
    const raw = [
      { itemId: 'b', score: 0.5 }, // rel 0.5
      { itemId: 'a', score: 0.1 }, // rel 0.9
      { itemId: 'c', score: 0.3 } // rel 0.7
    ]
    const hits = toMatchHits(raw)
    expect(hits[0]!.id).toBe('a')
    expect(hits[1]!.id).toBe('c')
    expect(hits[2]!.id).toBe('b')
  })
})

// ── toTask ────────────────────────────────────────────────────────────────────

describe('toTask', () => {
  it('status is "done" for a done todo regardless of AI', () => {
    const task = toTask(makeTodo({ status: 'done' }), [], makeDraft())
    expect(task.status).toBe('done')
    expect(task.done).toBe(true)
  })

  it('status is "drafted" when todo is open and AI status is drafted', () => {
    const task = toTask(makeTodo(), [], makeDraft({ status: 'drafted' }))
    expect(task.status).toBe('drafted')
    expect(task.done).toBe(false)
  })

  it('status is "gathered" when todo is open and no AI', () => {
    const task = toTask(makeTodo(), [])
    expect(task.status).toBe('gathered')
  })

  it('status is "gathered" when todo is open and AI status is gathered', () => {
    const task = toTask(makeTodo(), [], makeDraft({ status: 'gathered' }))
    expect(task.status).toBe('gathered')
  })

  it('populates relMap from context entries', () => {
    const ctx = [makeContext({ itemId: 'item-x', score: 0.2 })]
    const task = toTask(makeTodo(), ctx)
    expect(task.relMap?.['item-x']).toBeCloseTo(0.8, 5)
  })

  it('populates whyMap from context entries with why set', () => {
    const ctx = [makeContext({ itemId: 'item-x', why: 'The deadline email' })]
    const task = toTask(makeTodo(), ctx)
    expect(task.whyMap?.['item-x']).toBe('The deadline email')
  })

  it('omits whyMap when no context has why strings', () => {
    const task = toTask(makeTodo(), [makeContext({ why: null })])
    expect(task.whyMap).toBeUndefined()
  })

  it('ctx contains non-dismissed item ids in order', () => {
    const ctx = [
      makeContext({ itemId: 'a', state: 'surfaced' }),
      makeContext({ itemId: 'b', state: 'pinned' })
    ]
    const task = toTask(makeTodo(), ctx)
    expect(task.ctx).toContain('a')
    expect(task.ctx).toContain('b')
  })

  it('pinned only contains pinned item ids', () => {
    const ctx = [
      makeContext({ itemId: 'a', state: 'surfaced' }),
      makeContext({ itemId: 'b', state: 'pinned' }),
      makeContext({ itemId: 'c', state: 'dismissed' })
    ]
    const task = toTask(makeTodo(), ctx)
    expect(task.pinned).toEqual(['b'])
  })

  it('degrades gracefully when AI is absent (draft/note/brief are null)', () => {
    const task = toTask(makeTodo(), [])
    expect(task.draft).toBeNull()
    expect(task.draftNote).toBeNull()
    expect(task.note).toBeNull()
    expect(task.brief).toBeUndefined()
  })

  it('populates AI fields when AI is provided', () => {
    const task = toTask(makeTodo(), [], makeDraft())
    expect(task.draft).toEqual(['Step 1', 'Step 2'])
    expect(task.brief).toBe('Here is a brief')
    expect(task.note).toBe('Nimi note')
    expect(task.noteKind).toBe('ready')
  })

  it('when is "today" for today\'s day', () => {
    const today = new Date().toISOString().slice(0, 10)
    const task = toTask(makeTodo({ day: today }), [])
    expect(task.when).toBe('today')
  })

  it('when is "today" for day=null', () => {
    const task = toTask(makeTodo({ day: null }), [])
    expect(task.when).toBe('today')
  })
})

// ── toBacklogItem ─────────────────────────────────────────────────────────────

describe('toBacklogItem', () => {
  it('conf is null without AI', () => {
    const item = toBacklogItem(makeTodo())
    expect(item.conf).toBeNull()
  })

  it('conf is set when AI provides it', () => {
    const item = toBacklogItem(makeTodo(), makeDraft({ conf: 0.75 }))
    expect(item.conf).toBeCloseTo(0.75, 5)
  })

  it('hint is the todo notes, or empty string if null', () => {
    expect(toBacklogItem(makeTodo({ notes: null })).hint).toBe('')
    expect(toBacklogItem(makeTodo({ notes: 'My hint' })).hint).toBe('My hint')
  })

  it('ctx is empty (surfaced only when scheduled)', () => {
    const item = toBacklogItem(makeTodo())
    expect(item.ctx).toEqual([])
  })

  it('id and title are passed through', () => {
    const item = toBacklogItem(makeTodo({ id: 'todo-xyz', title: 'Do the thing' }))
    expect(item.id).toBe('todo-xyz')
    expect(item.title).toBe('Do the thing')
  })
})
