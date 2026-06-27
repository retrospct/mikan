import { createHash } from 'node:crypto'
import { client } from '../db'
import { drafter, type UncoverInput } from '../pipeline/draft'
import { pipelineService } from './pipeline-service'
import { relativeWhen, toUncoveredTodo } from './project'
import type { UncoveredTodo } from '@mikan/contract/views'

/**
 * Uncover service — infers candidate to-dos from the recent capture feed via the
 * `Drafter` seam. Mirrors `draft-service.ts`: build an input from real data, hash
 * it to skip redundant LLM calls, call the drafter, project to the view model.
 *
 * The result is cached in the `meta` table under `UNCOVERED_KEY` keyed by an
 * inputs-hash of the recent feed, so switching to the Feed tab doesn't re-call
 * the API unless the feed actually changed. Degrades to `[]` with the NullDrafter
 * (no `NEEME_ANTHROPIC_KEY`).
 */

/** How many of the most recent text-bearing items to consider. */
const FEED_WINDOW = 20
const UNCOVERED_KEY = 'uncovered'

interface UncoveredCache {
  hash: string
  todos: UncoveredTodo[]
}

/** A stable content address over the feed window (ids + excerpt heads). */
function hashInput(input: UncoverInput): string {
  const stable = JSON.stringify(
    input.items
      .slice()
      .sort((a, b) => a.itemId.localeCompare(b.itemId))
      .map((c) => ({ id: c.itemId, excerpt: (c.excerpt ?? '').slice(0, 200) }))
  )
  return createHash('sha1').update(stable).digest('hex')
}

async function readCache(): Promise<UncoveredCache | null> {
  const res = await client.execute({
    sql: 'SELECT value FROM meta WHERE key = ?',
    args: [UNCOVERED_KEY]
  })
  const value = res.rows[0]?.value as string | undefined
  if (!value) return null
  try {
    return JSON.parse(value) as UncoveredCache
  } catch {
    return null
  }
}

async function writeCache(cache: UncoveredCache): Promise<void> {
  await client.execute({
    sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
    args: [UNCOVERED_KEY, JSON.stringify(cache)]
  })
}

export const uncoverService = {
  /** Candidate to-dos inferred from the recent feed (cached between feed changes). */
  async uncoverTodos(): Promise<UncoveredTodo[]> {
    const items = (await pipelineService.listItems())
      .filter((it) => it.text.trim().length > 0)
      .slice(0, FEED_WINDOW)

    const input: UncoverInput = {
      items: items.map((it) => ({
        itemId: it.id,
        sourceName: it.sourceName,
        contentType: it.contentType,
        excerpt: it.text.slice(0, 400),
        when: relativeWhen(it.createdAt)
      }))
    }

    const hash = hashInput(input)
    const cached = await readCache()
    if (cached && cached.hash === hash) return cached.todos

    const drafts = await drafter.uncover(input)
    const todos = drafts.map(toUncoveredTodo)
    await writeCache({ hash, todos })
    return todos
  }
}
