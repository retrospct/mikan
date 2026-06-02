import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { startWorker, call } from './worker/client'
import { initTrayWindow, showWindow, setBadge } from './window/tray-window'
import * as auth from './auth/logto'
import * as googleAuth from './connectors/google-auth'
import {
  isBrokerConfigured,
  restoreCachedToken,
  getSyncToken,
  clearSyncToken
} from './sync/broker'
import { IPC } from '@nimi/contract/ipc'
import type { ConnectorId, ConnectorsState, IngestResult, UpdateStatus } from '@nimi/contract/ipc'

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

  // ── Auth (Logto) — init before the worker so the broker can use the restored
  // session to pre-populate NEEME_SYNC_URL/NEEME_SYNC_AUTH_TOKEN before fork. ──
  //
  // The onChange callback broadcasts to renderers. Windows don't exist yet when
  // auth.init() fires the initial state-change from a restored session, so the
  // BrowserWindow loop is a safe no-op at that point.
  auth.onChange((state, accessToken) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.authChanged, { state, accessToken })
    }
    // When the user logs out, clear the cached broker token so the next login
    // gets a fresh one. Best-effort — never blocks the auth state update.
    if (!state.isAuthenticated) {
      clearSyncToken().catch((err) => console.warn('[broker-client] clear on logout:', err))
    }
  })
  await auth.init()

  // ── Broker token (ADR 0008) — fetch before forking the worker so the libSQL
  // client is built with the right syncUrl + authToken on first boot.
  //
  // Flow:
  //   1. Restore any disk-cached broker token (encrypted in safeStorage).
  //   2. If sync + broker are configured and auth has a valid session, get a
  //      fresh token (from cache or from the broker), then inject into process.env
  //      so the worker's getSyncConfig() picks them up unchanged.
  //   3. If auth has no session yet (first install, or logged out), the worker
  //      starts in local-only mode. The next boot after login will have the token.
  // ──────────────────────────────────────────────────────────────────────────────
  await restoreCachedToken()

  if (isBrokerConfigured() && process.env.NEEME_SYNC === 'on') {
    const logtoToken = await auth.getAccessToken().catch(() => undefined)
    if (logtoToken) {
      try {
        const token = await getSyncToken(logtoToken)
        if (token) {
          process.env.NEEME_SYNC_URL = token.syncUrl
          process.env.NEEME_SYNC_AUTH_TOKEN = token.authToken
          console.log('[broker-client] Sync credentials injected (expires', new Date(token.expiresAt).toISOString(), ')')
        }
      } catch (err) {
        console.warn('[broker-client] Failed to fetch sync token; worker will start in local-only mode:', err)
      }
    } else {
      console.log('[broker-client] No Logto session at boot; worker starts in local-only mode')
    }
  }

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
    IPC.todoContextDismiss,
    // Sync (ROADMAP #10) — forwarded to the worker which owns the DB + sync state.
    IPC.syncGetStatus,
    IPC.syncNow
  ]
  for (const channel of DATA_CHANNELS) {
    ipcMain.handle(channel, (_e, ...args: unknown[]) => call(channel, args))
  }

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

  // Auto-updater (ROADMAP #12) — only active in packaged builds; silently no-ops
  // in dev (app.isPackaged = false). Main owns the lifecycle (quit-and-install);
  // the renderer receives status pushes and can show a "restart to update" affordance.
  if (app.isPackaged) {
    setupAutoUpdater()
  }

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

// --- Auto-updater (ROADMAP #12) ------------------------------------------
// Wires electron-updater (GitHub Releases feed) into the thin-main-router
// pattern. All update state is tracked locally and pushed to the renderer;
// the renderer only ever calls `update:get-status` or `update:quit-and-install`.
// Errors are logged but never crash the app.
function setupAutoUpdater(): void {
  // Dynamic import keeps electron-updater out of the critical startup path and
  // avoids loading it at all in dev (this fn is only called when app.isPackaged).
  import('electron-updater')
    .then(({ autoUpdater }) => {
      let status: UpdateStatus = {
        stage: 'idle',
        version: null,
        progress: null,
        error: null
      }

      function push(next: Partial<UpdateStatus>): void {
        status = { ...status, ...next }
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.updateChanged, status)
        }
      }

      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true

      autoUpdater.on('checking-for-update', () => push({ stage: 'checking', error: null }))
      autoUpdater.on('update-available', (info) =>
        push({ stage: 'available', version: info.version, error: null })
      )
      autoUpdater.on('update-not-available', () => push({ stage: 'idle', error: null }))
      autoUpdater.on('download-progress', (p) =>
        push({ stage: 'downloading', progress: Math.round(p.percent) })
      )
      autoUpdater.on('update-downloaded', (info) =>
        push({ stage: 'ready', version: info.version, progress: null, error: null })
      )
      autoUpdater.on('error', (err) => {
        console.error('[updater]', err)
        push({ stage: 'error', error: err.message, progress: null })
      })

      ipcMain.handle(IPC.updateGetStatus, () => status)
      ipcMain.handle(IPC.updateQuitAndInstall, () => autoUpdater.quitAndInstall())

      // Check on startup; daily re-check keeps long-running instances up-to-date.
      autoUpdater.checkForUpdatesAndNotify().catch((err) =>
        console.error('[updater] initial check failed', err)
      )
      const dailyMs = 24 * 60 * 60 * 1000
      const timer = setInterval(
        () => autoUpdater.checkForUpdatesAndNotify().catch(() => {}),
        dailyMs
      )
      timer.unref()
    })
    .catch((err) => console.error('[updater] failed to load electron-updater', err))
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
