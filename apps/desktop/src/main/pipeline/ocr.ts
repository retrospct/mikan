import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { userDataDir } from '../runtime/paths'

/**
 * OCR seam — mirrors the embedder/drafter pattern.
 *
 * On macOS, a Swift helper uses Vision framework (fast, native, handles HEIC).
 * Everywhere else (and as the macOS fallback), TesseractOcr runs the WASM OCR
 * engine with lazy model download. HEIC images are pre-converted to JPEG since
 * Tesseract doesn't decode HEIC natively.
 *
 * Env vars:
 *   NEEME_MAC_HELPER  — path to the compiled nimi-extract binary (set by worker/client.ts)
 *   NEEME_EXTRACTOR   — 'portable' forces TesseractOcr even on macOS
 *   NEEME_OCR_LANG    — Tesseract language code (default: 'eng')
 */

export interface Ocr {
  readonly name: string
  /** Extract text from an image file at `filePath`. Returns '' if no text found. */
  extract(filePath: string, mime?: string): Promise<string>
}

// ── TesseractOcr ──────────────────────────────────────────────────────────

type TsWorker = {
  recognize(image: string): Promise<{ data: { text: string } }>
  terminate(): Promise<void>
}

export class TesseractOcr implements Ocr {
  readonly name = 'tesseract'
  private workerP?: Promise<TsWorker>

  constructor(private readonly lang = 'eng') {}

  private load(): Promise<TsWorker> {
    if (!this.workerP) {
      this.workerP = (async () => {
        const { createWorker } = await import('tesseract.js')
        // `cachePath` = where tesseract saves (and reads back on next boot) the downloaded
        // .traineddata. Do NOT use `langPath` for a local directory: in v7 Node mode, a
        // local `langPath` means "read from here (no download)", which requires the file to
        // already exist. `cachePath` correctly triggers CDN download → local cache.
        const cachePath = join(userDataDir(), 'models', 'tesseract')
        mkdirSync(cachePath, { recursive: true })
        // OEM 1 = LSTM_ONLY (the neural net engine — better than legacy)
        return (await createWorker(this.lang, 1, { cachePath })) as unknown as TsWorker
      })()
    }
    return this.workerP
  }

  async extract(filePath: string, mime?: string): Promise<string> {
    const isHeic =
      filePath.toLowerCase().endsWith('.heic') ||
      mime === 'image/heic' ||
      mime === 'image/heif'

    let recognizePath = filePath
    let tempPath: string | null = null

    try {
      if (isHeic) {
        // Vision handles HEIC natively; Tesseract needs a JPEG.
        const heicBytes = readFileSync(filePath)
        const convertMod = await import('heic-convert')
        const convert = (convertMod.default ?? convertMod) as (opts: {
          buffer: Buffer
          format: 'JPEG'
          quality: number
        }) => Promise<ArrayBuffer>
        const jpegAb = await convert({ buffer: heicBytes, format: 'JPEG', quality: 0.9 })
        tempPath = join(tmpdir(), `mikan-ocr-${randomUUID()}.jpg`)
        writeFileSync(tempPath, Buffer.from(jpegAb))
        recognizePath = tempPath
      }

      const worker = await this.load()
      const {
        data: { text }
      } = await worker.recognize(recognizePath)
      return text.trim()
    } finally {
      if (tempPath) {
        try {
          unlinkSync(tempPath)
        } catch {}
      }
    }
  }
}

// ── MacVisionOcr ──────────────────────────────────────────────────────────

export class MacVisionOcr implements Ocr {
  readonly name = 'mac-vision'
  constructor(private readonly helperPath: string) {}

  extract(filePath: string): Promise<string> {
    return spawnHelper(this.helperPath, 'ocr', filePath)
  }
}

// ── shared helper ─────────────────────────────────────────────────────────

function spawnHelper(helperPath: string, command: string, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    const proc = spawn(helperPath, [command, filePath], { timeout: 60_000 })
    proc.stdout.on('data', (d: Buffer) => out.push(d))
    proc.stderr.on('data', (d: Buffer) => err.push(d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `[nimi-extract] ${command} exited ${code}: ${Buffer.concat(err).toString().trim()}`
          )
        )
        return
      }
      resolve(Buffer.concat(out).toString('utf8').trim())
    })
  })
}

// ── helper detection ──────────────────────────────────────────────────────

function detectHelper(): string | null {
  const p = process.env.NEEME_MAC_HELPER
  if (!p) return null
  try {
    return existsSync(p) ? p : null
  } catch {
    return null
  }
}

// ── singleton ─────────────────────────────────────────────────────────────

const extMode = process.env.NEEME_EXTRACTOR
const helper = extMode === 'off' || extMode === 'portable' ? null : detectHelper()

/**
 * The active OCR impl. On macOS with the nimi-extract helper present, Vision is
 * used; otherwise Tesseract (portable WASM). `NEEME_EXTRACTOR=portable` forces
 * Tesseract even on macOS. `NEEME_EXTRACTOR=off` is handled at the caller —
 * the singleton still resolves to Tesseract (but extraction won't be scheduled).
 */
export const ocr: Ocr =
  process.platform === 'darwin' && helper !== null
    ? new MacVisionOcr(helper)
    : new TesseractOcr(process.env.NEEME_OCR_LANG ?? 'eng')
