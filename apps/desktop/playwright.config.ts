import { defineConfig } from '@playwright/test'

// Electron E2E only — one app instance at a time, no browser projects.
// Launches the BUILT app (out/main/index.js), so run `pnpm --filter @nimi/desktop build` first.
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']]
})
