// tray-window.ts — Nimi as a frameless, tray-anchored menu-bar utility.
//
// Owns the single app window + the tray icon + the global toggle hotkey, keeping
// src/main/index.ts a thin router. Behavior:
//   • frameless, mobile-shaped window; hidden/shown via the tray icon or a global
//     hotkey; anchored under the tray icon (top-right) on show.
//   • draggable (renderer marks the header `-webkit-app-region: drag`); release it
//     near the tray anchor and it magnetically snaps/locks into place.
//   • hides on blur — unless Pinned (tray menu checkbox).
//   • closing hides (the app lives in the tray); Quit (tray menu / Cmd-Q) exits.
// Keeps the macOS Dock icon for now (hiding it is a punch-listed preference).
import { app, BrowserWindow, Tray, Menu, globalShortcut, screen, nativeImage } from 'electron'
import type { MenuItem, MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import trayIconAsset from '../../../resources/trayTemplate.png?asset'
import appIcon from '../../../resources/icon.png?asset'

const WIN_W = 440
const WIN_H = 840
const SNAP_PX = 28 // drag-release within this of the anchor → snap/lock
const ANCHOR_GAP = 12 // breathing room between the menu bar and the window top
const HOTKEY = 'CommandOrControl+Shift+N' // configurable later (punch-listed)

let win: BrowserWindow | null = null
let tray: Tray | null = null
let pinned = false
let quitting = false
let lastBlurHide = 0

function loadRenderer(w: BrowserWindow): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    w.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    w.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Where the window should sit when anchored: centered under the tray icon
// (top-right on macOS), clamped to the display's work area. Falls back to the
// top-right corner if the tray bounds aren't available (some Linux setups).
function anchorPosition(): { x: number; y: number } {
  const { width, height } = win!.getBounds()
  const tb = tray?.getBounds()
  const point = tb && tb.width ? { x: tb.x, y: tb.y } : screen.getCursorScreenPoint()
  const { workArea: wa } = screen.getDisplayNearestPoint(point)

  let x: number
  let y: number
  if (tb && tb.width) {
    x = Math.round(tb.x + tb.width / 2 - width / 2)
    y = Math.round(tb.y + tb.height + ANCHOR_GAP)
  } else {
    x = wa.x + wa.width - width - ANCHOR_GAP
    y = wa.y + ANCHOR_GAP
  }
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - width - 8))
  y = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - height - 8))
  return { x, y }
}

// Programmatic setPosition can echo a 'moved' event; suppress the snap logic for a
// tick around our own moves so it doesn't fight itself (a cause of open choppiness).
let suppressMoved = false
function place(x: number, y: number): void {
  suppressMoved = true
  win?.setPosition(x, y, false)
  setTimeout(() => {
    suppressMoved = false
  }, 60)
}

function showAnchored(): void {
  if (!win) return
  const { x, y } = anchorPosition()
  place(x, y)
  win.show()
  win.focus()
}

function setPinned(value: boolean): void {
  pinned = value
  // Pinned = float above other windows (and skip hide-on-blur).
  win?.setAlwaysOnTop(value, 'floating')
}

function toggle(): void {
  if (!win) return
  if (win.isVisible()) win.hide()
  else showAnchored()
}

/** Show + focus the window (Dock-icon click, deep link, second instance). */
export function showWindow(): void {
  showAnchored()
}

/** Drive the tray + Dock badge from the renderer's "waiting" count. */
export function setBadge(count: number): void {
  const c = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0))
  tray?.setTitle(c > 0 ? ` ${c}` : '')
  if (process.platform === 'darwin' && app.dock) app.dock.setBadge(c > 0 ? String(c) : '')
}

export function initTrayWindow(): void {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    roundedCorners: true,
    backgroundColor: '#0a0a0b', // app dark bg — avoids a white flash on first paint
    ...(process.platform === 'linux' ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Same hardened renderer as before: sandboxed, context-isolated, no Node.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // First run: reveal it anchored so it's discoverable (we keep the Dock icon).
  win.once('ready-to-show', () => showAnchored())
  loadRenderer(win)

  // Closing hides; the app stays in the tray until an explicit Quit.
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  // Click away → hide, unless pinned. Stamp the time so a tray click that caused
  // the blur doesn't immediately re-open it (see the tray 'click' guard).
  win.on('blur', () => {
    if (!pinned && win?.isVisible()) {
      win.hide()
      lastBlurHide = Date.now()
    }
  })
  // Magnetic snap: on drag-release near the anchor, lock into the anchored spot.
  // (Live "pull while dragging" easing is punch-listed.)
  win.on('moved', () => {
    if (!win || suppressMoved) return
    const b = win.getBounds()
    const a = anchorPosition()
    if (Math.hypot(b.x - a.x, b.y - a.y) <= SNAP_PX) place(a.x, a.y)
  })

  // Tray icon (monochrome template on macOS so it themes with the menu bar).
  const img = nativeImage.createFromPath(trayIconAsset)
  if (process.platform === 'darwin') img.setTemplateImage(true)
  tray = new Tray(img)
  tray.setToolTip('Nimi')

  const template: MenuItemConstructorOptions[] = [
    { label: 'Show Nimi', click: () => showAnchored() },
    {
      label: 'Pin on top',
      type: 'checkbox',
      checked: pinned,
      click: (mi: MenuItem) => setPinned(mi.checked)
    }
  ]
  // Opt-in: hide the Dock icon (macOS) so Nimi is a pure menu-bar utility. Default
  // off — the Dock stays unless you choose this, and the tray icon + hotkey always
  // summon the window, so it can't get "lost".
  if (process.platform === 'darwin') {
    template.push({
      label: 'Hide Dock icon',
      type: 'checkbox',
      checked: false,
      click: (mi: MenuItem) => (mi.checked ? app.dock?.hide() : app.dock?.show())
    })
  }
  template.push(
    { type: 'separator' },
    {
      label: 'Quit Nimi',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  )
  const menu = Menu.buildFromTemplate(template)
  // Left-click toggles; right-click opens the menu. (setContextMenu would hijack
  // the left click on macOS, so wire them separately.)
  tray.on('click', () => {
    if (Date.now() - lastBlurHide < 250) return // this click is what blurred+hid it
    toggle()
  })
  tray.on('right-click', () => tray?.popUpContextMenu(menu))

  globalShortcut.register(HOTKEY, toggle)

  app.on('before-quit', () => {
    quitting = true
  })
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
