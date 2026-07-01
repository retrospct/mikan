import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { rowToTaskDraft } from '../../src/main/services/draft-service'
import type { TodoAiRow } from '../../src/main/db/schema'

// ── rowToTaskDraft — pure unit tests (no DB) ──────────────────────────────────

/** Build a minimal TodoAiRow for testing. Drizzle inferred types have Dates. */
function makeRow(overrides: Partial<TodoAiRow> = {}): TodoAiRow {
  return {
    todoId: 'todo-1',
    status: 'gathered',
    brief: null,
    draft: null,
    draftNote: null,
    note: null,
    noteKind: null,
    conf: null,
    meta: null,
    inputsHash: 'abc',
    updatedAt: new Date(),
    ...overrides
  }
}

describe('rowToTaskDraft', () => {
  it('status "gathered" when row.status is anything other than "drafted"', () => {
    expect(rowToTaskDraft(makeRow({ status: 'gathered' })).status).toBe('gathered')
    expect(rowToTaskDraft(makeRow({ status: 'other' })).status).toBe('gathered')
  })

  it('status "drafted" when row.status is "drafted"', () => {
    expect(rowToTaskDraft(makeRow({ status: 'drafted' })).status).toBe('drafted')
  })

  it('parses JSON draft array from row.draft', () => {
    const result = rowToTaskDraft(makeRow({ draft: '["Step 1","Step 2"]' }))
    expect(result.draft).toEqual(['Step 1', 'Step 2'])
  })

  it('returns null for draft when row.draft is null', () => {
    expect(rowToTaskDraft(makeRow({ draft: null })).draft).toBeNull()
  })

  it('returns null for draft when row.draft is malformed JSON', () => {
    expect(rowToTaskDraft(makeRow({ draft: 'not json' })).draft).toBeNull()
  })

  it('returns null for draft when row.draft is a JSON non-array', () => {
    expect(rowToTaskDraft(makeRow({ draft: '{"key":"val"}' })).draft).toBeNull()
  })

  it('passes through brief, draftNote, note when present', () => {
    const result = rowToTaskDraft(
      makeRow({ brief: 'My brief', draftNote: 'draft note', note: 'Mikan note' })
    )
    expect(result.brief).toBe('My brief')
    expect(result.draftNote).toBe('draft note')
    expect(result.note).toBe('Mikan note')
  })

  it('passes through valid noteKind values', () => {
    for (const kind of ['ready', 'ask', 'wait', 'gathered', 'done'] as const) {
      expect(rowToTaskDraft(makeRow({ noteKind: kind })).noteKind).toBe(kind)
    }
    expect(rowToTaskDraft(makeRow({ noteKind: null })).noteKind).toBeNull()
  })

  it('parses meta fields from JSON', () => {
    const meta = JSON.stringify({
      draftFor: 'user@example.com',
      draftType: 'email',
      draftIcon: '📧',
      useLabel: 'Send',
      useNote: 'via email',
      useDone: 'Sent'
    })
    const result = rowToTaskDraft(makeRow({ meta }))
    expect(result.draftFor).toBe('user@example.com')
    expect(result.draftType).toBe('email')
    expect(result.useLabel).toBe('Send')
    expect(result.useDone).toBe('Sent')
  })

  it('tolerates null meta (meta fields become undefined)', () => {
    const result = rowToTaskDraft(makeRow({ meta: null }))
    expect(result.draftFor).toBeUndefined()
    expect(result.draftType).toBeUndefined()
  })

  it('tolerates malformed meta JSON (falls back to empty object)', () => {
    const result = rowToTaskDraft(makeRow({ meta: 'bad json' }))
    expect(result.draftFor).toBeUndefined()
  })

  it('returns empty why map (why is not stored in the row, only per-context)', () => {
    const result = rowToTaskDraft(makeRow())
    expect(result.why).toEqual({})
  })

  it('passes through conf when numeric', () => {
    expect(rowToTaskDraft(makeRow({ conf: 0.72 })).conf).toBeCloseTo(0.72, 5)
    expect(rowToTaskDraft(makeRow({ conf: null })).conf).toBeNull()
  })
})

// ── Integration: draftService (regenerate + read) with real DB ────────────────
//
// todo_ai has a FK to todos(id), so we create real todos via todoService.add
// before calling draftService.regenerate.

import { initDb } from '../../src/main/db/index'
import { draftService } from '../../src/main/services/draft-service'
import { todoService } from '../../src/main/services/todo-service'
import { clearTables } from '../helpers'

describe('draftService integration', () => {
  beforeAll(async () => {
    await initDb()
  })

  beforeEach(async () => {
    await clearTables()
  })

  it('read returns null when no AI row exists', async () => {
    const row = await draftService.read('nonexistent-id')
    expect(row).toBeNull()
  })

  it('regenerate upserts a todo_ai row with NullDrafter (status: gathered)', async () => {
    // Create a real todo so the FK on todo_ai → todos is satisfied
    const task = await todoService.add('Write integration test')
    const row = await draftService.read(task.id)
    // todoService.add already calls draftService.regenerate internally
    expect(row).not.toBeNull()
    expect(row!.status).toBe('gathered')
    expect(row!.todoId).toBe(task.id)
  })

  it('regenerate is a no-op on second call when inputs have not changed', async () => {
    const task = await todoService.add('Idempotent draft task')
    const row1 = await draftService.read(task.id)
    expect(row1).not.toBeNull()
    const hash1 = row1!.inputsHash

    // Call regenerate again with the same inputs
    const todo = {
      id: task.id,
      title: task.title,
      notes: null,
      status: 'open' as const,
      day: new Date().toISOString().slice(0, 10),
      position: 0,
      createdAt: new Date(),
      completedAt: null
    }
    await draftService.regenerate(todo, [])

    const row2 = await draftService.read(task.id)
    // Same inputs hash → regenerate returned early, row unchanged
    expect(row2!.inputsHash).toBe(hash1)
    expect(row2!.updatedAt.getTime()).toBe(row1!.updatedAt.getTime())
  })

  it('read returns the persisted row after add (which calls regenerate)', async () => {
    const task = await todoService.add('Read after regenerate')
    const row = await draftService.read(task.id)
    expect(row).toBeDefined()
    expect(row!.todoId).toBe(task.id)
    expect(row!.inputsHash).toBeTruthy()
  })

  it('inputsHash differs for todos with different titles', async () => {
    const t1 = await todoService.add('First title for hashing')
    const t2 = await todoService.add('Second title for hashing')
    const row1 = await draftService.read(t1.id)
    const row2 = await draftService.read(t2.id)
    expect(row1!.inputsHash).not.toBe(row2!.inputsHash)
  })
})
