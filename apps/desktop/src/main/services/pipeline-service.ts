import { desc, eq, inArray, sql } from 'drizzle-orm'
import { client, db, vecClient, resetVecChunks } from '../db'
import { items, connectorState, type Item as ItemRow } from '../db/schema'
import { chunkText } from '../pipeline/chunk'
import { embedder } from '../pipeline/embed'
import { detectContentType, extract, extractMedia, suffixOf } from '../pipeline/extract'
import { putRaw } from '../pipeline/raw-store'
import { encrypt, decrypt } from '../db/crypto'
import type { CaptureResult, ContentType, Item, ItemStatus, SearchHit } from '@mikan/contract/ipc'
import type { FedItem, MatchHit, Memory } from '@mikan/contract/views'
import { toFedItem, toMatchHits, toMemory } from './project'

/**
 * The on-device pipeline (ADR 0003): capture → content-hash store → extract →
 * chunk → embed → index in libSQL; and semantic search over the chunks. The IPC
 * handlers call into this — the renderer never touches Drizzle or libSQL.
 * Ported from the Python `neeme` pipeline + the neeme-mono engine.
 *
 * Encryption: when NEEME_SYNC_ENCRYPTION_KEY is set, items.text is encrypted
 * before being written to the DB (so the cloud primary holds ciphertext) and
 * decrypted on read. The encrypt/decrypt functions are no-ops when the key is
 * absent — unencrypted local usage is identical to before.
 * chunks.text stores plaintext excerpts (they are local-only derived data;
 * addressed by the future vector-index-split / neeme-vec.db refactor).
 */

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    sourceName: row.sourceName,
    contentType: row.contentType as ContentType,
    sizeBytes: row.sizeBytes,
    status: row.status as ItemStatus,
    // Decrypt text on read; identity pass-through when no key is set.
    text: decrypt(row.text),
    connector: row.connector ?? undefined,
    externalId: row.externalId ?? undefined,
    uri: row.uri ?? undefined,
    createdAt: row.createdAt
  }
}

async function capture(bytes: Uint8Array, name: string, mime?: string): Promise<CaptureResult> {
  const { id, storedPath, sizeBytes } = putRaw(bytes, suffixOf(name))

  // Idempotent on content: already captured these exact bytes → return it.
  const existing = await db.select().from(items).where(eq(items.id, id)).limit(1)
  if (existing[0]) return { memory: toMemory(toItem(existing[0])), created: false }

  const contentType = detectContentType(name, mime)
  // text/pdf extract synchronously; image/audio park as pending and extract in the background.
  const { text, status } = await extract(contentType, bytes)
  const [created] = await db
    .insert(items)
    .values({
      id,
      sourceName: name,
      contentType,
      sizeBytes,
      storedPath,
      text: encrypt(text),
      status
    })
    .returning()

  // Index plaintext in the local vector index (chunks are a local-only artifact).
  if (text) await indexItem(id, text)

  // Kick off background OCR/ASR — returns immediately, extraction runs in the queue.
  if (
    (contentType === 'image' || contentType === 'audio') &&
    storedPath &&
    process.env.NEEME_EXTRACTOR?.trim() !== 'off'
  ) {
    scheduleExtraction(id, storedPath, contentType, mime)
  }

  return { memory: toMemory(toItem(created!)), created: true }
}

// ── Background extraction queue ────────────────────────────────────────────
//
// A serial promise chain so heavy OCR/ASR models never load concurrently.
// Jobs are enqueued by capture() and by resumeMediaExtraction() on boot.

let extractionQueue: Promise<void> = Promise.resolve()

function scheduleExtraction(
  id: string,
  storedPath: string,
  contentType: ContentType,
  mime: string | undefined
): void {
  extractionQueue = extractionQueue
    .then(() => runExtraction(id, storedPath, contentType, mime))
    .catch((err: unknown) => {
      console.error('[pipeline] extraction job failed', id, err)
    })
}

async function runExtraction(
  id: string,
  storedPath: string,
  contentType: ContentType,
  mime: string | undefined
): Promise<void> {
  if (contentType !== 'image' && contentType !== 'audio') return
  const result = await extractMedia(contentType, storedPath, mime)
  // Encrypt text before persisting; index plaintext in the local vector store.
  await db
    .update(items)
    .set({ text: encrypt(result.text), status: result.status })
    .where(eq(items.id, id))
  if (result.text) await indexItem(id, result.text)
  console.log('[pipeline] extracted', contentType, id, `status=${result.status}`)
}

