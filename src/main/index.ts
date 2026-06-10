import { app, BrowserWindow, Menu, ShareMenu, session, screen, dialog } from 'electron'
import { guardedIpc } from '@main/ipcGuard'
import { createSettingsStore } from '@main/settings'
import { registerDialogHandlers } from '@main/ipc/dialog'
import { registerFileHandlers } from '@main/ipc/files'
import { registerExportHandlers } from '@main/ipc/export'
import { registerImageHandlers } from '@main/ipc/images'
import { registerShellHandlers } from '@main/ipc/shell'
import { registerSearchHandlers } from '@main/ipc/search'
import { registerReplaceHandlers } from '@main/ipc/replace'
import { registerTemplateHandlers } from '@main/ipc/templates'
import { registerThemeHandlers } from '@main/ipc/themes'
import { DEFAULT_TEMPLATE_CSS } from '@main/themeTemplate'
import { listUserThemes } from '@main/userThemes'
import { markdownPathsFromArgv } from '@main/openWith'
import { allowFile, isPathAllowed } from '@main/pathPolicy'
import { join, resolve } from 'node:path'
import { statSync } from 'node:fs'
import { buildMenuTemplate } from '@main/menu'
import { setupAutoUpdater, checkForUpdates } from '@main/updater'
import { applySpellCheck } from '@main/spellCheck'
import { buildContextMenuTemplate } from '@main/contextMenu'
import type { ContextMenuParams as LocalContextMenuParams } from '@main/contextMenu'
import type { ContextMenuParams as ElectronContextMenuParams } from 'electron'
import {
  WindowRegistry,
  createWindow,
  runCloseGuard,
  nextWindowBounds,
  isSaneBounds,
  boundsIntersectAny,
  defaultWindowBounds,
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
// OS file-open ("Open With" / double-click / command line)
//
// macOS delivers opened files via the `open-file` event, which can fire BEFORE
// `app.whenReady()`; Windows/Linux pass them as command-line arguments (on cold
// launch via process.argv, on a second launch via the `second-instance` event).
// Both routes funnel into `pendingLaunchPaths` until a window exists. The first
// renderer drains the queue on mount (IPC.takePendingOpen); once `appReady` is
// set, later requests are pushed straight to a live window via IPC.openPath -
// the same channel the Open Recent menu already uses.
// ---------------------------------------------------------------------------

/**
 * Files the OS asked Lekha to open before a window was ready to receive them.
 * Drained by the renderer via IPC.takePendingOpen on mount; the splice clears it
 * so a second window cannot re-open the same files.
 */
const pendingLaunchPaths: string[] = []

/** True once the first window is open: gates push-to-window vs. queue routing. */
let appReady = false

/** True if `p` is an existing regular file (not a directory / missing). */
function isExistingFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * Route an opened file into a running app. With a live window, push the path to
 * the focused (or first) window so it opens as a tab; with none, queue it and
 * open a fresh window whose renderer pulls the queue on mount.
 */
function openFileInApp(path: string): void {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  if (target && !target.isDestroyed()) {
    if (target.isMinimized()) target.restore()
    target.focus()
    target.webContents.send(IPC.openPath, path)
  } else {
    pendingLaunchPaths.push(path)
    openWindowAt(firstWindowBounds())
  }
}

/** Enqueue (before ready) or immediately open (after ready) one opened file. */
function handleOpenFile(path: string): void {
  if (!path) return
  // An OS-delivered open (Open With / double-click / argv) is user intent:
  // permit the path for the filesystem IPC handlers.
  allowFile(path)
  if (appReady) openFileInApp(path)
  else pendingLaunchPaths.push(path)
}

// macOS: opened files arrive here, possibly BEFORE whenReady - so this is
// registered at module load, not inside whenReady, or early opens are dropped.
// preventDefault suppresses Electron's default no-handler behaviour. Other
// platforms never emit this event.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  handleOpenFile(filePath)
})

