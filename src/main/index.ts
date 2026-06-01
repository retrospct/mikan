import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb } from './db'
import { memoryService } from './services/memory-service'
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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

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

  // Local-first data layer — ensure the schema exists before handlers can query.
  await initDb()
  ipcMain.handle(IPC.memoryList, () => memoryService.list())
  ipcMain.handle(IPC.memoryAdd, (_event, content: string) => memoryService.add(content))

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
