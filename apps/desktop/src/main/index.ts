import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
// import * as os from 'os'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

// const reactDevToolsPath = join(
//   os.homedir(),
//   process.platform === 'darwin'
//     ? '/Library/Application Support/Google/Chrome/Default/Extensions'
//     : '%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions',
//   'fmkadmapgofadopljbjfkapdkoienihi',
//   '6.1.5_0'
// )

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 480, // 402 | 393
    height: 874, // 874 | 852
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    // frame: false, // TODO: determine frameless or not
    // resizable: false, // TODO: decide if I want to allow resizeable
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false // TODO: tbd if needed, can be security issue
      // nodeIntegration: true // TODO: tbd if needed, can be security issue
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
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Load React DevTools Extension
  // if (is.dev) {
  //   try {
  //     await session.defaultSession.loadExtension(reactDevToolsPath)
  //   } catch (error) {
  //     console.error('Error loading React DevTools:', error)
  //   }
  // }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

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