// Windows/Linux: a second launch (double-clicking a file while Lekha is already
// running) starts a new process. The single-instance lock routes that process's
// argv into THIS instance via `second-instance` instead of opening a duplicate.
// Gated off on macOS, which is single-instance by default and routes through
// `open-file` - and where the e2e harness intentionally runs multiple Electron
// instances that this lock would otherwise kill.
if (process.platform !== 'darwin') {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
  } else {
    app.on('second-instance', (_event, argv, workingDirectory) => {
      const paths = markdownPathsFromArgv(argv, {
        cwd: workingDirectory || process.cwd(),
        exists: isExistingFile,
        resolve,
      })
      for (const p of paths) handleOpenFile(p)
    })
  }
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
 * Command/openPath/setTheme route to the FOCUSED window so menu accelerators
 * act on whichever window the user is currently working in. "New Window" opens
 * a fresh window directly in main (no renderer round-trip), so it works even
 * when no window is focused.
 *
 * @param recentFiles - Current recent-files list for the Open Recent submenu.
 * @param currentTheme - The currently active theme id for the radio check.
 * @param autoSave - The current autosave setting for the File ▸ Auto Save check
 *   mark (read from settings, the same way currentTheme drives the Theme radio).
 * @param sidebarVisible - Current sidebar visibility, for the View ▸ Toggle
 *   Sidebar check mark (read from settings, same pattern as autoSave).
 */
async function applyMenu(
  recentFiles: string[],
  currentTheme: string = 'github',
  autoSave: boolean = false,
  sidebarVisible: boolean = true,
): Promise<void> {
  const send = (cmd: AppCommand): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.command, cmd)
  }
  const openPath = (p: string): void => {
    // Menu-originated open (Open Recent): permit the path before the renderer
    // round-trips it into readFile.
    allowFile(p)
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.openPath, p)
  }
  // Forward the chosen theme id to the focused renderer via the value-carrying
  // IPC.setTheme channel. The renderer applies + persists the theme and the
  // next setSettings call triggers another applyMenu rebuild so the radio check
  // stays current.
  const setTheme = (id: string): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.setTheme, id)
  }
  // Forward the toggled autosave value to the focused renderer via the
  // value-carrying IPC.setAutoSave channel (mirrors setTheme). The renderer
  // applies + persists it and the next setSettings call triggers an applyMenu
  // rebuild so the check mark stays current.
  const setAutoSave = (value: boolean): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.setAutoSave, value)
  }

  // Include user-authored themes (userData/themes) in the Theme submenu, after
  // the built-ins. The renderer already accepts these ids in applyTheme.
  const userThemes = await listUserThemes(join(app.getPath('userData'), 'themes'))
  const themeDefs = [
    ...THEMES,
    ...userThemes.map((t) => ({ id: t.id, label: t.label })),
  ]

  // "Reload Themes": rebuild this native submenu (picks up added/removed files)
  // AND tell the focused renderer to re-scan + re-inject the user CSS.
  const onReloadThemes = (): void => {
    BrowserWindow.getFocusedWindow()?.webContents.send(IPC.command, 'reloadThemes')
    void applyMenu(recentFiles, currentTheme, autoSave, sidebarVisible)
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate(
        send,
        recentFiles,
        openPath,
        { themes: themeDefs, current: currentTheme, userThemeCount: userThemes.length },
        setTheme,
        openNewWindow,
        // "Check for Updates…" runs the manual check directly in main (no
        // renderer round-trip). It is a safe no-op in dev.
        () => { void checkForUpdates() },
        // "Save All" sends the save command to EVERY open window (not just the
        // focused one) so all dirty documents are written.
        () => {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC.command, 'save')
          }
        },
        onReloadThemes,
        autoSave,
        setAutoSave,
        sidebarVisible,
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

/**
 * Bounds for opening a fresh window: honor valid saved bounds exactly, otherwise
 * open big and centered relative to the primary display's work area. Reading the
 * work area at call time (not startup) picks up display/resolution changes.
 */
function firstWindowBounds(): OpenBounds {
  if (savedWindowBounds) {
    // Honor saved bounds (including a window on a secondary monitor at negative
    // coordinates) as long as they still land on a connected display.
    const displays = screen.getAllDisplays().map((d) => d.workArea)
    if (boundsIntersectAny(savedWindowBounds, displays)) return savedWindowBounds
    // The display the window was saved on is no longer connected: keep the saved
    // SIZE but drop x/y so Electron recenters it on the primary display.
    return { width: savedWindowBounds.width, height: savedWindowBounds.height }
  }
  return defaultWindowBounds(screen.getPrimaryDisplay().workAreaSize)
}