// ── indexItem ──────────────────────────────────────────────────────────────

/** Chunk + embed an item's text into the vector index (capture + reindex share this).
 *  Always receives plaintext — caller is responsible for decrypting if needed. */
async function indexItem(id: string, text: string): Promise<void> {
  const chunks = chunkText(text)
  const vectors = await embedder.embed(chunks)
  for (let i = 0; i < chunks.length; i++) {
    await vecClient.execute({
      sql: 'INSERT OR REPLACE INTO chunks (item_id, chunk_idx, text, embedding) VALUES (?, ?, ?, vector32(?))',
      args: [id, i, chunks[i]!, JSON.stringify(vectors[i] ?? [])]
    })
  }
}

export interface ExternalProvenance {
  connector: string
  externalId: string
  uri?: string
}

export const pipelineService = {
  captureText(text: string, name = 'note.md'): Promise<CaptureResult> {
    return capture(new TextEncoder().encode(text), name, 'text/markdown')
  },

  captureFile(bytes: Uint8Array, name: string, mime?: string): Promise<CaptureResult> {
    return capture(bytes, name, mime)
  },

  /**
   * Ingest text from an external connector (Gmail, Calendar).
   *
   * Dedup strategy:
   *   - Email (immutable): skip if `externalId` already exists.
   *   - Calendar (mutable): upsert — re-index with fresh text if `externalId` already exists.
   *
   * Provenance (`connector`, `externalId`, `uri`) is stored alongside the item
   * so `memoryKindOf` can emit the correct UI kind (email / calendar / event).
   */
  async captureExternal(
    text: string,
    name: string,
    provenance: ExternalProvenance
  ): Promise<CaptureResult> {
    const { connector, externalId, uri } = provenance

    // Check for an existing item with this externalId.
    const existing = await db
      .select()
      .from(items)
      .where(eq(items.externalId, externalId))
      .limit(1)

    if (existing[0]) {
      const isCalendar = connector === 'gcal'
      if (isCalendar) {
        // Calendar events mutate — upsert text + re-index.
        await db
          .update(items)
          .set({ text: encrypt(text), status: 'extracted', uri: uri ?? null })
          .where(eq(items.externalId, externalId))
        if (text) await indexItem(existing[0].id, text)
        const refreshed = await db.select().from(items).where(eq(items.id, existing[0].id)).limit(1)
        return { memory: toMemory(toItem(refreshed[0]!)), created: false }
      }
      // Email is immutable — skip.
      return { memory: toMemory(toItem(existing[0])), created: false }
    }

    // New item: encode text as bytes, store in the raw store, then index.
    const bytes = new TextEncoder().encode(text)
    const { id, storedPath, sizeBytes } = putRaw(bytes, '.txt')

    // Content-hash dedup (same bytes, different externalId — very unlikely but safe).
    const byHash = await db.select().from(items).where(eq(items.id, id)).limit(1)
    if (byHash[0]) {
      // Patch provenance onto the existing content-hash row.
      await db.update(items).set({ connector, externalId, uri: uri ?? null }).where(eq(items.id, id))
      return { memory: toMemory(toItem({ ...byHash[0], connector, externalId, uri: uri ?? null })), created: false }
    }

    const [created] = await db
      .insert(items)
      .values({
        id,
        sourceName: name,
        contentType: 'text',
        sizeBytes,
        storedPath,
        text: encrypt(text),
        status: 'extracted',
        connector,
        externalId,
        uri: uri ?? null
      })
      .returning()

    if (text) await indexItem(id, text)
    return { memory: toMemory(toItem(created!)), created: true }
  },

  /** Read the sync cursor for a provider (Gmail historyId / Calendar syncToken). */
  async getConnectorCursor(provider: string): Promise<string | null> {
    const row = await db.select().from(connectorState).where(eq(connectorState.provider, provider)).limit(1)
    return row[0]?.cursor ?? null
  },

  /** Persist the sync cursor + item count after a successful sync run. */
  async setConnectorCursor(provider: string, cursor: string | null, deltaCount: number): Promise<void> {
    await db
      .insert(connectorState)
      .values({ provider, cursor, itemCount: deltaCount, lastSyncAt: new Date() })
      .onConflictDoUpdate({
        target: connectorState.provider,
        set: {
          cursor,
          itemCount: sql`${connectorState.itemCount} + ${deltaCount}`,
          lastSyncAt: new Date()
        }
      })
  },

  /** Return the current item count for a provider (for the ConnectorsState UI). */
  async getConnectorItemCount(provider: string): Promise<number> {
    const row = await db.select().from(connectorState).where(eq(connectorState.provider, provider)).limit(1)
    return row[0]?.itemCount ?? 0
  },

  /** Return the last sync timestamp for a provider (ISO string or null). */
  async getConnectorLastSync(provider: string): Promise<string | null> {
    const row = await db.select().from(connectorState).where(eq(connectorState.provider, provider)).limit(1)
    const d = row[0]?.lastSyncAt
    return d ? d.toISOString() : null
  },

  /** Reset a provider's cursor (forces a full re-sync on next run). */
  async resetConnectorCursor(provider: string): Promise<void> {
    await db.delete(connectorState).where(eq(connectorState.provider, provider))
  },

  async search(query: string, topK = 8): Promise<SearchHit[]> {
    const [queryVector] = await embedder.embed([query])
    if (!queryVector) return []
    // chunks live in neeme-vec.db (vecClient); items live in neeme.db (client).
    // Cross-file JOINs aren't possible in SQLite, so fetch chunk hits first then
    // hydrate item metadata from the main DB.
    const chunkRes = await vecClient.execute({
      sql: `SELECT item_id, chunk_idx, text AS chunk_text,
                   vector_distance_cos(embedding, vector32(?)) AS dist
            FROM chunks
            ORDER BY dist ASC LIMIT ?`,
      args: [JSON.stringify(queryVector), topK]
    })
    if (chunkRes.rows.length === 0) return []
    const itemIds = [...new Set(chunkRes.rows.map((r) => String(r.item_id)))]
    const itemRes = await client.execute({
      sql: `SELECT id, source_name, content_type FROM items WHERE id IN (${itemIds.map(() => '?').join(',')})`,
      args: itemIds
    })
    const itemMap = new Map(itemRes.rows.map((r) => [String(r.id), r]))
    return chunkRes.rows.flatMap((r) => {
      const item = itemMap.get(String(r.item_id))
      if (!item) return []
      return [{
        itemId: String(r.item_id),
        chunkIdx: Number(r.chunk_idx),
        text: String(r.chunk_text),
        score: Number(r.dist),
        sourceName: String(item.source_name),
        contentType: String(item.content_type) as ContentType
      }]
    })
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
  },

  /** Re-embed every item's text into the vector index (drops + rebuilds chunks).
   *  The index is a rebuildable artifact derived from items.text.
   *  Reads and decrypts text before re-indexing so the vector space uses plaintext. */
  async reindexAll(): Promise<number> {
    const rows = await db.select().from(items)
    // DELETE FROM chunks leaves the libsql_vector_idx shadow tables inconsistent;
    // drop+recreate is the safe reset before re-inserting all vectors.
    await resetVecChunks()
    let n = 0
    for (const row of rows) {
      const plaintext = decrypt(row.text)
      if (!plaintext) continue
      await indexItem(row.id, plaintext)
      n++
    }
    return n
  },

  /**
   * On worker boot: re-enqueue any items that are still `pending` image/audio
   * (from a previous capture that crashed or ran with NEEME_EXTRACTOR=off).
   * Best-effort — failure must not block the worker from starting.
   */
  async resumeMediaExtraction(): Promise<void> {
    if (process.env.NEEME_EXTRACTOR?.trim() === 'off') return
    const pending = await db
      .select()
      .from(items)
      .where(inArray(items.contentType, ['image', 'audio']))
      .then((rows) => rows.filter((r) => r.status === 'pending' && !!r.storedPath))
    for (const row of pending) {
      scheduleExtraction(row.id, row.storedPath!, row.contentType as ContentType, undefined)
    }
    if (pending.length > 0) {
      console.log('[pipeline] queued', pending.length, 'pending media item(s) for extraction')
    }
  },

  /** Keep the vector index consistent with the active embedder. If the embedder
   *  changed since last boot, existing vectors live in a different space → reindex.
   *  No-op when nothing changed (and near-instant when there are no items yet). */
  async syncEmbedder(): Promise<void> {
    const res = await client.execute({
      sql: 'SELECT value FROM meta WHERE key = ?',
      args: ['embedder']
    })
    const prev = res.rows[0]?.value as string | undefined
    if (prev === embedder.name) return
    await pipelineService.reindexAll()
    await client.execute({
      sql: 'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      args: ['embedder', embedder.name]
    })
  }
}
