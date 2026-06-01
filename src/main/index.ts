import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { startWorker, call } from './worker/client'
import * as auth from './auth/logto'
import { IPC } from '../shared/ipc'

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
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    // Neeme's UI is a single, mobile-shaped column centred on a wallpaper, so the
    // window is taller than it is wide. Minimums keep the column and its bottom nav
    // from getting cramped. (A frameless/tray-popout window is a later step.)
    width: 1040,
    height: 820,
    minWidth: 720,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Hardened renderer: sandboxed, context-isolated, no Node. All privileged
      // work is behind the preload contextBridge → main → utilityProcess, so the
      // renderer never needs Node and we keep Electron's default sandbox on.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Navigation + window-open are locked down globally (see web-contents-created).

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

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
    IPC.pipelineArchive,
    IPC.pipelineFeed,
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

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