// Per-window debounce timers. A single module-global timer would let one window
// cancel another's pending save (resize A then B within 300ms drops A), so each
// window gets its own timer keyed by the BrowserWindow instance. Entries are
// cleared on the window's 'closed' event so a stray timer can't fire after the
// window is destroyed.
const boundsDebounceTimers = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>()

/**
 * Schedule a debounced save of a window's bounds. Only saves when the window is
 * in a "normal" state (not minimized/fullscreen/destroyed) to avoid storing
 * useless positions. The debounce is per-window so concurrent moves/resizes of
 * different windows do not cancel each other.
 */
function scheduleBoundsSave(win: BrowserWindow): void {
  const existing = boundsDebounceTimers.get(win)
  if (existing !== undefined) clearTimeout(existing)
  const timer = setTimeout(() => {
    boundsDebounceTimers.delete(win)
    if (win.isMinimized() || win.isFullScreen() || win.isDestroyed()) return
    const b = win.getBounds()
    saveBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
  }, 300)
  boundsDebounceTimers.set(win, timer)
}

/**
 * Cancel and drop a window's pending bounds-save timer. Called on the window's
 * 'closed' event so a queued save cannot fire against a destroyed window.
 */
function cancelBoundsSave(win: BrowserWindow): void {
  const existing = boundsDebounceTimers.get(win)
  if (existing !== undefined) {
    clearTimeout(existing)
    boundsDebounceTimers.delete(win)
  }
}

// ---------------------------------------------------------------------------
// Window opening
// ---------------------------------------------------------------------------

/**
 * Open a window at the given bounds and wire up its per-window behaviour:
 * bounds persistence, the close-guard, and the right-click context menu.
 * The controller already lives in the registry (created inside createWindow).
 */
function openWindowAt(bounds: OpenBounds): BrowserWindow {
  const controller = createWindow(registry, bounds)
  const win = controller.win

  win.on('resize', () => { scheduleBoundsSave(win) })
  win.on('move', () => { scheduleBoundsSave(win) })

  // Drop this window's pending bounds-save timer once it is gone so a queued
  // save can never fire against a destroyed window.
  win.on('closed', () => { cancelBoundsSave(win) })

  // Per-window close guard. Persist bounds first (before any preventDefault),
  // then run the unsaved-changes guard for THIS window only.
  win.on('close', (e) => {
    if (!win.isMinimized() && !win.isFullScreen() && !win.isDestroyed()) {
      const b = win.getBounds()
      saveBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
    }
    runCloseGuard(controller, e, QUIT_GUARD_DISABLED)
  })

  // Right-click context menu: build a pure template and hand it to Electron.
  // The template builder (buildContextMenuTemplate) is Electron-free + tested;
  // the Electron wiring (Menu, replaceMisspelling, addWordToSpellCheckerDictionary)
  // all lives here in this thin handler.
  //
  // Electron's ContextMenuParams is a superset of our local interface; the cast
  // is safe because our local type only uses fields that exist on Electron's type.
  win.webContents.on('context-menu', (_event, electronParams: ElectronContextMenuParams) => {
    const params = electronParams as unknown as LocalContextMenuParams
    const send = (cmd: AppCommand): void => {
      win.webContents.send(IPC.command, cmd)
    }
    const onReplace = (suggestion: string): void => {
      win.webContents.replaceMisspelling(suggestion)
    }
    const onAddToDictionary = (word: string): void => {
      win.webContents.session.addWordToSpellCheckerDictionary(word)
    }
    const template = buildContextMenuTemplate(params, { send, onReplace, onAddToDictionary })
    Menu.buildFromTemplate(template).popup({ window: win })
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

// ---------------------------------------------------------------------------
// Content-Security-Policy (defense-in-depth)
//
// A restrictive CSP for the renderer, applied via onHeadersReceived so it
// covers the file:// document loaded in production. The renderer is fully
// self-contained:
//   - script-src 'self'           : only the bundled renderer JS (no inline,
//                                    no eval, no remote scripts).
//   - style-src 'self' 'unsafe-inline' : bundled CSS plus the inline <style>
//                                    that KaTeX and mermaid inject at runtime.
//   - img-src 'self' data: file: blob: : bundled assets, data:/blob: images
//                                    (paste, mermaid), and local file: images.
//   - font-src 'self' data:       : bundled fonts + data: (KaTeX/embedded).
//   - connect-src 'self'          : no outbound network from the renderer.
//   - object-src 'none' / frame-src 'none' : no plugins/iframes.
//
// Applied ONLY on the production/file load path (when ELECTRON_RENDERER_URL is
// unset). In dev, electron-vite serves the renderer from a Vite dev server that
// needs inline/eval scripts and a websocket for HMR; injecting this CSP there
// would break hot reload, so we skip it. e2e runs the built app via the file://
// path, so the CSP IS exercised (and gated) by the e2e suite.
// ---------------------------------------------------------------------------

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: file: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
].join('; ')

/**
 * Attach the renderer CSP via response headers on the given session. No-op in
 * dev (Vite dev server) so HMR keeps working; active on the packaged/file path.
 */
function applyContentSecurityPolicy(targetSession: Electron.Session): void {
  // Dev server present -> skip (would break Vite HMR's inline/eval + ws).
  if (process.env['ELECTRON_RENDERER_URL']) return

  targetSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_DIRECTIVES],
        // Defense-in-depth: never MIME-sniff responses, and forbid the renderer
        // from being framed (no remote content is loaded, but these are cheap).
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
      },
    })
  })
}

