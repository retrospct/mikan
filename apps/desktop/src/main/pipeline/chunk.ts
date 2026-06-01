/** Split text into overlapping char windows for embedding (ported from chunking.py). */
export function chunkText(text: string, maxChars = 800, overlap = 100): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]
  if (overlap >= maxChars) throw new Error('overlap must be < maxChars')

  const chunks: string[] = []
  let start = 0
  while (start < trimmed.length) {
    const end = Math.min(start + maxChars, trimmed.length)
    chunks.push(trimmed.slice(start, end))
    if (end >= trimmed.length) break
    start = end - overlap
  }
  return chunks
}
