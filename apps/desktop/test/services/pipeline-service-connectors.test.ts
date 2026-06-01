/**
 * Integration tests for connector-specific pipelineService methods:
 *   captureExternal  — externalId dedup, email immutability, calendar upsert
 *   connector cursor helpers — get/set/reset cursor, item count, last sync
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb } from '../../src/main/db/index'
import { pipelineService } from '../../src/main/services/pipeline-service'
import { clearTables } from '../helpers'

beforeAll(async () => {
  await initDb()
})

beforeEach(async () => {
  await clearTables()
})

// ── captureExternal — new items ───────────────────────────────────────────────

describe('pipelineService.captureExternal — new items', () => {
  it('creates a new item and returns created:true', async () => {
    const result = await pipelineService.captureExternal(
      'Subject: Hello\nFrom: alice@example.com\n\nBody text',
      'Hello — from alice@example.com',
      { connector: 'gmail', externalId: 'msg-001' }
    )
    expect(result.created).toBe(true)
    expect(result.memory.id).toBeTruthy()
    expect(result.memory.kind).toBe('email')
  })

  it('sets kind to "email" for gmail connector', async () => {
    const result = await pipelineService.captureExternal('Email body', 'email.txt', {
      connector: 'gmail',
      externalId: 'msg-kind-test'
    })
    expect(result.memory.kind).toBe('email')
  })

  it('sets kind to "calendar" for gcal connector', async () => {
    const result = await pipelineService.captureExternal(
      'Event: Standup\nStart: 2026-06-01T09:00:00Z',
      'Standup',
      { connector: 'gcal', externalId: 'evt-kind-test' }
    )
    expect(result.memory.kind).toBe('calendar')
  })

  it('stores uri when provided', async () => {
    const result = await pipelineService.captureExternal(
      'Email with link',
      'linked email',
      {
        connector: 'gmail',
        externalId: 'msg-uri-test',
        uri: 'https://mail.google.com/mail/u/0/#inbox/msg-uri-test'
      }
    )
    expect(result.created).toBe(true)
    expect(result.memory.src).toBe('https://mail.google.com/mail/u/0/#inbox/msg-uri-test')
  })
})

// ── captureExternal — email dedup (immutable) ─────────────────────────────────

describe('pipelineService.captureExternal — Gmail dedup (immutable)', () => {
  it('returns created:false for the same externalId on second call', async () => {
    const provenance = { connector: 'gmail', externalId: 'msg-dedup-001' }
    const r1 = await pipelineService.captureExternal('First body', 'email', provenance)
    const r2 = await pipelineService.captureExternal('First body', 'email', provenance)
    expect(r1.created).toBe(true)
    expect(r2.created).toBe(false)
    expect(r2.memory.id).toBe(r1.memory.id)
  })

  it('does NOT update text when the same Gmail externalId is re-ingested', async () => {
    const provenance = { connector: 'gmail', externalId: 'msg-immutable-001' }
    const r1 = await pipelineService.captureExternal('Original body', 'email', provenance)
    const r2 = await pipelineService.captureExternal('Updated body', 'email', provenance)
    // Should return the original memory unchanged
    expect(r2.memory.id).toBe(r1.memory.id)
    const items = await pipelineService.listItems()
    const stored = items.find((i) => i.id === r1.memory.id)
    expect(stored?.text).toBe('Original body')
  })

  it('different externalIds are treated as separate items', async () => {
    const r1 = await pipelineService.captureExternal('Email one', 'e1', {
      connector: 'gmail',
      externalId: 'msg-001'
    })
    const r2 = await pipelineService.captureExternal('Email two', 'e2', {
      connector: 'gmail',
      externalId: 'msg-002'
    })
    expect(r1.created).toBe(true)
    expect(r2.created).toBe(true)
    expect(r1.memory.id).not.toBe(r2.memory.id)
  })
})

// ── captureExternal — calendar upsert (mutable) ───────────────────────────────

describe('pipelineService.captureExternal — Calendar upsert (mutable)', () => {
  it('returns created:false but updates text on second call for gcal', async () => {
    const provenance = { connector: 'gcal', externalId: 'evt-upsert-001' }
    const r1 = await pipelineService.captureExternal(
      'Event: Standup\nStart: 2026-06-01T09:00:00Z',
      'Standup',
      provenance
    )
    const r2 = await pipelineService.captureExternal(
      'Event: Standup RESCHEDULED\nStart: 2026-06-02T10:00:00Z',
      'Standup RESCHEDULED',
      provenance
    )
    expect(r1.created).toBe(true)
    expect(r2.created).toBe(false)
    expect(r2.memory.id).toBe(r1.memory.id)

    // Text should have been updated
    const items = await pipelineService.listItems()
    const stored = items.find((i) => i.id === r1.memory.id)
    expect(stored?.text).toContain('RESCHEDULED')
  })

  it('updated calendar event is findable via search', async () => {
    const provenance = { connector: 'gcal', externalId: 'evt-search-001' }
    await pipelineService.captureExternal('Event: Morning sync\nStart: 2026-06-01', 'sync', provenance)
    await pipelineService.captureExternal(
      'Event: Afternoon sync UPDATED\nStart: 2026-06-01',
      'sync updated',
      provenance
    )
    const hits = await pipelineService.search('Afternoon sync UPDATED', 5)
    expect(hits.length).toBeGreaterThan(0)
  })
})

// ── connector cursor helpers ──────────────────────────────────────────────────

describe('pipelineService connector cursor helpers', () => {
  it('getConnectorCursor returns null when no cursor is set', async () => {
    const cursor = await pipelineService.getConnectorCursor('gmail')
    expect(cursor).toBeNull()
  })

  it('setConnectorCursor + getConnectorCursor round-trip', async () => {
    await pipelineService.setConnectorCursor('gmail', 'historyId-abc123', 0)
    const cursor = await pipelineService.getConnectorCursor('gmail')
    expect(cursor).toBe('historyId-abc123')
  })

  it('setConnectorCursor is idempotent (upsert)', async () => {
    await pipelineService.setConnectorCursor('gmail', 'v1', 0)
    await pipelineService.setConnectorCursor('gmail', 'v2', 5)
    expect(await pipelineService.getConnectorCursor('gmail')).toBe('v2')
  })

  it('gmail and gcal cursors are independent', async () => {
    await pipelineService.setConnectorCursor('gmail', 'gmail-cursor', 0)
    await pipelineService.setConnectorCursor('gcal', 'gcal-sync-token', 0)
    expect(await pipelineService.getConnectorCursor('gmail')).toBe('gmail-cursor')
    expect(await pipelineService.getConnectorCursor('gcal')).toBe('gcal-sync-token')
  })

  it('resetConnectorCursor clears the cursor to null', async () => {
    await pipelineService.setConnectorCursor('gcal', 'sync-token-xyz', 0)
    await pipelineService.resetConnectorCursor('gcal')
    expect(await pipelineService.getConnectorCursor('gcal')).toBeNull()
  })

  it('getConnectorItemCount returns 0 when no rows exist', async () => {
    expect(await pipelineService.getConnectorItemCount('gmail')).toBe(0)
  })

  it('getConnectorItemCount reflects the stored count', async () => {
    await pipelineService.setConnectorCursor('gmail', 'h1', 42)
    expect(await pipelineService.getConnectorItemCount('gmail')).toBe(42)
  })

  it('getConnectorLastSync returns null when not set', async () => {
    expect(await pipelineService.getConnectorLastSync('gmail')).toBeNull()
  })
})