void app.whenReady().then(async () => {
  // Settings store backed by the OS user-data directory.
  const settings = createSettingsStore(app.getPath('userData'))
  settingsStore = settings

  // Apply the renderer Content-Security-Policy before any window loads so the
  // very first document is covered. No-op in dev (see function comment).
  applyContentSecurityPolicy(session.defaultSession)

  // Load persisted settings before creating the window so we can restore
  // window bounds and build the initial menu with saved recents.
  const initialSettings = await settings.get()

  // Register IPC handlers before creating any window so they are ready the
  // moment a renderer sends its first message. Handlers derive their target
  // window from the IPC event sender (multi-window safe) rather than a shared
  // getWindow closure.
  registerDialogHandlers()

  // Rebuild the menu when recents or settings (theme) change. Window-level
  // dirtiness (the close guard + macOS edited dot) is driven by the separate
  // setWindowDirty handler above, not by setDocumentState.
  registerFileHandlers(
    settings,
    registry,
    async () => {
      // Rebuild menu after a recent file is added (Open Recent sync).
      const [recents, allSettings] = await Promise.all([
        settings.getRecentFiles(),
        settings.get(),
      ])
      void applyMenu(recents, allSettings.theme, allSettings.autoSave, allSettings.sidebarVisible)
    },
    async (updated) => {
      // Rebuild menu after any settings change so the native Theme radio and the
      // Auto Save check mark reflect the newly persisted values without an extra
      // IPC round-trip (covers Preferences toggling autoSave too).
      const recents = await settings.getRecentFiles()
      void applyMenu(recents, updated.theme, updated.autoSave, updated.sidebarVisible)
      // Re-apply spell-check settings whenever the user changes them in Preferences.
      applySpellCheck(session.defaultSession, {
        spellCheck: updated.spellCheck,
        language: updated.spellCheckLanguage,
      })
    },
    // Supply the userData path so the backup IPC handlers can resolve
    // <userData>/backups (resolved at call time, like the image/template handlers).
    () => app.getPath('userData'),
  )

  registerExportHandlers()

  // Register image-save IPC handler. Passes the user-data path at call time so
  // it always reflects the current Electron data directory.
  registerImageHandlers(() => app.getPath('userData'))

  // Register the openExternal IPC handler (scheme-validated link opening).
  registerShellHandlers()

  // Register folder-wide Markdown search handler.
  registerSearchHandlers()
  registerReplaceHandlers()

  // Register the user-templates listing handler. Pass a thunk so the userData
  // path is resolved at call time (consistent with the image handler pattern).
  registerTemplateHandlers(() => app.getPath('userData'))

  // Register the user-themes handlers (list / reload / open folder). The themes
  // folder is seeded with _template.css on first run.
  registerThemeHandlers(
    () => app.getPath('userData'),
    () => DEFAULT_TEMPLATE_CSS,
  )

  // Drain the launch-open queue for the renderer. A renderer calls this once on
  // mount to open any files the OS requested before it existed (Open With /
  // double-click / CLI arg). The splice clears the queue so a second window does
  // not re-open the same files.
  guardedIpc.handle(IPC.takePendingOpen, () => pendingLaunchPaths.splice(0))

  // Renderer-routed New Window: the 'newWindow' AppCommand calls
  // window.lekha.newWindow() which sends this IPC. (The native menu item opens
  // windows directly via openNewWindow without this round-trip.)
  guardedIpc.on(IPC.newWindow, () => { openNewWindow() })

  // Print: open the native print dialog for the window that asked. Printing the
  // sender (not the focused window) keeps the right document in multi-window use.
  guardedIpc.on(IPC.print, (event) => { event.sender.print() })

  // Share: open the macOS share sheet for the current file. macOS-only; a no-op
  // on other platforms (ShareMenu is a macOS feature).
  guardedIpc.on(IPC.share, (event, filePath: unknown) => {
    if (process.platform !== 'darwin') return
    const path = String(filePath)
    if (!path) return
    // Same path policy as the filesystem handlers: only share a file the user
    // actually has open (the share sheet hands the path to other apps).
    if (!isPathAllowed(path)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    new ShareMenu({ filePaths: [path] }).popup({ window: win })
  })

  // Always on Top: float the sender window above others (toggle from the View menu).
  guardedIpc.on(IPC.setAlwaysOnTop, (event, value: unknown) => {
    BrowserWindow.fromWebContents(event.sender)?.setAlwaysOnTop(Boolean(value))
  })

  // Window-level dirtiness (ANY open tab dirty): drives the close guard and the
  // macOS edited dot. Separate from setDocumentState, which only drives the
  // ACTIVE doc's title bullet (per-document indicator).
  guardedIpc.on(IPC.setWindowDirty, (event, anyDirty: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const v = Boolean(anyDirty)
    if (process.platform === 'darwin') win.setDocumentEdited(v)
    registry.get(win)?.setWindowDirty(v)
  })

  // Remember valid saved bounds for restoring/cascading future windows.
  savedWindowBounds = isSaneBounds(initialSettings.windowBounds)
    ? initialSettings.windowBounds
    : undefined

  // Apply spell-check session configuration before windows open so the setting
  // is active from the very first keystroke.
  applySpellCheck(session.defaultSession, {
    spellCheck: initialSettings.spellCheck,
    language: initialSettings.spellCheckLanguage,
  })

  // Windows/Linux cold launch: a file double-clicked while Lekha was closed
  // arrives as a command-line argument. Seed the queue before the first window
  // opens so its renderer picks the file up on mount. macOS uses `open-file`
  // (handled above), so its argv is left alone here.
  if (process.platform !== 'darwin') {
    const launchPaths = markdownPathsFromArgv(process.argv, {
      cwd: process.cwd(),
      exists: isExistingFile,
      resolve,
    })
    for (const p of launchPaths) pendingLaunchPaths.push(p)
  }

  // First window: honor saved bounds exactly (no cascade). When none are saved,
  // open big and centered relative to the display work area.
  openWindowAt(firstWindowBounds())

  // Set up the native application menu with the persisted recent files, theme,
  // and autosave setting (so the File ▸ Auto Save check mark renders correctly).
  void applyMenu(initialSettings.recentFiles, initialSettings.theme, initialSettings.autoSave, initialSettings.sidebarVisible)

  // Configure auto-update and kick off a background check. NO-OP in dev
  // (!app.isPackaged) and never throws, so this is safe to always call.
  setupAutoUpdater()

  // The first window now exists. From here on, OS file-open requests are pushed
  // straight to a live window instead of being queued for the startup drain.
  appReady = true

  app.on('activate', () => {
    // macOS: re-open a window when the dock icon is clicked and none are open.
    if (registry.size === 0) {
      openWindowAt(firstWindowBounds())
    }
  })
}).catch((err: unknown) => {
  // A throw here (e.g. settings load failure) would otherwise leave the app
  // running with no window and no menu and only a console.error to show for it.
  // Surface a native error box so a wedged launch is diagnosable, then log it.
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error('Fatal error during app startup:', err)
  dialog.showErrorBox('Lekha failed to start', message)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
