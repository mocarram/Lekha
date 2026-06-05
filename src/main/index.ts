import { app, BrowserWindow, shell, Menu } from 'electron'
import { join } from 'node:path'
import { createSettingsStore } from '@main/settings'
import { registerDialogHandlers } from '@main/ipc/dialog'
import { registerFileHandlers } from '@main/ipc/files'
import { buildMenuTemplate } from '@main/menu'
import { IPC } from '@shared/ipc-channels'
import type { Settings } from '@shared/types'
import type { AppCommand } from '@shared/commands'

// Last-resort handlers so a stray rejection or throw in the main process is
// logged instead of taking the app down silently.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err)
})

app.setName('Lekha')

// Single reference to the main window - updated every time a new window is created.
let mainWindow: BrowserWindow | null = null

function getWindow(): BrowserWindow | null {
  return mainWindow
}

// ---------------------------------------------------------------------------
// Minimum sane window dimensions to guard against corrupt saved bounds.
// ---------------------------------------------------------------------------
const MIN_WIDTH = 400
const MIN_HEIGHT = 300

/**
 * Validate that saved window bounds are reasonable: finite numbers, minimum
 * size, and x/y are non-negative (on-screen). Returns true if the bounds can
 * be used safely.
 */
function isSaneBounds(b: Settings['windowBounds']): b is NonNullable<Settings['windowBounds']> {
  if (!b) return false
  return (
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height) &&
    b.width >= MIN_WIDTH &&
    b.height >= MIN_HEIGHT &&
    b.x >= 0 &&
    b.y >= 0
  )
}

// ---------------------------------------------------------------------------
// Menu helpers
// ---------------------------------------------------------------------------

/**
 * Rebuild and apply the native application menu.
 * Called on startup and after every addRecentFile IPC call so the Open Recent
 * submenu stays in sync with persisted recents.
 */
function applyMenu(recentFiles: string[]): void {
  const send = (cmd: AppCommand): void => {
    getWindow()?.webContents.send(IPC.command, cmd)
  }
  const openPath = (p: string): void => {
    getWindow()?.webContents.send(IPC.openPath, p)
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(buildMenuTemplate(send, recentFiles, openPath)),
  )
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function createWindow(savedBounds?: Settings['windowBounds']): BrowserWindow {
  const bounds = isSaneBounds(savedBounds)
    ? { x: savedBounds.x, y: savedBounds.y, width: savedBounds.width, height: savedBounds.height }
    : { width: 1100, height: 720 }

  const win = new BrowserWindow({
    ...bounds,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  })

  mainWindow = win

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Open external links in the system browser, not in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ---------------------------------------------------------------------------
// Bounds persistence helpers
// ---------------------------------------------------------------------------

let boundsDebounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Schedule a debounced save of the current window bounds.
 * Only saves when the window is in a "normal" state (not minimized or
 * fullscreen) to avoid storing useless positions.
 */
function scheduleBoundsSave(
  win: BrowserWindow,
  saveFn: (bounds: NonNullable<Settings['windowBounds']>) => void,
): void {
  if (boundsDebounceTimer !== null) clearTimeout(boundsDebounceTimer)
  boundsDebounceTimer = setTimeout(() => {
    boundsDebounceTimer = null
    // Skip saving when the window is not in its normal state.
    if (win.isMinimized() || win.isFullScreen() || win.isDestroyed()) return
    const b = win.getBounds()
    saveFn({ x: b.x, y: b.y, width: b.width, height: b.height })
  }, 300)
}

// ---------------------------------------------------------------------------
// App startup
// ---------------------------------------------------------------------------

void app.whenReady().then(async () => {
  // Settings store backed by the OS user-data directory.
  const settings = createSettingsStore(app.getPath('userData'))

  // Load persisted settings before creating the window so we can restore
  // window bounds and build the initial menu with saved recents.
  const initialSettings = await settings.get()

  // Register IPC handlers before creating the window so they are ready
  // the moment the renderer sends its first message.
  registerDialogHandlers(getWindow)

  // Wrap registerFileHandlers so we can rebuild the menu whenever a recent
  // file is added (keeping Open Recent in sync without a full IPC round-trip).
  registerFileHandlers(settings, getWindow, async () => {
    const recents = await settings.getRecentFiles()
    applyMenu(recents)
  })

  // Create the window with restored bounds (or defaults if none saved).
  const win = createWindow(initialSettings.windowBounds)

  // Persist window bounds on resize/move (debounced) and on close.
  const saveBounds = (b: NonNullable<Settings['windowBounds']>): void => {
    void settings.set({ windowBounds: b })
  }

  win.on('resize', () => { scheduleBoundsSave(win, saveBounds) })
  win.on('move',   () => { scheduleBoundsSave(win, saveBounds) })

  // On close, do a final synchronous-ish save of bounds before the window
  // goes away. We use the 'close' event (before 'closed') so the window is
  // still accessible via getBounds().
  win.on('close', () => {
    if (!win.isMinimized() && !win.isFullScreen()) {
      const b = win.getBounds()
      void settings.set({ windowBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
    }
  })

  // Set up the native application menu with the persisted recent files.
  applyMenu(initialSettings.recentFiles)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
