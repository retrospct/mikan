import { app, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

// Installs the native application menu. The whole reason this exists (Electron
// would otherwise supply a perfectly good default menu) is the macOS-standard
// "Check for Updates…" item in the app menu — the same affordance Cursor, Slack,
// etc. expose right under "About". The click is delegated so the main process
// owns the actual electron-updater call + user feedback.
export function installApplicationMenu(onCheckForUpdates: () => void): void {
  const isMac = process.platform === 'darwin'

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => onCheckForUpdates()
  }

  // On macOS the first submenu is always rendered as the app menu and labelled
  // with the bundle/product name, regardless of the label given here.
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      checkForUpdatesItem,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const template: MenuItemConstructorOptions[] = isMac
    ? [appMenu, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]
    : [
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
        { role: 'help', submenu: [checkForUpdatesItem] }
      ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
