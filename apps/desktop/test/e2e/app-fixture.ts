import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MAIN = join(__dirname, '..', '..', 'out', 'main', 'index.js')

export async function launchBuiltApp(
  tempPrefix: string
): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), tempPrefix))
  const app = await electron.launch({
    args: [MAIN, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NEEME_EMBEDDER: 'hash', NEEME_EXTRACTOR: 'off' }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
  // BottomNav appears once the app finishes its initial load (phase: 'ready').
  await page.locator('.nav').waitFor({ state: 'visible' })
  return { app, page }
}
