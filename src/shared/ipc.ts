/**
 * Shared IPC contract — imported by main (handlers), preload (bridge), and
 * renderer (typed `window.api`). Keep this free of Node/Electron/Drizzle
 * imports so the renderer can use it without pulling in backend-only modules.
 */

export interface Memory {
  id: string
  content: string
  createdAt: Date
}

export const IPC = {
  memoryList: 'memory:list',
  memoryAdd: 'memory:add'
} as const

/** The API surface exposed on `window.api`. */
export interface MemoryApi {
  list: () => Promise<Memory[]>
  add: (content: string) => Promise<Memory>
}

export interface NeemeApi {
  memory: MemoryApi
}
