/**
 * Playwright Electron E2E for captureFile (Tier 2).
 *
 * Drives the REAL renderer → preload → IPC → worker → libSQL path against the
 * built app: the file picker (hidden <input>) and a synthetic drag-drop. Ground
 * truth is read back through the app's own connection via
 * `window.api.pipeline.archive()` — which queries the persisted `items` table in
 * the worker (not optimistic UI state), and is the one connection guaranteed to
 * see the worker's writes (a separate SQLite reader hits WAL-visibility races).
 *
 * Prereq:  pnpm --filter @mikan/desktop build   (produces out/main/index.js)
 * Run:     pnpm --filter @mikan/desktop test:e2e
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'
import { launchBuiltApp } from './app-fixture'

const FIXTURES = join(__dirname, '..', 'fixtures')

let app: ElectronApplication
let page: Page
let cleanupUserDataDir = (): void => {}

/** Source names currently in the archive (the persisted `items` table). */
async function archiveSrcs(): Promise<string[]> {
  return page.evaluate(async () => {
    const api = (
      window as unknown as { api: { pipeline: { archive: () => Promise<{ src: string }[]> } } }
    ).api
    return (await api.pipeline.archive()).map((m) => m.src)
  })
}

/** Poll the archive until a row with `src` appears. */
async function waitForArchiveSrc(src: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let seen: string[] = []
  while (Date.now() < deadline) {
    seen = await archiveSrcs()
    if (seen.includes(src)) return
    await page.waitForTimeout(250)
  }
  throw new Error(`timed out waiting for archive to contain ${src}; saw ${JSON.stringify(seen)}`)
}

const countSrc = async (src: string): Promise<number> =>
  (await archiveSrcs()).filter((s) => s === src).length

/** Bring the window forward and land on the Feed tab with a FRESH FeedView mount.
 *  Bouncing through Today remounts FeedView, resetting its `busy` debounce ref so
 *  back-to-back tests (faster than the 900ms reset) don't early-return a capture. */
async function gotoFeed(): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
  await page.locator('.nav-btn', { hasText: 'Today' }).click()
  await page.locator('.nav-btn', { hasText: 'Feed' }).click()
  await page.locator('.maw').waitFor({ state: 'visible' })
}

test.beforeAll(async () => {
  const launched = await launchBuiltApp('mikan-e2e-')
  app = launched.app
  page = launched.page
  cleanupUserDataDir = launched.cleanupUserDataDir
})

test.afterAll(async () => {
  try {
    await app?.close()
  } finally {
    cleanupUserDataDir()
  }
})

test('picker: choosing a PDF captures + extracts it (renderer → IPC → worker → DB)', async () => {
  await gotoFeed()
  const input = page.locator('.view.feed input[type="file"]').first()
  await input.setInputFiles(join(FIXTURES, 'sample.pdf'))

  // Ground truth: the row persisted in the archive…
  await waitForArchiveSrc('sample.pdf')
  // …and the UI surfaces the extracted PDF text (a PDF's feed title is its text).
  await expect(page.locator('.fed-list')).toContainText('Hello smoke test')
})

test('drag-drop: dropping a file on the maw captures it', async () => {
  await gotoFeed()
  const content = 'Dropped via drag and drop — wombat quokka numbat tokens.'
  const b64 = Buffer.from(content, 'utf-8').toString('base64')

  const dropped = await page.evaluate(
    async ([data, name, type]) => {
      const bin = atob(data)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      const file = new File([arr], name, { type })
      const dt = new DataTransfer()
      dt.items.add(file)
      const maw = document.querySelector('.maw')
      if (!maw) return false
      maw.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
      )
      maw.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
      )
      return true
    },
    [b64, 'dropped-note.txt', 'text/plain']
  )
  expect(dropped).toBe(true)

  await waitForArchiveSrc('dropped-note.txt')
})

test('idempotency: re-picking the same PDF makes no duplicate', async () => {
  await gotoFeed()
  const before = await countSrc('sample.pdf')
  expect(before).toBeGreaterThan(0) // captured by the picker test earlier
  const input = page.locator('.view.feed input[type="file"]').first()
  await input.setInputFiles(join(FIXTURES, 'sample.pdf'))
  await page.waitForTimeout(1500) // let the capture round-trip
  expect(await countSrc('sample.pdf')).toBe(before)
})
