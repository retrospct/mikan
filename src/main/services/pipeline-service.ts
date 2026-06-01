import { desc, eq } from 'drizzle-orm'
import { client, db } from '../db'
import { items, type Item as ItemRow } from '../db/schema'
import { chunkText } from '../pipeline/chunk'
import { embedder } from '../pipeline/embed'
import { detectContentType, extract, suffixOf } from '../pipeline/extract'
import { putRaw } from '../pipeline/raw-store'
import type { CaptureResult, ContentType, Item, ItemStatus, SearchHit } from '../../shared/ipc'
import type { FedItem, MatchHit, Memory } from '../../shared/views'
import { toFedItem, toMatchHits, toMemory } from './project'

/**
 * The on-device pipeline (ADR 0003): capture → content-hash store → extract →
 * chunk → embed → index in libSQL; and semantic search over the chunks. The IPC
 * handlers call into this — the renderer never touches Drizzle or libSQL.
 * Ported from the Python `neeme` pipeline + the neeme-mono engine.
 */

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    sourceName: row.sourceName,
    contentType: row.contentType as ContentType,
    sizeBytes: row.sizeBytes,
    status: row.status as ItemStatus,
    text: row.text,
    createdAt: row.createdAt
  }
}

async function capture(bytes: Uint8Array, name: string, mime?: string): Promise<CaptureResult> {
  const { id, storedPath, sizeBytes } = putRaw(bytes, suffixOf(name))

  // Idempotent on content: already captured these exact bytes → return it.
  const existing = await db.select().from(items).where(eq(items.id, id)).limit(1)
  if (existing[0]) return { memory: toMemory(toItem(existing[0])), created: false }

  const contentType = detectContentType(name, mime)
  const { text, status } = await extract(contentType, bytes)
  const [created] = await db
    .insert(items)
    .values({ id, sourceName: name, contentType, sizeBytes, storedPath, text, status })
    .returning()

  if (text) {
    const chunks = chunkText(text)
    const vectors = await embedder.embed(chunks)
    for (let i = 0; i < chunks.length; i++) {
      await client.execute({
        sql: 'INSERT OR REPLACE INTO chunks (item_id, chunk_idx, text, embedding) VALUES (?, ?, ?, vector32(?))',
        args: [id, i, chunks[i]!, JSON.stringify(vectors[i] ?? [])]
      })
    }
  }
  return { memory: toMemory(toItem(created!)), created: true }
}

export const pipelineService = {
  captureText(text: string, name = 'note.md'): Promise<CaptureResult> {
    return capture(new TextEncoder().encode(text), name, 'text/markdown')
  },

  captureFile(bytes: Uint8Array, name: string, mime?: string): Promise<CaptureResult> {
    return capture(bytes, name, mime)
  },

  async search(query: string, topK = 8): Promise<SearchHit[]> {
    const [queryVector] = await embedder.embed([query])
    if (!queryVector) return []
    const res = await client.execute({
      sql: `SELECT c.item_id AS item_id, c.chunk_idx AS chunk_idx, c.text AS chunk_text,
                   vector_distance_cos(c.embedding, vector32(?)) AS dist,
                   i.source_name AS source_name, i.content_type AS content_type
            FROM chunks c JOIN items i ON i.id = c.item_id
            ORDER BY dist ASC LIMIT ?`,
      args: [JSON.stringify(queryVector), topK]
    })
    return res.rows.map((r) => ({
      itemId: String(r.item_id),
      chunkIdx: Number(r.chunk_idx),
      text: String(r.chunk_text),
      score: Number(r.dist),
      sourceName: String(r.source_name),
      contentType: String(r.content_type) as ContentType
    }))
  },

  async listItems(): Promise<Item[]> {
    const rows = await db.select().from(items).orderBy(desc(items.createdAt))
    return rows.map(toItem)
  },

  /** The archive (UI `MEMORIES`): every captured item projected to a `Memory`. */
  async archive(): Promise<Memory[]> {
    return (await this.listItems()).map(toMemory)
  },

  /** The recent-capture feed, newest first. */
  async feed(): Promise<FedItem[]> {
    return (await this.listItems()).map(toFedItem)
  },

  /** Rank archive memories for a typed task/query (the UI's `matchTask`). */
  async match(query: string, topK = 8): Promise<MatchHit[]> {
    return toMatchHits(await this.search(query, topK))
  }
}
