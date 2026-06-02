import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { startWorker, call } from './worker/client'
import { initTrayWindow, showWindow, setBadge } from './window/tray-window'
import * as auth from './auth/logto'
import * as googleAuth from './connectors/google-auth'
import { IPC } from '@nimi/contract/ipc'
import type { ConnectorId, ConnectorsState, IngestResult } from '@nimi/contract/ipc'

// Register `neeme://` as the OAuth callback scheme. In dev (electron launched
// with a script arg) we must pass execPath + the project dir so the OS routes
// the deep link back to this instance.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('neeme', process.execPath, [join(__dirname, '../..')])
} else {
  app.setAsDefaultProtocolClient('neeme')
}

// Single-instance lock so Windows/Linux deep links reach the already-running app.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', (_event, argv) => {
  const url = argv.find((a) => a.startsWith('neeme://'))
  if (url) auth.handleCallback(url).catch((e) => console.error('auth callback failed', e))
  showWindow()
})
// macOS delivers the deep link via open-url.
app.on('open-url', (event, url) => {
  event.preventDefault()
  auth.handleCallback(url).catch((e) => console.error('auth callback failed', e))
})

// --- Security: lock down navigation + window creation (Electron checklist) ---
// Only https/mailto links escape to the system browser; the renderer may never
// open its own windows or navigate away from the app's own content.
function isSafeExternal(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}
function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return (!!devUrl && url.startsWith(devUrl)) || url.startsWith('file://')
}
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
})

