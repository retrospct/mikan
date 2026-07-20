import { describe, it, expect, vi, afterEach } from 'vitest'
import { NullDrafter, CloudDrafter } from '../../src/main/pipeline/draft'
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

describe('drafter singleton — whitespace-trimmed env flags', () => {
  const savedDrafter = process.env.NEEME_DRAFTER
  const savedKey = process.env.NEEME_ANTHROPIC_KEY

  afterEach(() => {
    if (savedDrafter === undefined) delete process.env.NEEME_DRAFTER
    else process.env.NEEME_DRAFTER = savedDrafter
    if (savedKey === undefined) delete process.env.NEEME_ANTHROPIC_KEY
    else process.env.NEEME_ANTHROPIC_KEY = savedKey
    vi.resetModules()
  })

  it('NEEME_DRAFTER="off " (trailing space) resolves to NullDrafter', async () => {
    // Set an API key so the pre-fix code would have built a CloudDrafter; only the
    // trim fix makes NEEME_DRAFTER="off " select NullDrafter correctly.
    process.env.NEEME_DRAFTER = 'off '
    process.env.NEEME_ANTHROPIC_KEY = 'sk-test-dummy-key'
    vi.resetModules()
    const { drafter: freshDrafter } = await import('../../src/main/pipeline/draft')
    // instanceof fails across vi.resetModules() boundaries (two class objects); use
    // the stable name property instead.
    expect(freshDrafter.name).toBe('null-drafter')
  })
})

// ── CloudDrafter — abort signal plumbing (Group 03 pause()) ───────────────────
//
// pause() cancels an in-flight run via AbortController. These tests verify the
// signal actually reaches fetch, and that an abort propagates as a real error
// rather than being swallowed into a null "gathered" result — both without a
// live/slow network call, so they're safe and fast in CI.
describe('CloudDrafter — abort signal plumbing', () => {
  const okResponse = (): { ok: true; json: () => Promise<unknown> } => ({
    ok: true,
    json: async () => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            brief: null,
            draft: null,
            draftNote: null,
            note: null,
            noteKind: null,
            status: 'gathered',
            conf: null,
            why: {}
          })
        }
      ]
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes the signal through to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const drafter = new CloudDrafter('sk-test-dummy-key')
    const controller = new AbortController()

    await drafter.draft(EMPTY_INPUT, controller.signal)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.signal).toBe(controller.signal)
  })

  it('works without a signal (optional param)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const drafter = new CloudDrafter('sk-test-dummy-key')

    await expect(drafter.draft(EMPTY_INPUT)).resolves.toMatchObject({ status: 'gathered' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.signal).toBeUndefined()
  })

  it('rethrows an AbortError instead of swallowing it into a null result', async () => {
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))
    const drafter = new CloudDrafter('sk-test-dummy-key')

    await expect(drafter.draft(EMPTY_INPUT, new AbortController().signal)).rejects.toThrow(
      /aborted/i
    )
  })

  it('still swallows a non-abort transport failure into a null "gathered" result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const drafter = new CloudDrafter('sk-test-dummy-key')

    const result = await drafter.draft(EMPTY_INPUT)
    expect(result.status).toBe('gathered')
    expect(result.draft).toBeNull()
  })
})
