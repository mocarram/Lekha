/**
 * window.ts - Multi-window registry, per-window state, and pure geometry helpers.
 *
 * Lekha supports N independent windows, each running its own single-document
 * renderer instance. This module owns everything window-scoped:
 *
 *   - `nextWindowBounds` / `isSaneBounds` - pure geometry helpers (Electron-free,
 *     unit-tested).
 *   - `WindowController` - encapsulates ALL per-window mutable state: the dirty
 *     flag mirrored from the renderer plus the close-guard state machine
 *     (forceClose / pendingClose). One controller per BrowserWindow.
 *   - `WindowRegistry` - the set of live windows + their controllers, with a
 *     lookup from a BrowserWindow (or a webContents sender) to its controller.
 *
 * Keeping per-window state inside a single object (rather than several parallel
 * Maps) means the close-guard logic reads/writes one cohesive place and there is
 * exactly one source of truth per window.
 */
import { BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import type { Settings } from '@shared/types'
import { decideWindowOpen } from '@main/openExternal'

// ---------------------------------------------------------------------------
// Navigation / window-open hardening (shared by every window we create)
// ---------------------------------------------------------------------------

/**
 * Lock down a window's webContents so it can NEVER open a child Electron window
 * or navigate away from the bundled app:
 *
 *   - setWindowOpenHandler: route every window.open / target=_blank / external
 *     link through the scheme allowlist (decideWindowOpen -> isSafeExternalUrl).
 *     Safe http/https/mailto URLs are handed to the OS browser via
 *     shell.openExternal; everything else (file:, javascript:, data:, ...) is
 *     dropped. We ALWAYS return { action: 'deny' } so no in-app child window is
 *     ever created (a child window would run with the app's privileges).
 *
 *   - will-navigate: prevent the renderer from navigating the top-level frame
 *     away from the app (e.g. a stray <a href> or injected script setting
 *     location). Only the app's own URL/file is allowed to load; any other
 *     destination is canceled with event.preventDefault().
 *
 * `appUrl` is the URL/file the window was loaded with so we can recognise an
 * allowed (same-document) navigation and block everything else.
 */
export function hardenWebContents(contents: Electron.WebContents, appUrl: string): void {
  contents.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen(url)
    if (decision.openExternal) void shell.openExternal(url)
    return { action: decision.action }
  })

  contents.on('will-navigate', (event, url) => {
    // Allow only navigations back to the exact app document we loaded. Any
    // navigation to a different (non-app) URL is blocked.
    if (url !== appUrl) event.preventDefault()
  })
}

// ---------------------------------------------------------------------------
// Pure geometry helpers (Electron-free, unit-tested)
// ---------------------------------------------------------------------------

export type WindowBounds = NonNullable<Settings['windowBounds']>

/** Bounds to open a window at. x/y are optional so the first window can omit
 *  them and let Electron center it on screen. */
export type OpenBounds = { x?: number; y?: number; width: number; height: number }

/** Default size for the first window when no saved bounds exist. */
export const DEFAULT_WINDOW_SIZE = { width: 1100, height: 720 } as const

/** Pixel offset applied when cascading each additional window. */
export const CASCADE_OFFSET = 28

/** Minimum sane window dimensions to guard against corrupt saved bounds. */
const MIN_WIDTH = 400
const MIN_HEIGHT = 300

/**
 * Validate that saved window bounds are reasonable: finite numbers, minimum
 * size, and x/y are non-negative (on-screen). Returns true if the bounds can
 * be used safely.
 */
