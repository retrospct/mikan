// capture-file.ts — shared helper: File → Uint8Array → captureFile IPC.
// Used by both the feed maw dropzone and the add-sheet attach buttons.
import type { CaptureResult } from '@nimi/contract/ipc'
import type { MemoryKind } from '@nimi/contract/views'
import { data } from './api'

const EXT_KIND: Record<string, MemoryKind> = {
  '.pdf': 'pdf',
  '.png': 'photo',
  '.jpg': 'photo',
  '.jpeg': 'photo',
  '.gif': 'photo',
  '.webp': 'photo',
  '.heic': 'photo',
  '.m4a': 'voice',
  '.mp3': 'voice',
  '.wav': 'voice',
  '.opus': 'voice',
  '.txt': 'txt',
  '.md': 'txt',
  '.csv': 'txt',
  '.json': 'txt'
}

export function kindOfFile(file: File): MemoryKind {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (EXT_KIND[ext]) return EXT_KIND[ext]
  if (file.type.startsWith('image/')) return 'photo'
  if (file.type.startsWith('audio/')) return 'voice'
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('text/')) return 'txt'
  return 'doc'
}

/** Read a batch of File objects and send each to captureFile over IPC.
 *  Skips zero-byte entries (directory pseudo-files from a drag drop).
 *  Per-file errors are swallowed; only successes are returned. */
export async function captureFiles(files: Iterable<File>): Promise<CaptureResult[]> {
  const results: CaptureResult[] = []
  for (const file of files) {
    if (file.size === 0) continue
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await data.pipeline.captureFile(bytes, file.name, file.type || undefined)
      results.push(result)
    } catch {
      // one bad file shouldn't abort the batch
    }
  }
  return results
}
