/**
 * Live OCR smoke — tests tesseract.js extraction with both PNG and HEIC fixtures.
 *
 * - PNG path: tesseract.js reads pixels directly.
 * - HEIC path: heic-convert transcodes HEIC → JPEG in-memory first, then tesseract.
 *
 * Downloads eng traineddata (~20 MB) on first run; cached in NEEME_USER_DATA.
 *
 * macOS VisionOcr (nimi-extract ocr) is verified via direct CLI invocation in CI
 * and does not need an Electron context; the portable tesseract path is what this
 * headless smoke covers.
 *
 * Run: NEEME_USER_DATA=/tmp/mikan-smoke-ocr pnpm --filter @mikan/desktop exec tsx test/smoke/ocr-live.ts
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEEME_USER_DATA ??= '/tmp/mikan-smoke-ocr'
process.env.NEEME_EMBEDDER ??= 'hash'
process.env.NEEME_EXTRACTOR = 'portable' // force tesseract, not mac-vision

mkdirSync(join(process.env.NEEME_USER_DATA, 'models', 'tesseract'), { recursive: true })
mkdirSync(join(process.env.NEEME_USER_DATA, 'raw'), { recursive: true })

const FIXTURES = join(__dirname, '..', 'fixtures')

async function waitForExtracted(
  client: { execute: (q: { sql: string; args: unknown[] }) => Promise<{ rows: unknown[] }> },
  id: string,
  label: string,
  timeoutMs = 120_000
): Promise<{ status: string; text: string }> {
  const start = Date.now()
  let status = 'pending'
  let text = ''
  while (status === 'pending' && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await client.execute({
      sql: 'SELECT status, text FROM items WHERE id = ?',
      args: [id]
    })
    const row = res.rows[0] as Record<string, unknown> | undefined
    if (row) {
      status = String(row.status)
      text = String(row.text)
    }
    process.stdout.write('.')
  }
  console.log(`\n[ocr-live] ${label}: status=${status} text=${JSON.stringify(text.slice(0, 80))}`)
  return { status, text }
}

async function main(): Promise<void> {
  const { initDb, client } = await import('../../src/main/db/index')
  const { pipelineService } = await import('../../src/main/services/pipeline-service')

  await initDb()
  console.log('[ocr-live] DB ready, data dir:', process.env.NEEME_USER_DATA)

  const results: { label: string; ok: boolean }[] = []
  const check = (label: string, ok: boolean): void => {
    results.push({ label, ok })
    console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  }

  // ── PNG via tesseract ────────────────────────────────────────────────────
  console.log('\nPNG OCR (tesseract.js)')
  const pngBytes = new Uint8Array(readFileSync(join(FIXTURES, 'sample.png')))
  const pngResult = await pipelineService.captureFile(pngBytes, 'sample.png', 'image/png')
  console.log('[ocr-live] captured:', pngResult.created, 'kind:', pngResult.memory.kind)
  console.log('[ocr-live] waiting for PNG OCR (downloads ~20MB traineddata on first run)...')
  const pngRow = await waitForExtracted(client, pngResult.memory.id, 'PNG')
  check("png status === 'extracted'", pngRow.status === 'extracted')
  check('png text non-empty', pngRow.text.trim().length > 0)
  check('png text contains "Nimi"', pngRow.text.toLowerCase().includes('nimi'))

  // ── HEIC via heic-convert → tesseract ────────────────────────────────────
  console.log('\nHEIC OCR (heic-convert → tesseract.js)')
  const heicBytes = new Uint8Array(readFileSync(join(FIXTURES, 'sample.heic')))
  const heicResult = await pipelineService.captureFile(heicBytes, 'sample.heic', 'image/heic')
  console.log('[ocr-live] captured:', heicResult.created, 'kind:', heicResult.memory.kind)
  console.log('[ocr-live] waiting for HEIC OCR (traineddata already cached)...')
  const heicRow = await waitForExtracted(client, heicResult.memory.id, 'HEIC')
  check("heic status === 'extracted'", heicRow.status === 'extracted')
  check('heic text non-empty', heicRow.text.trim().length > 0)
  check('heic text contains "Nimi"', heicRow.text.toLowerCase().includes('nimi'))

  // ── Summary ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok)
  console.log(`\n[ocr-live] ${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    console.error('[ocr-live] FAIL:', failed.map((f) => f.label).join(', '))
    process.exit(1)
  }
  console.log('[ocr-live] PASS')
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('[ocr-live] threw:', err)
  process.exit(1)
})
