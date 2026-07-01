import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { EMBED_DIM } from '../db'
import { userDataDir } from '../runtime/paths'

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

/**
 * On-device embedder via transformers.js (ONNX). The model downloads once into
 * the app data dir, then runs fully offline. The heavy module + native
 * onnxruntime are loaded **lazily, via dynamic import on first embed** — never on
 * the boot path or the hash path. all-MiniLM-L6-v2 is 384-dim → matches EMBED_DIM,
 * so no schema change. (Proven in the neeme-mono spike; this runs it in the worker.)
 */
type Extractor = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean }
) => Promise<{ data: Float32Array }>

export class LocalEmbedder implements Embedder {
  readonly name = 'minilm-l6-v2'
  readonly dim = EMBED_DIM
  private extractor?: Promise<Extractor>

  private load(): Promise<Extractor> {
    if (!this.extractor) {
      this.extractor = (async () => {
        const { env, pipeline } = await import('@huggingface/transformers')
        env.cacheDir = join(userDataDir(), 'models') // models cache in the app data dir
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
        return extractor as unknown as Extractor
      })()
    }
    return this.extractor
  }

  async embed(texts: string[]): Promise<number[][]> {
    const extractor = await this.load()
    const out: number[][] = []
    for (const text of texts) {
      const result = await extractor(text, { pooling: 'mean', normalize: true })
      out.push(Array.from(result.data))
    }
    return out
  }
}

/**
 * The active embedder. Real on-device model by default; `NEEME_EMBEDDER=hash`
 * forces the deterministic placeholder (offline/dev/tests). Changing this requires
 * a reindex — `pipelineService.syncEmbedder()` handles it on worker boot, since the
 * vector index is a rebuildable artifact derived from `items.text`.
 */
export const embedder: Embedder =
  process.env.NEEME_EMBEDDER?.trim() === 'hash' ? new HashEmbedder() : new LocalEmbedder()
