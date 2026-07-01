import { electronApp, optimizer } from '@electron-toolkit/utils'
import { brand } from '@mikan/brand'
import type { ConnectorId, ConnectorsState, IngestResult, UpdateStatus } from '@mikan/contract/ipc'
import { IPC } from '@mikan/contract/ipc'
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { join } from 'path'
import * as auth from './auth/logto'
import * as googleAuth from './connectors/google-auth'
import { installApplicationMenu } from './menu'
import * as secrets from './secrets/store'
import { clearSyncToken, restoreCachedToken } from './sync/broker'
import {
  getRecoveryKey,
  getSyncSettings,
  importRecoveryKey,
  prepareSyncEnv,
  setSyncEnabled
} from './sync/sync-control'
import { initTrayWindow, setBadge, showWindow } from './window/tray-window'
import { call, startWorker } from './worker/client'

// Register the brand's deep-link scheme (e.g. `mikan://`) as the OAuth callback
// scheme. In dev (electron launched with a script arg) we must pass execPath +
// the project dir so the OS routes the deep link back to this instance.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(brand.scheme, process.execPath, [join(__dirname, '../..')])
} else {
  app.setAsDefaultProtocolClient(brand.scheme)
}

// Single-instance lock so Windows/Linux deep links reach the already-running app.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', (_event, argv) => {
  const url = argv.find((a) => a.startsWith(`${brand.scheme}://`))
  if (url) auth.handleCallback(url).catch((e) => console.error('auth callback failed', e))
  showWindow()
})
// macOS delivers the deep link via open-url. Bring the window forward too — the
// user just came back from the system browser and expects the app focused (the
// second-instance path below does the same for Windows/Linux).
app.on('open-url', (event, url) => {
  event.preventDefault()
  auth.handleCallback(url).catch((e) => console.error('auth callback failed', e))
  showWindow()
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

// --- Security: force the sandbox on for every renderer, process-wide ---
// The tray window already sets webPreferences.sandbox:true; this makes it a global
// invariant so a future window can't silently regress it. Must be called before
// the app is ready. See docs/SECURITY.md.
app.enableSandbox()

// Valid connector ids — the runtime allowlist for the connectors IPC handlers, so
// a compromised renderer can't drive googleAuth with an arbitrary provider string.
const CONNECTOR_IDS: readonly ConnectorId[] = ['gmail', 'gcal']
function assertConnectorId(value: unknown): asserts value is ConnectorId {
  if (typeof value !== 'string' || !CONNECTOR_IDS.includes(value as ConnectorId)) {
    throw new Error(`Invalid connector id: ${String(value)}`)
  }
}

// The window is a frameless, tray-anchored menu-bar utility — created + managed in
// ./window/tray-window (frame, position, hotkey, hide-on-blur, badge). Navigation +
// window-open stay locked down globally (see web-contents-created above).

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Load all at-rest secrets from the single sealed vault FIRST, in one Keychain
  // decrypt. Every downstream init (auth, broker, sync key, connectors) then reads
  // its slice from memory — no further Keychain touches at boot. See secrets/store.ts.
  await secrets.loadAll()

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

  // --- Security: permissions — deny by default, allowlist exactly what we use ---
  // The renderer loads only local content. The single browser-grade capability it
  // relies on is clipboard write (the Settings recovery-key "Copy" button, via
  // navigator.clipboard.writeText). Everything else (notifications, camera, mic,
  // geolocation, clipboard-read, …) is denied, so a compromised renderer can't gain
  // them. To enable one later (e.g. 'notifications' when reminders ship) add it to
  // ALLOWED — that's the whole change. See docs/SECURITY.md "Permissions".
  const ALLOWED = new Set<string>(['clipboard-sanitized-write'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(ALLOWED.has(permission))
  )
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission))

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

  // ── Sync env (ADR 0008 + ROADMAP #10) — resolve NEEME_SYNC* from the saved
  // toggle pref + per-device keychain key (and a broker token, if logged in)
  // BEFORE forking the worker, so its libSQL client is built with the right
  // sync target + encryption key on first boot. Restore the disk-cached broker
  // token first so prepareSyncEnv can reuse it. See src/main/sync/sync-control.ts.
  await restoreCachedToken()
  await prepareSyncEnv()

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
    IPC.todoSetMode,
    IPC.todoRun,
    IPC.todoApprove,
    IPC.todoPause,
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

  // Sync settings (main-owned: they manipulate env + restart the worker, so they
  // can't be plain worker-forwarded data channels). The toggle pref + recovery key
  // live in main; getStatus/now stay forwarded to the worker (DATA_CHANNELS above).
  ipcMain.handle(IPC.syncGetSettings, () => getSyncSettings())
  ipcMain.handle(IPC.syncSetEnabled, (_e, enabled: boolean) => setSyncEnabled(enabled))
  ipcMain.handle(IPC.syncGetRecoveryKey, () => getRecoveryKey())
  ipcMain.handle(IPC.syncSetRecoveryKey, (_e, hex: string) => importRecoveryKey(hex))

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
    buildConnectorsState()
      .then(broadcastConnectorsState)
      .catch(() => {})
    return result
  }

  // Restore persisted sessions silently on startup.
  await googleAuth.init()

  // IPC handlers — main-only (not forwarded to worker).
  ipcMain.handle(IPC.connectorsGetState, () => buildConnectorsState())

  ipcMain.handle(IPC.connectorsConnect, async (_e, provider: ConnectorId) => {
    assertConnectorId(provider)
    await googleAuth.connect(provider)
    // Kick off an immediate first sync in the background so the feed populates.
    runSync(provider).catch((err) =>
      console.error(`[connectors] initial sync failed for ${provider}`, err)
    )
    broadcastConnectorsState(googleAuth.getState())
  })

  ipcMain.handle(IPC.connectorsDisconnect, async (_e, provider: ConnectorId) => {
    assertConnectorId(provider)
    await googleAuth.disconnect(provider)
    broadcastConnectorsState(googleAuth.getState())
  })

  ipcMain.handle(IPC.connectorsSyncNow, async (_e, provider: ConnectorId) => {
    assertConnectorId(provider)
    return runSync(provider)
  })

  // Periodic background sync — every NEEME_CONNECTOR_SYNC_MINUTES (default 15).
  const syncMinutes = Math.max(1, parseInt(process.env.NEEME_CONNECTOR_SYNC_MINUTES ?? '15', 10))
  const syncInterval = setInterval(
    () => {
      const providers: ConnectorId[] = ['gmail', 'gcal']
      for (const provider of providers) {
        if (!googleAuth.getState()[provider].connected) continue
        runSync(provider).catch((err) =>
          console.error(`[connectors] background sync failed for ${provider}`, err)
        )
      }
    },
    syncMinutes * 60 * 1000
  )
  // Ensure the interval doesn't keep the process alive after quit.
  syncInterval.unref()

  // UI-only: renderer pushes the "waiting" count → tray + Dock badge.
  ipcMain.handle(IPC.traySetBadge, (_e, count: number) => setBadge(count))

  // Auto-updater (ROADMAP #12) — only active in packaged builds; silently no-ops
  // in dev (app.isPackaged = false). Main owns the lifecycle (quit-and-install);
  // the renderer receives status pushes and can show a "restart to update" affordance.
  if (app.isPackaged) {
    setupAutoUpdater()
  } else {
    // Dev-mode stubs so the renderer's update IPC calls don't throw
    // "No handler registered" errors at startup. Reports `unavailable` (not
    // `idle`) so the Settings row doesn't misleadingly read "Up to date" —
    // dev never actually checks. check-now re-pushes the same status so a
    // click always produces a visible IPC round-trip.
    const devStatus: UpdateStatus = {
      stage: 'unavailable',
      version: null,
      progress: null,
      error: null
    }
    ipcMain.handle(IPC.updateGetStatus, () => devStatus)
    ipcMain.handle(IPC.updateQuitAndInstall, () => {})
    ipcMain.handle(IPC.updateCheckNow, () => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.updateChanged, devStatus)
      }
    })
  }

  // Native app-menu "Check for Updates…" (macOS-standard, like Cursor/Slack).
  // In dev / unpackaged builds the updater never loads, so explain that instead.
  installApplicationMenu(() => {
    if (triggerManualUpdateCheck) {
      triggerManualUpdateCheck()
    } else {
      void dialog.showMessageBox({
        type: 'info',
        message: 'Updates are unavailable in this build',
        detail: 'Automatic updates only run in the packaged, signed app.',
        buttons: ['OK']
      })
    }
  })

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
// Set by setupAutoUpdater once electron-updater has loaded; invoked by the
// native "Check for Updates…" menu item. Null until then (and in dev), so the
// menu handler can fall back to an explanatory dialog.
let triggerManualUpdateCheck: (() => void) | null = null

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

      // Tracks whether the in-flight check was started from the menu, so we can
      // surface a native "you're up to date" / error dialog for that path only
      // (the Settings button already shows status inline in the renderer).
      let manualCheck = false

      function push(next: Partial<UpdateStatus>): void {
        status = { ...status, ...next }
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.updateChanged, status)
        }
      }

      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true

      autoUpdater.on('checking-for-update', () => push({ stage: 'checking', error: null }))
      autoUpdater.on('update-available', (info) => {
        push({ stage: 'available', version: info.version, error: null })
        // checkForUpdatesAndNotify handles the download + native "ready to
        // install" notification from here, so the manual-check dialog is done.
        manualCheck = false
      })
      autoUpdater.on('update-not-available', () => {
        push({ stage: 'idle', error: null })
        if (manualCheck) {
          manualCheck = false
          void dialog.showMessageBox({
            type: 'info',
            message: "You're up to date",
            detail: `mikan ${app.getVersion()} is the latest version.`,
            buttons: ['OK']
          })
        }
      })
      autoUpdater.on('download-progress', (p) =>
        push({ stage: 'downloading', progress: Math.round(p.percent) })
      )
      autoUpdater.on('update-downloaded', (info) =>
        push({ stage: 'ready', version: info.version, progress: null, error: null })
      )
      autoUpdater.on('error', (err) => {
        console.error('[updater]', err)
        push({ stage: 'error', error: err.message, progress: null })
        if (manualCheck) {
          manualCheck = false
          void dialog.showMessageBox({
            type: 'error',
            message: 'Update check failed',
            detail: err.message,
            buttons: ['OK']
          })
        }
      })

      ipcMain.handle(IPC.updateGetStatus, () => status)
      ipcMain.handle(IPC.updateQuitAndInstall, () => autoUpdater.quitAndInstall())
      ipcMain.handle(IPC.updateCheckNow, () =>
        autoUpdater
          .checkForUpdatesAndNotify()
          .catch((err) => console.error('[updater] manual check failed', err))
      )

      // Native "Check for Updates…" menu item → reveal the window (so inline
      // status is visible) and run a check that also reports its result via a
      // native dialog.
      triggerManualUpdateCheck = () => {
        manualCheck = true
        showWindow()
        autoUpdater
          .checkForUpdatesAndNotify()
          .catch((err) => console.error('[updater] menu check failed', err))
      }

      // Check on startup; daily re-check keeps long-running instances up-to-date.
      autoUpdater
        .checkForUpdatesAndNotify()
        .catch((err) => console.error('[updater] initial check failed', err))
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
