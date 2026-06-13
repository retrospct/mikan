import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Plugin } from 'vite'

const { version: APP_VERSION } = JSON.parse(readFileSync('./package.json', 'utf-8')) as {
  version: string
}

// The renderer's index.html ships the strict PRODUCTION CSP. The dev server,
// however, needs relaxations the built app does not:
//   - script-src 'unsafe-inline' 'unsafe-eval' — @vitejs/plugin-react injects an
//     INLINE React Refresh preamble <script>, and Vite's dev client uses eval for
//     HMR module evaluation. Under script-src 'self' the preamble is refused, React
//     never mounts, and the window renders black. Prod bundles real script files
//     (covered by script-src 'self'), so this never ships.
//   - style-src 'unsafe-inline' — Vite injects <style> tags for CSS/HMR in dev
//     (prod links a same-origin stylesheet instead, covered by style-src 'self').
//   - connect-src ws:/http: localhost — Vite HMR websocket + the optional FastAPI
//     round-trip smoke (ApiStatus / @nimi/contract/api), neither of which ships.
// This serve-only plugin rewrites the meta CSP for dev so we never have to loosen
// the policy that actually ships. Keep DEV_CSP in sync with the meta tag + the
// runtime header in src/main/index.ts.
const DEV_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; " +
  "connect-src 'self' ws://localhost:* http://localhost:*"

function devCspPlugin(): Plugin {
  return {
    name: 'nimi-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(
        /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/,
        `$1${DEV_CSP}$2`
      )
    }
  }
}

// `@nimi/contract` is an internal workspace package consumed *from .ts source*.
// externalizeDepsPlugin externalizes everything in `dependencies` (so native
// modules like onnxruntime-node aren't bundled) — but the contract MUST be
// bundled, or Node would try to `require()` a .ts file at runtime. Exclude it.
const CONTRACT = '@nimi/contract'

// The preload runs sandboxed (sandbox:true, a hard security invariant), so it
// CANNOT `require()` npm modules by name at runtime — they must be bundled in.
// `@electron-toolkit/preload` is pure JS; bundle it (like the contract) or the
// built preload throws "module not found" and `window.api` never loads.
const PRELOAD_BUNDLE = [CONTRACT, '@electron-toolkit/preload']

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
    plugins: [externalizeDepsPlugin({ exclude: PRELOAD_BUNDLE })]
  },
  renderer: {
    define: {
      // Baked in at build time so the renderer can display the installed version
      // without an IPC round-trip. CI stamps package.json before building, so
      // this always matches the version shown in the GitHub Release.
      __APP_VERSION__: JSON.stringify(APP_VERSION)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), devCspPlugin()]
  }
})