export function isSaneBounds(b: Settings['windowBounds']): b is WindowBounds {
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

/**
 * Compute the bounds for a NEW window cascaded down-right from `base`.
 *
 * Pure function so the cascade maths can be unit-tested without Electron.
 * - When `base` is valid bounds, the new window keeps the same size and shifts
 *   by CASCADE_OFFSET so it doesn't sit exactly on top of the previous one.
 * - When `base` is missing/invalid, fall back to the default size positioned
 *   at the cascade offset from the origin.
 */
export function nextWindowBounds(base: Settings['windowBounds']): WindowBounds {
  if (isSaneBounds(base)) {
    return {
      x: base.x + CASCADE_OFFSET,
      y: base.y + CASCADE_OFFSET,
      width: base.width,
      height: base.height,
    }
  }
  return {
    x: CASCADE_OFFSET,
    y: CASCADE_OFFSET,
    width: DEFAULT_WINDOW_SIZE.width,
    height: DEFAULT_WINDOW_SIZE.height,
  }
}

// ---------------------------------------------------------------------------
// Per-window close-guard state machine
// ---------------------------------------------------------------------------

/**
 * WindowController - all mutable state for ONE window.
 *
 * Close-guard state machine (per window, so each window protects only its own
 * document):
 *
 *   dirty        - mirrors this window's renderer isDirty flag, updated on every
 *                  setDocumentState message so the close handler always sees the
 *                  current state without an extra IPC round-trip.
 *
 *   forceClose   - set true when the user picks "Don't Save". The close handler
 *                  sees this and lets the next win.close() through unprompted.
 *
 *   pendingClose - set true when the user picks "Save". We send a 'save' command
 *                  to this window's renderer and wait. When that renderer later
 *                  reports dirty:false while pendingClose is true, we flip
 *                  forceClose=true and call win.close() to complete the close. If
 *                  the user cancels the Save As dialog the doc stays dirty, the
 *                  window stays open, and pendingClose resets so a later close
 *                  re-prompts.
 *
 * Cmd+Q coverage: Electron fires each window's 'close' after 'before-quit', so
 * the SAME per-window guard protects the red-button close AND Cmd+Q.
 */
export class WindowController {
  dirty = false
  private forceClose = false
  private pendingClose = false

  constructor(readonly win: BrowserWindow) {}

  /** Mark "Don't Save": the next close goes through without prompting. */
  allowClose(): void {
    this.forceClose = true
  }

  /** Begin a save-then-close: ask the renderer to save; close when it goes clean. */
  beginSaveAndClose(): void {
    this.pendingClose = true
    this.win.webContents.send(IPC.command, 'save')
  }

  /** True if a close should be allowed without prompting (clean or forced). */
  canCloseWithout(quitGuardDisabled: boolean): boolean {
    if (this.forceClose || quitGuardDisabled) {
      this.forceClose = false // reset for any future re-use
      return true
    }
    return !this.dirty
  }

  /**
   * Update the dirty flag from a setDocumentState message. If a save triggered
   * by the close guard (pendingClose) just completed and the document is now
   * clean, proceed with closing this window.
   */
  setDirty(dirty: boolean): void {
    this.dirty = dirty
    if (this.pendingClose && !dirty) {
      this.pendingClose = false
      this.forceClose = true
      this.win.close()
    }
  }
}

// ---------------------------------------------------------------------------
// Window registry
// ---------------------------------------------------------------------------

/**
 * Tracks every live window and its WindowController. A WeakMap keyed by the
 * BrowserWindow gives O(1) controller lookup, including from an IPC event's
 * sender via BrowserWindow.fromWebContents.
 */
export class WindowRegistry {
  private readonly controllers = new Map<BrowserWindow, WindowController>()

  add(win: BrowserWindow): WindowController {
    const controller = new WindowController(win)
    this.controllers.set(win, controller)
    return controller
  }

  remove(win: BrowserWindow): void {
    this.controllers.delete(win)
  }

  get(win: BrowserWindow | null): WindowController | undefined {
    return win ? this.controllers.get(win) : undefined
  }

  get size(): number {
    return this.controllers.size
  }
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

/**
 * Create a hardened BrowserWindow loading the renderer, register it in the
 * registry, and return its controller. Security posture is identical for every
 * window: contextIsolation on, nodeIntegration off, sandbox on.
 *
 * @param registry  Registry to add the new window to (and remove on 'closed').
 * @param bounds    Position/size to open at (already cascaded by the caller).
 *   x/y may be omitted to let Electron center the first window.
 * @param onClosed  Optional callback invoked after the window is removed from
 *   the registry, used by the caller to persist last-closed bounds.
 */
export function createWindow(
  registry: WindowRegistry,
  bounds: OpenBounds,
  onClosed?: (win: BrowserWindow) => void,
): WindowController {
  const win = new BrowserWindow({
    ...bounds,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Enable the native Chromium spell-checker. Language configuration is
      // applied separately via session.setSpellCheckerLanguages in index.ts.
      spellcheck: true,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  })

  const controller = registry.add(win)

  win.on('closed', () => {
    registry.remove(win)
    onClosed?.(win)
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Determine the app document this window loads so the navigation guard can
  // tell an allowed (same-document) navigation from an unwanted redirect.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const appFile = join(__dirname, '../renderer/index.html')

  if (devUrl) {
    // loadURL normalises (e.g. appends a trailing slash); use the resolved URL
    // as the navigation allowlist entry below.
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(appFile)
  }

  // Harden the window: only open scheme-validated external links in the OS
  // browser (never a child Electron window) and block navigation away from the
  // app. The app URL is the loaded document; loadFile resolves to a file: URL.
  const appUrl = devUrl ?? `file://${appFile}`
  hardenWebContents(win.webContents, appUrl)

  return controller
}

/**
 * Run the unsaved-changes close guard for a window. Called from the window's
 * 'close' handler. Returns nothing; mutates the controller's state machine and
 * may call e.preventDefault() to keep the window open.
 *
 * @param controller        The window's controller (per-window state).
 * @param e                 The Electron 'close' event (so we can preventDefault).
 * @param quitGuardDisabled LEKHA_DISABLE_QUIT_GUARD - e2e teardown bypass only.
 */
export function runCloseGuard(
  controller: WindowController,
  e: Electron.Event,
  quitGuardDisabled: boolean,
): void {
  // Allow the close if clean, already-confirmed "Don't Save", or test bypass.
  if (controller.canCloseWithout(quitGuardDisabled)) return

  // Unsaved changes - prompt with a synchronous dialog so the event loop does
  // not advance while the dialog is open. Modal to THIS window.
  e.preventDefault()

  const response = dialog.showMessageBoxSync(controller.win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    message: 'Do you want to save the changes you made?',
    detail: "Your changes will be lost if you don't save them.",
  })

  if (response === 1) {
    // "Don't Save": mark forceClose so the next win.close() goes through.
    controller.allowClose()
    controller.win.close()
  } else if (response === 0) {
    // "Save": ask the renderer to save, then close when dirty goes false.
    controller.beginSaveAndClose()
  }
  // response === 2 ("Cancel"): do nothing - the window stays open.
}
