import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@nimi/contract': resolve(__dirname, '../../packages/contract/src')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts'],
    isolate: true,
    testTimeout: 10_000
  }
})
