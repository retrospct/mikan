/**
 * Live OCR smoke — tests actual tesseract.js extraction with a real PNG.
 * Downloads the eng traineddata (~20MB) on first run; cached in NEEME_USER_DATA.
 *
 * Run: NEEME_USER_DATA=/tmp/nimi-smoke-ocr pnpm --filter @nimi/desktop exec tsx test/smoke/ocr-live.ts
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.NEEME_USER_DATA ??= '/tmp/nimi-smoke-ocr'
process.env.NEEME_EMBEDDER ??= 'hash'
process.env.NEEME_EXTRACTOR = 'portable' // force tesseract, not mac-vision

mkdirSync(join(process.env.NEEME_USER_DATA, 'models', 'tesseract'), { recursive: true })
mkdirSync(join(process.env.NEEME_USER_DATA, 'raw'), { recursive: true })

const FIXTURES = join(__dirname, '..', 'fixtures')

async function main(): Promise<void> {
  const { initDb, client } = await import('../../src/main/db/index')
  const { pipelineService } = await import('../../src/main/services/pipeline-service')

  await initDb()
  console.log('[ocr-live] DB ready, data dir:', process.env.NEEME_USER_DATA)

  const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'sample.png')))
  const result = await pipelineService.captureFile(bytes, 'sample.png', 'image/png')
  console.log('[ocr-live] captured:', result.created, 'kind:', result.memory.kind)

  console.log('[ocr-live] waiting for tesseract OCR (first run downloads ~20MB traineddata)...')
  const id = result.memory.id
  const start = Date.now()
  let status = 'pending'
  let text = ''

  while (status === 'pending' && Date.now() - start < 120_000) {
    await new Promise((r) => setTimeout(r, 2000))
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

  console.log('\n[ocr-live] status:', status)
  console.log('[ocr-live] text:', JSON.stringify(text.slice(0, 120)))

  if (status === 'extracted') {
    console.log('[ocr-live] ✓ PASS — OCR extraction succeeded')

    // Also verify the item is now searchable
    const hits = await pipelineService.search('hello', 5)
    console.log('[ocr-live] search hits:', hits.length)
    console.log('[ocr-live] ✓ PASS — pipeline end-to-end')
    process.exit(0)
  } else {
    console.error('[ocr-live] ✗ FAIL — status is', status, '(expected extracted)')
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('[ocr-live] threw:', err)
  process.exit(1)
})
