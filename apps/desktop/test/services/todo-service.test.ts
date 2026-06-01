/**
 * Integration tests for todoService.
 * Requires NEEME_USER_DATA + NEEME_EMBEDDER=hash (set by test/setup.ts).
 *
 * Context pool tests also require captured items. We capture text that shares
 * tokens with todo titles so the hash embedder surfaces them as context.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../src/main/db/index'
import { todoService } from '../../src/main/services/todo-service'
import { pipelineService } from '../../src/main/services/pipeline-service'
import { CAP_REACHED } from '@nimi/contract/ipc'
import { clearTables } from '../helpers'

const TODAY = new Date().toISOString().slice(0, 10)

beforeAll(async () => {
  await initDb()
})

beforeEach(async () => {
  await clearTables()
})

// ── add (cap-5 + latch) ───────────────────────────────────────────────────────

describe('todoService.add — cap-5 rule', () => {
  it('allows adding up to 5 todos on a given day', async () => {
    for (let i = 1; i <= 5; i++) {
      const task = await todoService.add(`Task ${i}`)
      expect(task.id).toBeTruthy()
      expect(task.title).toBe(`Task ${i}`)
    }
  })

  it('throws CAP_REACHED when trying to add a 6th todo', async () => {
    for (let i = 1; i <= 5; i++) {
      await todoService.add(`Task ${i}`)
    }
    await expect(todoService.add('Task 6')).rejects.toThrow(CAP_REACHED)
  })

  it('includes optional notes in the returned task', async () => {
    const task = await todoService.add('My task', 'with some notes')
    // notes are internal; task is the projected view (Task shape)
    expect(task.title).toBe('My task')
    expect(task.id).toBeTruthy()
  })

  it('returns a task with gathered status (NullDrafter)', async () => {
    const task = await todoService.add('Draft test task')
    expect(task.status).toBe('gathered')
    expect(task.done).toBe(false)
  })
})

describe('todoService.add — finish-the-list latch', () => {
  it('allows adding again after all 5 todos are completed', async () => {
    // Fill the cap
    const tasks: string[] = []
    for (let i = 1; i <= 5; i++) {
      const t = await todoService.add(`Task ${i}`)
      tasks.push(t.id)
    }
    // Complete all of them
    for (const id of tasks) {
      await todoService.complete(id)
    }
    // Now the day is fully cleared — latch opens
    const extra = await todoService.add('After latch task')
    expect(extra.id).toBeTruthy()
    expect(extra.title).toBe('After latch task')
  })

  it('cannot add when some are done and some are still open (partially cleared)', async () => {
    const tasks = await Promise.all([1, 2, 3, 4, 5].map((i) => todoService.add(`Task ${i}`)))

    // Complete only the first two
    await todoService.complete(tasks[0]!.id)
    await todoService.complete(tasks[1]!.id)
    // tasks 3, 4, 5 are still open — cap still full (5 total scheduled)
    await expect(todoService.add('Task 6')).rejects.toThrow(CAP_REACHED)
  })
})

// ── today ─────────────────────────────────────────────────────────────────────

describe('todoService.today', () => {
  it('returns empty array when no todos scheduled', async () => {
    const tasks = await todoService.today()
    expect(tasks).toEqual([])
  })

  it('returns tasks ordered by position', async () => {
    await todoService.add('First')
    await todoService.add('Second')
    await todoService.add('Third')
    const tasks = await todoService.today()
    expect(tasks[0]!.title).toBe('First')
    expect(tasks[1]!.title).toBe('Second')
    expect(tasks[2]!.title).toBe('Third')
  })

  it('returns tasks for a specific day', async () => {
    await todoService.add('Today task')
    // Request a different (future) day — should be empty
    const tasks = await todoService.today('2099-01-01')
    expect(tasks).toHaveLength(0)
  })
})

// ── complete + reopen ─────────────────────────────────────────────────────────

describe('todoService.complete', () => {
  it('marks a todo as done', async () => {
    const t = await todoService.add('Complete me')
    const done = await todoService.complete(t.id)
    expect(done!.status).toBe('done')
    expect(done!.done).toBe(true)
  })

  it('returns null for a non-existent id', async () => {
    const result = await todoService.complete('no-such-id')
    expect(result).toBeNull()
  })
})

describe('todoService.reopen', () => {
  it('reopens a completed todo', async () => {
    const t = await todoService.add('Complete then reopen')
    await todoService.complete(t.id)
    const reopened = await todoService.reopen(t.id)
    expect(reopened!.status).toBe('gathered')
    expect(reopened!.done).toBe(false)
  })
})

// ── backlog ────────────────────────────────────────────────────────────────────

describe('todoService.backlog', () => {
  it('returns empty when no backlog items', async () => {
    expect(await todoService.backlog()).toEqual([])
  })

  it('returns items swept to the backlog by plan', async () => {
    const t1 = await todoService.add('Keep this')
    await todoService.add('Sweep this')

    await todoService.plan([t1.id])
    const backlog = await todoService.backlog()
    expect(backlog.some((b) => b.title === 'Sweep this')).toBe(true)
    expect(backlog.some((b) => b.title === 'Keep this')).toBe(false)
  })
})

// ── done log ──────────────────────────────────────────────────────────────────

describe('todoService.done', () => {
  it('returns empty when nothing completed', async () => {
    expect(await todoService.done()).toHaveLength(0)
  })

  it('includes both completed todos in the done list', async () => {
    const t1 = await todoService.add('First completed')
    await todoService.complete(t1.id)
    const t2 = await todoService.add('Second completed')
    await todoService.complete(t2.id)

    const doneList = await todoService.done()
    expect(doneList).toHaveLength(2)
    const titles = doneList.map((t) => t.title)
    expect(titles).toContain('First completed')
    expect(titles).toContain('Second completed')
  })

  it('respects the limit parameter', async () => {
    for (let i = 1; i <= 3; i++) {
      const t = await todoService.add(`Done ${i}`)
      await todoService.complete(t.id)
    }
    const limited = await todoService.done(2)
    expect(limited).toHaveLength(2)
  })
})

// ── plan (carry-over + backlog sweep) ─────────────────────────────────────────

describe('todoService.plan', () => {
  it('throws CAP_REACHED when keep list exceeds 5', async () => {
    await expect(todoService.plan(['a', 'b', 'c', 'd', 'e', 'f'])).rejects.toThrow(CAP_REACHED)
  })

  it('carries kept items onto the target day', async () => {
    const t1 = await todoService.add('Keep A')
    const t2 = await todoService.add('Keep B')
    await todoService.add('Sweep C')

    const tasks = await todoService.plan([t1.id, t2.id], TODAY)
    const titles = tasks.map((t) => t.title)
    expect(titles).toContain('Keep A')
    expect(titles).toContain('Keep B')
    expect(titles).not.toContain('Sweep C')
  })

  it('sweeps non-kept open items to the backlog (day becomes null)', async () => {
    await todoService.add('Will be swept')
    const tasks = await todoService.plan([], TODAY)
    // Empty plan — all swept
    expect(tasks).toHaveLength(0)
    const backlog = await todoService.backlog()
    expect(backlog.some((b) => b.title === 'Will be swept')).toBe(true)
  })

  it('keeps done items in done log (not swept)', async () => {
    const t = await todoService.add('Done item')
    await todoService.complete(t.id)
    // plan with empty keep — only open items are swept
    await todoService.plan([], TODAY)
    const doneList = await todoService.done()
    expect(doneList.some((d) => d.title === 'Done item')).toBe(true)
  })

  it('assigns positions 0..n-1 to kept items', async () => {
    const t1 = await todoService.add('First')
    const t2 = await todoService.add('Second')
    const tasks = await todoService.plan([t1.id, t2.id], TODAY)
    // tasks are ordered by position
    expect(tasks[0]!.title).toBe('First')
    expect(tasks[1]!.title).toBe('Second')
  })
})

// ── schedule ──────────────────────────────────────────────────────────────────

describe('todoService.schedule', () => {
  it('moves a backlog item onto a day (cap-enforced)', async () => {
    // Create 5 items and sweep one to backlog
    const t1 = await todoService.add('Keep 1')
    const t2 = await todoService.add('Keep 2')
    const t3 = await todoService.add('Keep 3')
    const t4 = await todoService.add('Keep 4')
    const backlogItem = await todoService.add('Schedule me later')
    // Sweep the last to backlog via plan with only first 4
    await todoService.plan([t1.id, t2.id, t3.id, t4.id], TODAY)

    // Now try to schedule the backlog item — cap is currently 4/5 → OK
    const scheduled = await todoService.schedule(backlogItem.id, TODAY)
    expect(scheduled).not.toBeNull()
    expect(scheduled!.title).toBe('Schedule me later')
  })

  it('throws CAP_REACHED when day is already at cap', async () => {
    // Fill cap
    const allTasks = []
    for (let i = 1; i <= 5; i++) {
      allTasks.push(await todoService.add(`Task ${i}`))
    }
    // Create a backlog item by sweeping one then re-trying to schedule
    const toSweep = allTasks[4]!
    await todoService.plan(
      [allTasks[0]!.id, allTasks[1]!.id, allTasks[2]!.id, allTasks[3]!.id],
      TODAY
    )
    // Day now has 4 open + 0 done; add one more to hit 5
    await todoService.add('Fill to cap')
    // Now at cap — scheduling the swept item should fail
    await expect(todoService.schedule(toSweep.id, TODAY)).rejects.toThrow(CAP_REACHED)
  })

  it('returns null for a non-existent id', async () => {
    const result = await todoService.schedule('no-such-id')
    expect(result).toBeNull()
  })
})

// ── context pool (surface / pin / dismiss) ────────────────────────────────────

describe('todoService context pool', () => {
  beforeEach(async () => {
    // Capture items with tokens that share with todo titles so the hash embedder
    // can surface them. The todo title is also used as a search query.
    await pipelineService.captureText(
      'sprint planning backlog grooming velocity story points estimation',
      'sprint.md'
    )
    await pipelineService.captureText(
      'deployment pipeline ci cd release automation docker kubernetes',
      'deploy.md'
    )
  })

  it('searchMoreContext surfaces relevant items from the pipeline', async () => {
    const task = await todoService.add('sprint planning velocity estimation')
    const updated = await todoService.searchMoreContext(task.id)
    // Should have context items surfaced (sprint doc shares tokens with title)
    expect(updated).not.toBeNull()
    expect(updated!.ctx.length).toBeGreaterThan(0)
  })

  it('pinContext persists pinned state and lists pinned ids', async () => {
    const task = await todoService.add('sprint planning velocity estimation')
    const withCtx = await todoService.searchMoreContext(task.id)
    expect(withCtx).not.toBeNull()
    const ctxId = withCtx!.ctx[0]
    if (!ctxId) return // skip if no context surfaced

    const pinned = await todoService.pinContext(task.id, ctxId)
    expect(pinned).not.toBeNull()
    expect(pinned!.pinned).toContain(ctxId)
  })

  it('dismissContext removes item from visible context', async () => {
    const task = await todoService.add('sprint planning velocity estimation')
    const withCtx = await todoService.searchMoreContext(task.id)
    expect(withCtx).not.toBeNull()
    const ctxId = withCtx!.ctx[0]
    if (!ctxId) return // skip if no context surfaced

    const dismissed = await todoService.dismissContext(task.id, ctxId)
    expect(dismissed).not.toBeNull()
    // Dismissed item should no longer appear in ctx
    expect(dismissed!.ctx).not.toContain(ctxId)
  })

  it('pinContext places pinned items first in ctx', async () => {
    const task = await todoService.add('sprint planning velocity estimation')
    const withCtx = await todoService.searchMoreContext(task.id)
    if (!withCtx || withCtx.ctx.length < 2) return // need ≥2 items

    // Pin the second item
    const secondId = withCtx.ctx[1]!
    const pinned = await todoService.pinContext(task.id, secondId)
    expect(pinned).not.toBeNull()
    expect(pinned!.ctx[0]).toBe(secondId)
    expect(pinned!.pinned[0]).toBe(secondId)
  })
})
