import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { createSettingsStore } from '@main/settings'
import { registerDialogHandlers } from '@main/ipc/dialog'
import { registerFileHandlers } from '@main/ipc/files'
import { registerExportHandlers } from '@main/ipc/export'
import { registerImageHandlers } from '@main/ipc/images'
import { registerShellHandlers } from '@main/ipc/shell'
import { buildMenuTemplate } from '@main/menu'
import {
  WindowRegistry,
  createWindow,
  runCloseGuard,
  nextWindowBounds,
  isSaneBounds,
  DEFAULT_WINDOW_SIZE,
  type WindowBounds,
  type OpenBounds,
} from '@main/window'
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

// ---------------------------------------------------------------------------
// Multi-window model
//
// Lekha opens N independent windows, each running its own single-document
// renderer instance. The WindowRegistry tracks every live window and its
// WindowController (per-window dirty flag + close-guard state machine). All
// window-scoped logic lives in @main/window; index.ts wires it to the app
// lifecycle, the menu, and bounds persistence.
//
// LEKHA_DISABLE_QUIT_GUARD=1 skips the unsaved-changes prompt entirely. Used
// ONLY by the e2e test harness so teardown does not hang on a native dialog.
// This flag must NEVER be set in a real production launch.
// ---------------------------------------------------------------------------

const QUIT_GUARD_DISABLED = process.env['LEKHA_DISABLE_QUIT_GUARD'] === '1'

const registry = new WindowRegistry()

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
 * Command/openPath/setTheme route to the FOCUSED window so menu accelerators
 * act on whichever window the user is currently working in. "New Window" opens
 * a fresh window directly in main (no renderer round-trip), so it works even
 * when no window is focused.
 *
 * @param recentFiles - Current recent-files list for the Open Recent submenu.
 * @param currentTheme - The currently active theme id for the radio check.
 */
function applyMenu(recentFiles: string[], currentTheme: string = 'github'): void {
  const send = (cmd: AppCommand): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.command, cmd)
  }
  const openPath = (p: string): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.openPath, p)
  }
  // Forward the chosen theme id to the focused renderer via the value-carrying
  // IPC.setTheme channel. The renderer applies + persists the theme and the
  // next setSettings call triggers another applyMenu rebuild so the radio check
  // stays current.
  const setTheme = (id: string): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.setTheme, id)
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate(
        send,
        recentFiles,
        openPath,
        { themes: THEMES, current: currentTheme },
        setTheme,
        openNewWindow,
      ),
    ),
  )
}

// ---------------------------------------------------------------------------
// Bounds persistence
//
// Kept simple: settings hold a single windowBounds entry. The last window to
// move/resize/close updates it; new windows restore from it (additional windows
// cascade-offset so they don't stack exactly on top of each other).
// ---------------------------------------------------------------------------

let settingsStore: ReturnType<typeof createSettingsStore> | null = null

function saveBounds(bounds: WindowBounds): void {
  void settingsStore?.set({ windowBounds: bounds })
}

let boundsDebounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Schedule a debounced save of a window's bounds. Only saves when the window is
 * in a "normal" state (not minimized/fullscreen/destroyed) to avoid storing
 * useless positions.
 */
function scheduleBoundsSave(win: BrowserWindow): void {
  if (boundsDebounceTimer !== null) clearTimeout(boundsDebounceTimer)
  boundsDebounceTimer = setTimeout(() => {
    boundsDebounceTimer = null
    if (win.isMinimized() || win.isFullScreen() || win.isDestroyed()) return
    const b = win.getBounds()
    saveBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
  }, 300)
}

// ---------------------------------------------------------------------------
// Window opening
// ---------------------------------------------------------------------------

/**
 * Open a window at the given bounds and wire up its per-window behaviour:
 * bounds persistence and the close-guard. The controller already lives in the
 * registry (created inside createWindow).
 */
