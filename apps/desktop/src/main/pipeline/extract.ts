import { extractText as pdfText, getDocumentProxy } from 'unpdf'
import type { ContentType, ItemStatus } from '@mikan/contract/ipc'
import { ocr } from './ocr'
import { asr } from './asr'

// Suffix wins, then MIME prefix (ported from the Python content_types.py).
const BY_EXT: Record<string, ContentType> = {
  '.txt': 'text',
  '.md': 'text',
  '.markdown': 'text',
  '.rst': 'text',
  '.log': 'text',
  '.csv': 'text',
  '.json': 'text',
  '.eml': 'text',
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.heic': 'image',
  '.m4a': 'audio',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.opus': 'audio'
}

export function suffixOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function detectContentType(name: string, mime?: string): ContentType {
  const byExt = BY_EXT[suffixOf(name)]
  if (byExt) return byExt
  if (mime) {
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('audio/')) return 'audio'
    if (mime === 'application/pdf') return 'pdf'
    if (mime.startsWith('text/') || mime === 'application/json') return 'text'
  }
  return 'other'
}

export interface ExtractResult {
  text: string
  status: ItemStatus
  error?: string
}

/**
 * Normalize raw bytes to text. text/pdf extract natively; image/audio need a
 * model (vision/whisper) or cloud offload — deferred, so they park as `pending`.
 */
export async function extract(contentType: ContentType, bytes: Uint8Array): Promise<ExtractResult> {
  if (contentType === 'text') {
    const text = new TextDecoder('utf-8').decode(bytes).trim()
    return { text, status: text ? 'extracted' : 'pending' }
  }
  if (contentType === 'pdf') {
    try {
      const pdf = await getDocumentProxy(bytes)
      const { text } = await pdfText(pdf, { mergePages: true })
      const trimmed = (text ?? '').trim()
      return { text: trimmed, status: trimmed ? 'extracted' : 'pending' }
    } catch (err) {
      return { text: '', status: 'failed', error: String(err) }
    }
  }
  return { text: '', status: 'pending' }
}

/**
 * Extract text from a media file (image → OCR, audio → ASR). Runs in the
 * background after capture; the raw file must already be on disk at `filePath`.
 * Returns `extracted` even for blank content (extraction ran; just no text).
 * Returns `failed` on a hard error.
 */
export async function extractMedia(
  contentType: 'image' | 'audio',
  filePath: string,
  mime?: string
): Promise<ExtractResult> {
  try {
    const text =
      contentType === 'image'
        ? await ocr.extract(filePath, mime)
        : await asr.extract(filePath, mime)
    return { text, status: 'extracted' }
  } catch (err) {
    console.error('[extract-media] failed', contentType, filePath, err)
    return { text: '', status: 'failed', error: String(err) }
  }
}
