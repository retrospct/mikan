import { desc } from 'drizzle-orm'
import { db } from '../db'
import { memories, type Memory } from '../db/schema'

/**
 * The data layer's public surface. The IPC handlers call into this — nothing in
 * the renderer touches Drizzle or libSQL directly. Swap the storage backend
 * (encrypted DB, Turso embedded replica, a Python `mneme` bridge) behind these
 * signatures without changing the renderer.
 *
 * libSQL is async, so these return Promises (sync I/O would block the main
 * process event loop anyway).
 */
export const memoryService = {
  list(): Promise<Memory[]> {
    return db.select().from(memories).orderBy(desc(memories.createdAt))
  },

  async add(content: string): Promise<Memory> {
    const trimmed = content.trim()
    if (!trimmed) throw new Error('Memory content cannot be empty')
    const [created] = await db.insert(memories).values({ content: trimmed }).returning()
    return created
  }
}
