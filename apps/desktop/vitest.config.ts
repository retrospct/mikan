import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Vitest config for @mikan/desktop worker/service tests.
 *
 * Runs in plain Node (no Electron). Tests live under test/ and import directly
 * from src/main/ — the hash embedder + NullDrafter + a temp libSQL DB created
 * by test/setup.ts before any module is loaded.
 *
 * @mikan/contract/* is consumed from .ts source via a prefix alias, mirroring
 * tsconfig.node.json paths.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@mikan/contract': resolve(__dirname, '../../packages/contract/src')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    // Each test file gets its own module registry so that env-var singletons
    // (embedder, drafter, db path) are re-evaluated per file.
    isolate: true,
    // Reasonable timeout for integration tests (libSQL file I/O + embedding).
    testTimeout: 15_000
  }
})
