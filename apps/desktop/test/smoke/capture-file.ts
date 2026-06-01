/**
 * Headless smoke test for the captureFile pipeline (Tier 1).
 *
 * Drives `pipelineService.captureFile()` directly — no Electron, no display, no
 * network. The data layer is deliberately Electron-free (it resolves storage via
 * NEEME_USER_DATA), so we set a throwaway temp dir + the hash embedder + disable
 * background OCR/ASR for determinism, then assert the full path:
 *   capture → content-hash store → extract (pdf/text) → chunk → embed → index →
 *   search, plus idempotency and the image→pending contract.
 *
 * Run:  pnpm --filter @nimi/desktop test:smoke
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Must be set BEFORE importing the data layer (db/index.ts resolves the DB path
// and embed.ts picks the embedder at module-init).
process.env.NEEME_USER_DATA ??= mkdtempSync(join(tmpdir(), 'nimi-smoke-'))
process.env.NEEME_EMBEDDER ??= 'hash' // deterministic, offline — no model download
process.env.NEEME_EXTRACTOR = 'off' // no background OCR/ASR → image stays `pending`

const FIXTURES = join(__dirname, '..', 'fixtures')
const bytesOf = (name: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, name)))

const results: { label: string; ok: boolean }[] = []
function check(label: string, ok: boolean): void {
  results.push({ label, ok })
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

async function main(): Promise<void> {
  console.log(`[smoke] data dir: ${process.env.NEEME_USER_DATA}`)
  const { client } = await import('../../src/main/db')
  const { initDb } = await import('../../src/main/db')
  const { pipelineService } = await import('../../src/main/services/pipeline-service')

  await initDb()

  const rowOf = async (id: string): Promise<{ status: string; text: string } | null> => {
    const res = await client.execute({
      sql: 'SELECT status, text FROM items WHERE id = ?',
      args: [id]
    })
    const r = res.rows[0]
    return r ? { status: String(r.status), text: String(r.text) } : null
  }
  const chunkCount = async (id: string): Promise<number> => {
    const res = await client.execute({
      sql: 'SELECT count(*) AS n FROM chunks WHERE item_id = ?',
      args: [id]
    })
    return Number(res.rows[0]?.n ?? 0)
  }

  // ── PDF: extracts text, indexes chunks ────────────────────────────────────
  console.log('\nPDF capture')
  const pdf = await pipelineService.captureFile(
    bytesOf('sample.pdf'),
    'sample.pdf',
    'application/pdf'
  )
  check('created === true', pdf.created)
  check("memory.kind === 'pdf'", pdf.memory.kind === 'pdf')
  const pdfRow = await rowOf(pdf.memory.id)
  check("items.status === 'extracted'", pdfRow?.status === 'extracted')
  check('extracted text is non-empty', !!pdfRow && pdfRow.text.trim().length > 0)
  check('chunks indexed (> 0)', (await chunkCount(pdf.memory.id)) > 0)

  // ── PDF idempotency: same bytes → same id, not re-created ──────────────────
  console.log('\nPDF idempotency')
  const pdf2 = await pipelineService.captureFile(
    bytesOf('sample.pdf'),
    'sample.pdf',
    'application/pdf'
  )
  check('created === false on re-capture', pdf2.created === false)
  check('same content id', pdf2.memory.id === pdf.memory.id)

  // ── Text: extracts via TextDecoder ────────────────────────────────────────
  console.log('\nText capture')
  const txt = await pipelineService.captureFile(bytesOf('sample.txt'), 'sample.txt', 'text/plain')
  const txtRow = await rowOf(txt.memory.id)
  check("items.status === 'extracted'", txtRow?.status === 'extracted')
  check('text contains fixture phrase', !!txtRow && txtRow.text.includes('Hello Nimi smoke test'))
  check('chunks indexed (> 0)', (await chunkCount(txt.memory.id)) > 0)

  // ── Image (PNG): stored, parked as pending (no extractor) ────────────────
  console.log('\nImage capture (extractor off → pending)')
  const png = await pipelineService.captureFile(bytesOf('sample.png'), 'sample.png', 'image/png')
  check('created === true', png.created)
  // .png projects to 'screenshot' (project.ts memoryKindOf); jpg/gif → 'image'/'photo'
  check('memory.kind is image-like', ['image', 'photo', 'screenshot'].includes(png.memory.kind))
  const pngRow = await rowOf(png.memory.id)
  check("items.status === 'pending'", pngRow?.status === 'pending')
  check('no chunks indexed (=== 0)', (await chunkCount(png.memory.id)) === 0)

  // ── Image (HEIC): same contract as PNG → pending ───────────────────────
  console.log('\nHEIC capture (extractor off → pending)')
  const heic = await pipelineService.captureFile(
    bytesOf('sample.heic'),
    'sample.heic',
    'image/heic'
  )
  check('heic created === true', heic.created)
  check(
    'heic memory.kind is image-like',
    ['image', 'photo', 'screenshot'].includes(heic.memory.kind)
  )
  const heicRow = await rowOf(heic.memory.id)
  check("heic items.status === 'pending'", heicRow?.status === 'pending')
  check('heic no chunks indexed (=== 0)', (await chunkCount(heic.memory.id)) === 0)

  // ── Audio (WAV): stored, parked as pending (no extractor) ─────────────
  console.log('\nAudio capture (extractor off → pending)')
  const wav = await pipelineService.captureFile(bytesOf('sample.wav'), 'sample.wav', 'audio/wav')
  check('wav created === true', wav.created)
  check("wav memory.kind === 'voice'", wav.memory.kind === 'voice')
  const wavRow = await rowOf(wav.memory.id)
  check("wav items.status === 'pending'", wavRow?.status === 'pending')
  check('wav no chunks indexed (=== 0)', (await chunkCount(wav.memory.id)) === 0)

  // ── Search: the indexed text is retrievable ───────────────────────────────
  console.log('\nSearch over the index')
  const hits = await pipelineService.search('capybara pangolin axolotl', 5)
  check('search returns ≥ 1 hit', hits.length > 0)
  const known = new Set([pdf.memory.id, txt.memory.id])
  check(
    'a hit references a captured fixture',
    hits.some((h) => known.has(h.itemId))
  )

  // ── Summary ───────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok)
  console.log(`\n[smoke] ${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    console.error(`[smoke] FAIL — ${failed.length} check(s) failed:`)
    for (const f of failed) console.error(`  ✗ ${f.label}`)
    process.exit(1)
  }
  console.log('[smoke] PASS')
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error('[smoke] threw:', err)
  process.exit(1)
})
