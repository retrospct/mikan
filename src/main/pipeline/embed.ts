import { createHash } from 'node:crypto'
import { EMBED_DIM } from '../db'

/**
 * The embedding seam. Today's default is a deterministic hash-of-tokens
 * placeholder so the whole capture→index→search path works end-to-end with no
 * native deps (identical text → identical vector; shared words → closer). It is
 * NOT semantic — it proves the plumbing while the real on-device model is wired.
 *
 * Next: swap in a transformers.js LocalEmbedder (EmbeddingGemma / bge / MiniLM),
 * proven in the neeme-mono spike. In Electron that needs onnxruntime-node via
 * `electron-rebuild` (or the WASM backend) — a one-line swap at this seam.
 */
export interface Embedder {
  readonly name: string
  readonly dim: number
  embed(texts: string[]): Promise<number[][]>
}

const TOKEN_RE = /[a-z0-9]+/g

function l2normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0))
  return norm === 0 ? vec : vec.map((x) => x / norm)
}

export class HashEmbedder implements Embedder {
  readonly name = 'hash-placeholder'
  constructor(readonly dim = EMBED_DIM) {}

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.embedOne(t)))
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dim).fill(0)
    for (const tok of text.toLowerCase().match(TOKEN_RE) ?? []) {
      const h = createHash('sha1').update(tok).digest()
      const idx = h.readUInt32BE(0) % this.dim
      vec[idx] = (vec[idx] ?? 0) + ((h[4] ?? 0) & 1 ? 1 : -1)
    }
    return l2normalize(vec)
  }
}

export const embedder: Embedder = new HashEmbedder()