// The window is a frameless, tray-anchored menu-bar utility — created + managed in
// ./window/tray-window (frame, position, hotkey, hide-on-blur, badge). Navigation +
// window-open stay locked down globally (see web-contents-created above).

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // --- Security: Content-Security-Policy as a response header (defense-in-depth) ---
  // The renderer's index.html carries the same policy in a <meta> tag, but a
  // compromised renderer bundle could strip that tag; a response header set here
  // cannot be removed from inside the renderer. Enforce only for the packaged app:
  // in dev, electron-vite serves a deliberately relaxed meta (Vite injects <style>
  // for HMR + the optional FastAPI smoke origin), and a strict header would
  // intersect with it and blank-screen the dev renderer. Keep this in sync with
  // the meta tag (renderer/index.html) + DEV_CSP (electron.vite.config.ts).
  if (app.isPackaged) {
    const CSP =
      "default-src 'self'; script-src 'self'; style-src 'self'; " +
      "font-src 'self' data:; img-src 'self' data:; connect-src 'self'"
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP]
        }
      })
    })
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Data layer runs in a utilityProcess (off the main loop). Main is a thin
  // router: every data channel is forwarded to the worker, which owns the DB +
  // services. Start it (it inits the schema) before handlers can be called.
  await startWorker()
  const DATA_CHANNELS: string[] = [
    IPC.pipelineCaptureText,
    IPC.pipelineCaptureFile,
    IPC.pipelineArchive,
    IPC.pipelineFeed,
    IPC.pipelineUncoverTodos,
    IPC.pipelineSearch,
    IPC.todoAdd,
    IPC.todoToday,
    IPC.todoBacklog,
    IPC.todoDone,
    IPC.todoComplete,
    IPC.todoReopen,
    IPC.todoPlan,
    IPC.todoSchedule,
    IPC.todoContextSearch,
    IPC.todoContextPin,
    IPC.todoContextDismiss
  ]
  for (const channel of DATA_CHANNELS) {
    ipcMain.handle(channel, (_e, ...args: unknown[]) => call(channel, args))
  }

  // Auth (Logto) — broadcast changes to renderers, restore any saved session,
  // then expose login/logout/token over IPC. Inert until Logto env is configured.
  auth.onChange((state, accessToken) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.authChanged, { state, accessToken })
    }
  })
  await auth.init()
  ipcMain.handle(IPC.authLogin, () => auth.startLogin())
  ipcMain.handle(IPC.authLogout, () => auth.logout())
  ipcMain.handle(IPC.authGetToken, () => auth.getAccessToken())
  ipcMain.handle(IPC.authGetState, () => auth.getState())

  // Connectors (Google OAuth + periodic ingest) — main-only, like auth.
  // Inert until MAIN_VITE_GOOGLE_CLIENT_ID is set.
  function broadcastConnectorsState(state: ConnectorsState): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.connectorsChanged, state)
    }
  }

  /**
   * Build the full ConnectorsState by merging googleAuth's in-memory OAuth
   * connection status with the DB-persisted item counts + last-sync timestamps
   * (fetched from the worker via connectorsGetStats).
   */
  async function buildConnectorsState(): Promise<ConnectorsState> {
    const base = googleAuth.getState()
    try {
      const stats = await call<{
        gmail: { itemCount: number; lastSyncAt: string | null }
        gcal: { itemCount: number; lastSyncAt: string | null }
      }>(IPC.connectorsGetStats, [])
      base.gmail.itemCount = stats.gmail.itemCount
      base.gmail.lastSyncAt = stats.gmail.lastSyncAt
      base.gcal.itemCount = stats.gcal.itemCount
      base.gcal.lastSyncAt = stats.gcal.lastSyncAt
    } catch {
      // DB stats unavailable — connected/configured status is still correct
    }
    return base as ConnectorsState
  }

  /**
   * Run a sync for one provider: get a fresh token, call the worker, broadcast
   * the updated state. Returns the IngestResult for syncNow IPC.
   */
  async function runSync(provider: ConnectorId): Promise<IngestResult> {
    const accessToken = await googleAuth.getAccessToken(provider)
    if (!accessToken) throw new Error(`${provider} is not connected`)
    const result = await call<IngestResult>(IPC.connectorsIngest, [provider, accessToken])
    // Broadcast updated state after sync (best-effort).
    buildConnectorsState().then(broadcastConnectorsState).catch(() => {})
    return result
  }

  // Restore persisted sessions silently on startup.
  await googleAuth.init()

  // IPC handlers — main-only (not forwarded to worker).
  ipcMain.handle(IPC.connectorsGetState, () => buildConnectorsState())

  ipcMain.handle(IPC.connectorsConnect, async (_e, provider: ConnectorId) => {
    await googleAuth.connect(provider)
    // Kick off an immediate first sync in the background so the feed populates.
    runSync(provider).catch((err) => console.error(`[connectors] initial sync failed for ${provider}`, err))
    broadcastConnectorsState(googleAuth.getState())
  })

  ipcMain.handle(IPC.connectorsDisconnect, async (_e, provider: ConnectorId) => {
    await googleAuth.disconnect(provider)
    broadcastConnectorsState(googleAuth.getState())
  })

  ipcMain.handle(IPC.connectorsSyncNow, async (_e, provider: ConnectorId) => {
    return runSync(provider)
  })

  // Periodic background sync — every NEEME_CONNECTOR_SYNC_MINUTES (default 15).
  const syncMinutes = Math.max(1, parseInt(process.env.NEEME_CONNECTOR_SYNC_MINUTES ?? '15', 10))
  const syncInterval = setInterval(() => {
    const providers: ConnectorId[] = ['gmail', 'gcal']
    for (const provider of providers) {
      if (!googleAuth.getState()[provider].connected) continue
      runSync(provider).catch((err) =>
        console.error(`[connectors] background sync failed for ${provider}`, err)
      )
    }
  }, syncMinutes * 60 * 1000)
  // Ensure the interval doesn't keep the process alive after quit.
  syncInterval.unref()

  // UI-only: renderer pushes the "waiting" count → tray + Dock badge.
  ipcMain.handle(IPC.traySetBadge, (_e, count: number) => setBadge(count))

  initTrayWindow()

  app.on('activate', function () {
    // macOS Dock-icon click → reveal the tray window.
    showWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
