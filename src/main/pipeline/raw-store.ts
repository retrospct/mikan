import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { userDataDir } from '../runtime/paths'

/**
 * Content-addressed raw store: the original bytes land first, sha256-named and
 * sharded, under Electron's per-user `userData/raw`. Idempotent — the same bytes
 * map to the same id + path, so re-capture is a no-op. (Ported from the Python
 * `raw_store.py` / the neeme-mono pipeline.)
 */
export interface RawItem {
  id: string
  storedPath: string
  sizeBytes: number
  isNew: boolean
}

export function putRaw(bytes: Uint8Array, suffix = ''): RawItem {
  const id = createHash('sha256').update(bytes).digest('hex')
  const dir = join(userDataDir(), 'raw', id.slice(0, 2))
  const storedPath = join(dir, `${id}${suffix}`)
  const isNew = !existsSync(storedPath)
  if (isNew) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(storedPath, bytes)
  }
  return { id, storedPath, sizeBytes: bytes.byteLength, isNew }
}
