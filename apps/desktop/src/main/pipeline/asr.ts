import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { userDataDir } from '../runtime/paths'

/**
 * ASR (automatic speech recognition) seam — mirrors the embedder/drafter pattern.
 *
 * On macOS with the nimi-extract helper, Speech framework is used (fast, on-device,
 * no model download). On all other platforms, WhisperAsr decodes the audio via
 * ffmpeg (→ 16kHz mono f32le PCM), then runs Xenova/whisper-tiny via
 * transformers.js / onnxruntime (the same runtime already used for MiniLM).
 *
 * Env vars:
 *   NEEME_MAC_HELPER     — path to the compiled nimi-extract binary (set by worker/client.ts)
 *   NEEME_EXTRACTOR      — 'portable' forces WhisperAsr even on macOS
 *   NEEME_WHISPER_MODEL  — override the Whisper model (default: Xenova/whisper-tiny)
 */

export interface Asr {
  readonly name: string
  /** Transcribe the audio file at `filePath`. Returns '' if no speech detected. */
  extract(filePath: string, mime?: string): Promise<string>
}

// ── WhisperAsr ────────────────────────────────────────────────────────────

const DEFAULT_WHISPER_MODEL = 'Xenova/whisper-tiny'

type AsrPipeline = (
  input: Float32Array,
  opts?: { chunk_length_s?: number; stride_length_s?: number }
) => Promise<{ text: string }>

export class WhisperAsr implements Asr {
  readonly name = 'whisper'
  private pipelineP?: Promise<AsrPipeline>
  private ffmpegPathP?: Promise<string>

  private async loadFfmpeg(): Promise<string> {
    if (!this.ffmpegPathP) {
      this.ffmpegPathP = (async () => {
        const mod = await import('ffmpeg-static')
        const raw = (mod.default ?? mod) as string
        // In a packaged Electron app, native binaries must be in app.asar.unpacked
        return raw.replace('app.asar', 'app.asar.unpacked')
      })()
    }
    return this.ffmpegPathP
  }

  private loadPipeline(): Promise<AsrPipeline> {
    if (!this.pipelineP) {
      this.pipelineP = (async () => {
        const { env, pipeline } = await import('@huggingface/transformers')
        env.cacheDir = join(userDataDir(), 'models')
        const model = process.env.NEEME_WHISPER_MODEL ?? DEFAULT_WHISPER_MODEL
        return (await pipeline('automatic-speech-recognition', model)) as unknown as AsrPipeline
      })()
    }
    return this.pipelineP
  }

  /** Decode audio → 16kHz mono Float32 PCM via ffmpeg. */
  private async decodePcm(filePath: string, ffmpegBin: string): Promise<Float32Array> {
    return new Promise<Float32Array>((resolve, reject) => {
      const chunks: Buffer[] = []
      const errChunks: Buffer[] = []
      const proc = spawn(
        ffmpegBin,
        ['-i', filePath, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
        { timeout: 120_000 }
      )
      proc.stdout.on('data', (d: Buffer) => chunks.push(d))
      proc.stderr.on('data', (d: Buffer) => errChunks.push(d))
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code !== 0 && code !== null) {
          reject(
            new Error(
              `ffmpeg exited ${code}: ${Buffer.concat(errChunks).toString().slice(-200)}`
            )
          )
          return
        }
        const buf = Buffer.concat(chunks)
        // Copy into a fresh ArrayBuffer — a Node Buffer's .buffer is a shared pool
        // slab with a non-zero byteOffset, which breaks typed-array ops in ONNX.
        const view = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
        resolve(new Float32Array(view))
      })
    })
  }

  async extract(filePath: string): Promise<string> {
    const [ffmpegBin, pipe] = await Promise.all([this.loadFfmpeg(), this.loadPipeline()])
    const pcm = await this.decodePcm(filePath, ffmpegBin)
    // v4 AudioInput = Float32Array directly (not { data, sampling_rate }).
    // The feature extractor reads sampling_rate from the model config (16kHz for Whisper).
    const result = await pipe(pcm, { chunk_length_s: 30, stride_length_s: 5 })
    return result.text.trim()
  }
}

// ── MacSpeechAsr ──────────────────────────────────────────────────────────

export class MacSpeechAsr implements Asr {
  readonly name = 'mac-speech'
  constructor(private readonly helperPath: string) {}

  extract(filePath: string): Promise<string> {
    return spawnHelper(this.helperPath, 'asr', filePath)
  }
}

// ── shared helper ─────────────────────────────────────────────────────────

function spawnHelper(helperPath: string, command: string, filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const out: Buffer[] = []
    const err: Buffer[] = []
    const proc = spawn(helperPath, [command, filePath], { timeout: 120_000 })
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
 * The active ASR impl. On macOS with nimi-extract present, Speech framework is
 * used; otherwise WhisperAsr (portable). `NEEME_EXTRACTOR=portable` forces
 * WhisperAsr. `NEEME_EXTRACTOR=off` is handled at the caller.
 */
export const asr: Asr =
  process.platform === 'darwin' && helper !== null
    ? new MacSpeechAsr(helper)
    : new WhisperAsr()
