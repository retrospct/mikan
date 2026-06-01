/**
 * Live ASR smoke — tests actual Whisper (transformers.js) extraction with a real WAV.
 *
 * The WAV fixture (sample.wav) contains "Hello Nimi smoke test audio transcription"
 * synthesised by macOS `say`. WhisperAsr downloads the Whisper-tiny ONNX model
 * (~75 MB) on first run; ffmpeg-static decodes the WAV to 16 kHz mono PCM for it.
 *
 * macOS SpeechAsr (nimi-extract asr) is intentionally NOT tested here — it runs as
 * a child process of Electron and relies on the parent app's TCC speech-recognition
 * authorization. A bare CLI process crashes without an app bundle. Verify it manually
 * by running the Electron app and capturing a voice memo.
 *
 * Run: NEEME_USER_DATA=/tmp/nimi-smoke-asr pnpm --filter @nimi/desktop exec tsx test/smoke/asr-live.ts
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEEME_USER_DATA ??= '/tmp/nimi-smoke-asr'
process.env.NEEME_EMBEDDER ??= 'hash'
process.env.NEEME_EXTRACTOR = 'portable' // force Whisper, not mac-speech

mkdirSync(join(process.env.NEEME_USER_DATA, 'models'), { recursive: true })
mkdirSync(join(process.env.NEEME_USER_DATA, 'raw'), { recursive: true })

const FIXTURES = join(__dirname, '..', 'fixtures')

async function main(): Promise<void> {
  const { initDb, client } = await import('../../src/main/db/index')
  const { pipelineService } = await import('../../src/main/services/pipeline-service')

  await initDb()
  console.log('[asr-live] DB ready, data dir:', process.env.NEEME_USER_DATA)

  const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'sample.wav')))
  const result = await pipelineService.captureFile(bytes, 'sample.wav', 'audio/wav')
  console.log('[asr-live] captured:', result.created, 'kind:', result.memory.kind)

  if (result.memory.kind !== 'voice') {
    console.error('[asr-live] ✗ FAIL — expected kind=voice, got', result.memory.kind)
    process.exit(1)
  }

  console.log('[asr-live] waiting for Whisper ASR (first run downloads ~75 MB model)...')
  const id = result.memory.id
  const start = Date.now()
  let status = 'pending'
  let text = ''

  while (status === 'pending' && Date.now() - start < 300_000) {
    await new Promise((r) => setTimeout(r, 3000))
    const res = await client.execute({
      sql: 'SELECT status, text FROM items WHERE id = ?',
      args: [id]
    })
    const row = res.rows[0]
    if (row) {
      status = String(row.status)
      text = String(row.text)
    }
    process.stdout.write('.')
  }

  console.log('\n[asr-live] status:', status)
  console.log('[asr-live] text:', JSON.stringify(text.slice(0, 200)))

  if (status !== 'extracted') {
    console.error('[asr-live] ✗ FAIL — status is', status, '(expected extracted)')
    process.exit(1)
  }

  // Whisper may transcribe with slight variation; check for key words
  const lower = text.toLowerCase()
  const hasHello = lower.includes('hello') || lower.includes('nimi')
  if (!hasHello) {
    console.error('[asr-live] ✗ FAIL — no expected words in transcription')
    process.exit(1)
  }
  console.log('[asr-live] ✓ recognized speech words')

  console.log('[asr-live] ✓ PASS — ASR extraction succeeded, status=extracted')
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('[asr-live] threw:', err)
  process.exit(1)
})