function openWindowAt(bounds: OpenBounds): BrowserWindow {
  const controller = createWindow(registry, bounds)
  const win = controller.win

  win.on('resize', () => { scheduleBoundsSave(win) })
  win.on('move', () => { scheduleBoundsSave(win) })

  // Per-window close guard. Persist bounds first (before any preventDefault),
  // then run the unsaved-changes guard for THIS window only.
  win.on('close', (e) => {
    if (!win.isMinimized() && !win.isFullScreen() && !win.isDestroyed()) {
      const b = win.getBounds()
      saveBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
    }
    runCloseGuard(controller, e, QUIT_GUARD_DISABLED)
  })

  return win
}

/** Saved bounds for restoring the FIRST window, or undefined when none/invalid. */
let savedWindowBounds: WindowBounds | undefined

/**
 * Open an ADDITIONAL window, cascaded down-right from the currently focused
 * window (or from the saved bounds when none is focused). Invoked by the "New
 * Window" menu item and the 'newWindow' IPC from the renderer.
 */
function openNewWindow(): void {
  const focused = BrowserWindow.getFocusedWindow()
  const base: Settings['windowBounds'] = focused ? focused.getBounds() : savedWindowBounds
  openWindowAt(nextWindowBounds(base))
}

// ---------------------------------------------------------------------------
// App startup
// ---------------------------------------------------------------------------

void app.whenReady().then(async () => {
  // Settings store backed by the OS user-data directory.
  const settings = createSettingsStore(app.getPath('userData'))
  settingsStore = settings

  // Load persisted settings before creating the window so we can restore
  // window bounds and build the initial menu with saved recents.
  const initialSettings = await settings.get()

  // Register IPC handlers before creating any window so they are ready the
  // moment a renderer sends its first message. Handlers derive their target
  // window from the IPC event sender (multi-window safe) rather than a shared
  // getWindow closure.
  registerDialogHandlers()

  // Rebuild the menu when recents or settings (theme) change. setDocumentState
  // updates the sender window's WindowController dirty flag inside the handler.
  registerFileHandlers(
    settings,
    registry,
    async () => {
      // Rebuild menu after a recent file is added (Open Recent sync).
      const [recents, allSettings] = await Promise.all([
        settings.getRecentFiles(),
        settings.get(),
      ])
      applyMenu(recents, allSettings.theme)
    },
    async (updated) => {
      // Rebuild menu after any settings change so the native Theme radio
      // reflects the newly chosen theme without an extra IPC round-trip.
      const recents = await settings.getRecentFiles()
      applyMenu(recents, updated.theme)
    },
  )

  registerExportHandlers()

  // Register image-save IPC handler. Passes the user-data path at call time so
  // it always reflects the current Electron data directory.
  registerImageHandlers(() => app.getPath('userData'))

  // Register the openExternal IPC handler (scheme-validated link opening).
  registerShellHandlers()

  // Renderer-routed New Window: the 'newWindow' AppCommand calls
  // window.lekha.newWindow() which sends this IPC. (The native menu item opens
  // windows directly via openNewWindow without this round-trip.)
  ipcMain.on(IPC.newWindow, () => { openNewWindow() })

  // Remember valid saved bounds for restoring/cascading future windows.
  savedWindowBounds = isSaneBounds(initialSettings.windowBounds)
    ? initialSettings.windowBounds
    : undefined

  // First window: honor saved bounds exactly (no cascade). When none are saved,
  // open at the default size with x/y omitted so Electron centers it on screen.
  openWindowAt(savedWindowBounds ?? { ...DEFAULT_WINDOW_SIZE })

  // Set up the native application menu with the persisted recent files and theme.
  applyMenu(initialSettings.recentFiles, initialSettings.theme)

  app.on('activate', () => {
    // macOS: re-open a window when the dock icon is clicked and none are open.
    if (registry.size === 0) {
      openWindowAt(savedWindowBounds ?? { ...DEFAULT_WINDOW_SIZE })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
