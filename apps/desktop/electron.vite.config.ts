import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `@nimi/contract` is an internal workspace package consumed *from .ts source*.
// externalizeDepsPlugin externalizes everything in `dependencies` (so native
// modules like onnxruntime-node aren't bundled) — but the contract MUST be
// bundled, or Node would try to `require()` a .ts file at runtime. Exclude it.
const CONTRACT = '@nimi/contract'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [CONTRACT] })],
    build: {
      rollupOptions: {
        // Two entries: the main process + the data utilityProcess (forked at
        // runtime from out/main/worker.js). index.js stays the app entry.
        input: {
          index: resolve('src/main/index.ts'),
          worker: resolve('src/main/worker/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [CONTRACT] })]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
