import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    optimizeDeps: {
      include: ['@mikan/ui'] // added to fix the error: "Cannot find module '@mikan/ui' or its corresponding type declarations."
    },
    plugins: [react(), tailwindcss()] // added tailwindcss to fix the error: "Cannot find module '@mikan/tailwind-config' or its corresponding type declarations."
  }
})
