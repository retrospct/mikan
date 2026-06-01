/**
 * Global vitest setup — runs before each test file's own imports are evaluated.
 *
 * Sets the three env-var singletons that src/main modules read at load time:
 *   NEEME_USER_DATA  → a per-test-file temp dir (unique, writable, cleaned up)
 *   NEEME_EMBEDDER   → 'hash'  forces HashEmbedder (no ONNX / model download)
 *   NEEME_DRAFTER    → 'off'   forces NullDrafter  (no network / API key)
 *
 * Because this setupFile runs before the test file's static imports are resolved,
 * all libSQL clients and embedder/drafter singletons will pick up these values.
 *
 * Per-file isolation (vitest default, isolate:true) means each test file gets
 * its own fresh module registry + its own temp dir → its own DB file.
 */
import { afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmpDir = mkdtempSync(join(tmpdir(), 'nimi-test-'))
process.env.NEEME_USER_DATA = tmpDir
process.env.NEEME_EMBEDDER = 'hash'
process.env.NEEME_DRAFTER = 'off'

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})
