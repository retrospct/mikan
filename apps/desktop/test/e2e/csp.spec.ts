/**
 * Playwright Electron E2E: Content-Security-Policy + local-font smoke (#11).
 *
 * Codifies the manual "run `pnpm dev`, open DevTools, look for CSP violations"
 * runbook into a deterministic pass/fail check. Launches the BUILT renderer and
 * asserts:
 *   - the renderer boots with ZERO CSP violations ("Refused to …" console errors
 *     / securitypolicyviolation events) and no uncaught page errors,
 *   - the bundled UI fonts (Hanken Grotesk + JetBrains Mono via @fontsource) are
 *     actually loaded — i.e. font bundling works offline,
 *   - the renderer makes NO request to Google Fonts (fonts.googleapis.com /
 *     fonts.gstatic.com),
 *   - the shipped <meta> CSP is the strict production policy (no 'unsafe-inline',
 *     no remote origins).
 *
 * NOTE on coverage: the E2E launches the built-but-NOT-packaged app, so
 * `app.isPackaged` is false. That means this exercises the strict PRODUCTION
 * <meta> CSP (the dev relaxation only applies in electron-vite `serve`, not
 * `build`), but NOT the defense-in-depth response header in src/main/index.ts,
 * which is gated on `app.isPackaged`. The header path needs a packaged-artifact
 * tier (Tier 3) to exercise.
 *
 * Prereq:  pnpm --filter @nimi/desktop build   (produces out/main/index.js)
 * Run:     pnpm --filter @nimi/desktop test:e2e
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type ConsoleMessage
} from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAIN = join(__dirname, '..', '..', 'out', 'main', 'index.js')

/** Matches the CSP violation text Chromium logs to the console. */
const CSP_VIOLATION = /Refused to|violates the following Content Security Policy/i

const STRICT_PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; " +
  "font-src 'self' data:; img-src 'self' data:; connect-src 'self'"

let app: ElectronApplication
let page: Page

/** Console errors + page errors that look like CSP violations, collected from
 *  the moment listeners attach through the reload below. */
const cspViolations: string[] = []

test.beforeAll(async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'nimi-csp-e2e-'))
  app = await electron.launch({
    args: [MAIN, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NEEME_EMBEDDER: 'hash', NEEME_EXTRACTOR: 'off' }
  })
  page = await app.firstWindow()

  // Attach listeners, THEN reload so any load-time CSP violation is captured
  // under the listener (the first load already happened before firstWindow()).
  page.on('console', (msg: ConsoleMessage) => {
    if (CSP_VIOLATION.test(msg.text())) cspViolations.push(`console:${msg.text()}`)
  })
  page.on('pageerror', (err: Error) => {
    if (CSP_VIOLATION.test(err.message)) cspViolations.push(`pageerror:${err.message}`)
  })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
  await page.locator('.nav').waitFor({ state: 'visible' })
})

test.afterAll(async () => {
  await app?.close()
})

test('renderer boots with ZERO CSP violations', async () => {
  // Give late async resources (fonts, chunks) a beat to either load or be refused.
  await page.waitForTimeout(1500)
  expect(cspViolations, `unexpected CSP violations:\n${cspViolations.join('\n')}`).toEqual([])
})

test('bundled fonts load locally (offline-first)', async () => {
  const fonts = await page.evaluate(async () => {
    await (document.fonts.ready ?? Promise.resolve())
    return {
      hanken: document.fonts.check('16px "Hanken Grotesk"'),
      mono: document.fonts.check('16px "JetBrains Mono"')
    }
  })
  expect(fonts.hanken, 'Hanken Grotesk should be loaded from @fontsource').toBe(true)
  expect(fonts.mono, 'JetBrains Mono should be loaded from @fontsource').toBe(true)
})

test('no Google Fonts network requests', async () => {
  const googleFontReqs = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .filter((n) => n.includes('fonts.googleapis.com') || n.includes('fonts.gstatic.com'))
  )
  expect(googleFontReqs, 'renderer must not fetch from Google Fonts').toEqual([])
})

test('shipped <meta> CSP is the strict production policy', async () => {
  const metaCsp = await page.evaluate(() => {
    const el = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    return el?.getAttribute('content') ?? null
  })
  expect(metaCsp).toBe(STRICT_PROD_CSP)
})
