import { app, BrowserWindow, dialog, shell, Menu } from 'electron'
import { join } from 'node:path'
import { createSettingsStore } from '@main/settings'
import { registerDialogHandlers } from '@main/ipc/dialog'
import { registerFileHandlers } from '@main/ipc/files'
import { registerExportHandlers } from '@main/ipc/export'
import { registerImageHandlers } from '@main/ipc/images'
import { buildMenuTemplate } from '@main/menu'
import { IPC } from '@shared/ipc-channels'
import { THEMES } from '@shared/types'
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
// Close-guard state machine
//
// Three variables track whether the window may be closed safely:
//
//   documentDirty  - mirrors the renderer's isDirty flag. Updated on every
//                    setDocumentState message so the close handler always sees
//                    the current state without an extra IPC round-trip.
//
//   forceClose     - set to true when the user picks "Don't Save" in the close
//                    dialog. The close handler sees this flag and lets the next
//                    win.close() call through without re-prompting.
//
//   pendingClose   - set to true when the user picks "Save" in the close dialog.
//                    We send a 'save' command to the renderer and wait. When the
//                    renderer subsequently reports dirty:false via setDocumentState
//                    while pendingClose is true, we set forceClose=true and call
//                    win.close() to complete the close. If the user cancels the
//                    Save As dialog the doc stays dirty; the window stays open and
//                    pendingClose is reset so a subsequent close will re-prompt.
//
// Cmd+Q coverage: Electron fires 'before-quit' then each window's 'close' event
// when the user presses Cmd+Q or chooses File > Quit. Because we no longer bypass
// the close handler on quit, the SAME guard that protects the red-button close
// also protects Cmd+Q - unsaved changes will always prompt the user regardless
// of how the close was initiated.
//
// Test-mode bypass (LEKHA_DISABLE_QUIT_GUARD=1): automated e2e teardown calls
// ElectronApplication.close() which would hang waiting on the native dialog.
// Setting this env flag disables the prompt so test runs exit cleanly. This flag
// must NEVER be set in a real production launch.
// ---------------------------------------------------------------------------

// LEKHA_DISABLE_QUIT_GUARD=1 skips the unsaved-changes prompt entirely.
// Used ONLY by the e2e test harness so teardown does not hang on a native dialog.
const QUIT_GUARD_DISABLED = process.env['LEKHA_DISABLE_QUIT_GUARD'] === '1'

let documentDirty = false
let forceClose = false
let pendingClose = false

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
 *
 * Called on startup and after every addRecentFile IPC call (Open Recent sync)
 * and after the renderer notifies main that the theme changed (so the radio
 * check in the Theme submenu reflects the new active theme).
 *
 * @param recentFiles - Current recent-files list for the Open Recent submenu.
 * @param currentTheme - The currently active theme id for the radio check.
 */
function applyMenu(recentFiles: string[], currentTheme: string = 'github'): void {
  const send = (cmd: AppCommand): void => {
    getWindow()?.webContents.send(IPC.command, cmd)
  }
  const openPath = (p: string): void => {
    getWindow()?.webContents.send(IPC.openPath, p)
  }
  // Forward the chosen theme id to the renderer via the value-carrying
  // IPC.setTheme channel. The renderer applies + persists the theme and the
  // next setSettings call will trigger another applyMenu rebuild so the radio
  // check stays current.
  const setTheme = (id: string): void => {
    getWindow()?.webContents.send(IPC.setTheme, id)
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate(send, recentFiles, openPath, { themes: THEMES, current: currentTheme }, setTheme),
    ),
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
  // file is added (keeping Open Recent in sync) or whenever settings change
  // (keeping the Theme radio check in sync). Also pass onDocumentState so the
  // close-guard state machine stays current.
  registerFileHandlers(
    settings,
    getWindow,
    async () => {
      // Rebuild menu after a recent file is added. Read current theme from
      // settings so the Theme radio stays correct during the rebuild.
      const [recents, allSettings] = await Promise.all([
        settings.getRecentFiles(),
        settings.get(),
      ])
      applyMenu(recents, allSettings.theme)
    },
    (state) => {
      documentDirty = state.dirty
      // If a save triggered by the close guard just completed (pendingClose)
      // and the document is now clean, proceed with closing the window.
      if (pendingClose && !state.dirty) {
        pendingClose = false
        forceClose = true
        getWindow()?.close()
      }
    },
    async (updated) => {
      // Rebuild menu after any settings change. This fires when the renderer
      // calls setSettings({ theme }) so the native Theme menu radio updates
      // to reflect the newly chosen theme without any extra IPC round-trip.
      const recents = await settings.getRecentFiles()
      applyMenu(recents, updated.theme)
    },
  )

  registerExportHandlers(getWindow)

  // Register image-save IPC handler. Passes the user-data path at call time
  // so it always reflects the current Electron data directory.
  registerImageHandlers(() => app.getPath('userData'))

  // Create the window with restored bounds (or defaults if none saved).
  const win = createWindow(initialSettings.windowBounds)

  // Persist window bounds on resize/move (debounced) and on close.
  const saveBounds = (b: NonNullable<Settings['windowBounds']>): void => {
    void settings.set({ windowBounds: b })
  }

  win.on('resize', () => { scheduleBoundsSave(win, saveBounds) })
  win.on('move',   () => { scheduleBoundsSave(win, saveBounds) })

  // On close, do a final synchronous-ish save of bounds before the window
  // goes away, and intercept when there are unsaved changes.
  // We use the 'close' event (before 'closed') so the window is still
  // accessible via getBounds() and we can call e.preventDefault().
  win.on('close', (e) => {
    // Always persist window bounds first (before we might preventDefault).
    if (!win.isMinimized() && !win.isFullScreen()) {
      const b = win.getBounds()
      void settings.set({ windowBounds: { x: b.x, y: b.y, width: b.width, height: b.height } })
    }

    // Allow the close if:
    //   - no unsaved changes, OR
    //   - the user already confirmed "Don't Save" (forceClose), OR
    //   - the test-mode env flag disables the guard (e2e teardown only).
    // Note: Cmd+Q reaches here too (Electron fires 'close' for each window
    // after 'before-quit'), so this guard fires for ALL close paths.
    if (!documentDirty || forceClose || QUIT_GUARD_DISABLED) {
      forceClose = false // reset for any future window re-use
      return
    }

    // Unsaved changes - prompt the user with a synchronous dialog so the
    // event loop does not advance while the dialog is open.
    e.preventDefault()

    const response = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: 'Do you want to save the changes you made?',
      detail: "Your changes will be lost if you don't save them.",
    })

    if (response === 1) {
      // "Don't Save": mark forceClose so the next win.close() goes through.
      forceClose = true
      win.close()
    } else if (response === 0) {
      // "Save": ask the renderer to save, then close when dirty goes false.
      // The onDocumentState callback above handles the follow-through.
      pendingClose = true
      win.webContents.send(IPC.command, 'save')
    }
    // response === 2 ("Cancel"): do nothing - the window stays open.
  })

  // Set up the native application menu with the persisted recent files and theme.
  applyMenu(initialSettings.recentFiles, initialSettings.theme)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
