/**
 * window.ts - Multi-window registry, per-window state, and pure geometry helpers.
 *
 * Lekha supports N independent windows, each running its own single-document
 * renderer instance. This module owns everything window-scoped:
 *
 *   - `nextWindowBounds` / `isSaneBounds` - pure geometry helpers (Electron-free,
 *     unit-tested).
 *   - `WindowController` - encapsulates ALL per-window mutable state: the
 *     window-level dirty flag (any open tab dirty) mirrored from the renderer
 *     plus the close-guard state machine (forceClose / pendingClose). The guard
 *     is window-level: closing with ANY dirty tab prompts, and "Save" saves
 *     every dirty tab. One controller per BrowserWindow.
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

/** Fallback size used when the display work area is unavailable/too small. */
export const DEFAULT_WINDOW_SIZE = { width: 1100, height: 720 } as const

/** Fraction of the display work area the first window fills (no saved bounds). */
export const DEFAULT_FILL_RATIO = 0.9

/** Cap on the computed default so it stays comfortable on very large displays. */
export const DEFAULT_MAX_SIZE = { width: 1600, height: 1040 } as const

/** Pixel offset applied when cascading each additional window. */
export const CASCADE_OFFSET = 28

/** Minimum sane window dimensions to guard against corrupt saved bounds. */
const MIN_WIDTH = 400
const MIN_HEIGHT = 300

/**
 * Validate that saved window bounds are reasonable: finite numbers and at least
 * the minimum size. x/y may be NEGATIVE - on multi-monitor macOS setups a
 * secondary display sits at negative coordinates relative to the primary, so a
 * window legitimately saved there has a negative x/y. Whether those coordinates
 * are still on a connected display is checked separately (boundsIntersectAny)
 * so the size is preserved even when the saved monitor is gone.
 */
export function isSaneBounds(b: Settings['windowBounds']): b is WindowBounds {
  if (!b) return false
  return (
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height) &&
    b.width >= MIN_WIDTH &&
    b.height >= MIN_HEIGHT
  )
}

/** A rectangle in screen coordinates (a window or a display work area). */
type Rect = { x: number; y: number; width: number; height: number }

/**
 * True when `b` overlaps at least one of the given display rects (positive
 * intersection area), i.e. the window would be visible on some connected
 * display. Pure so the geometry can be unit-tested; the caller passes
 * screen.getAllDisplays().map(d => d.workArea).
 */
export function boundsIntersectAny(b: Rect, displays: Rect[]): boolean {
  return displays.some((d) => {
    const overlapW = Math.min(b.x + b.width, d.x + d.width) - Math.max(b.x, d.x)
    const overlapH = Math.min(b.y + b.height, d.y + d.height) - Math.max(b.y, d.y)
    return overlapW > 0 && overlapH > 0
  })
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

/**
 * Compute centered "open big" bounds for the first window when no saved bounds
 * exist. Sized to DEFAULT_FILL_RATIO of the display work area and capped to
 * DEFAULT_MAX_SIZE so it stays comfortable on large monitors. x/y are omitted
 * so Electron centers the window. Falls back to DEFAULT_WINDOW_SIZE when the
 * work area is non-finite or smaller than the minimum sane size.
 *
 * Pure (no Electron) so the sizing maths can be unit-tested; the caller passes
 * screen.getPrimaryDisplay().workAreaSize.
 */
export function defaultWindowBounds(workArea: { width: number; height: number }): OpenBounds {
  const { width: aw, height: ah } = workArea
  if (
    !Number.isFinite(aw) ||
    !Number.isFinite(ah) ||
    aw < MIN_WIDTH ||
    ah < MIN_HEIGHT
  ) {
    return { ...DEFAULT_WINDOW_SIZE }
  }
  return {
    width: Math.min(Math.round(aw * DEFAULT_FILL_RATIO), DEFAULT_MAX_SIZE.width),
    height: Math.min(Math.round(ah * DEFAULT_FILL_RATIO), DEFAULT_MAX_SIZE.height),
  }
}

// ---------------------------------------------------------------------------
// Per-window close-guard state machine
// ---------------------------------------------------------------------------

/**
 * WindowController - all mutable state for ONE window.
 *
 * Close-guard state machine (per window). The guard is WINDOW-level: it fires
 * whenever ANY open tab in this window is dirty, and "Save" saves EVERY dirty
 * tab (not just the active one). State:
 *
 *   anyDirty     - mirrors this window's window-level dirtiness (true when ANY
 *                  open tab is dirty), pushed via setWindowDirty so the close
 *                  handler always sees the current state without an extra IPC
 *                  round-trip.
 *
 *   forceClose   - flipped true (by setWindowDirty) once a pending Save/Discard
 *                  handshake reports the window clean, so the win.close() it
 *                  triggers passes the guard unprompted.
 *
 *   pendingClose - set true when the user picks "Save" or "Don't Save". We send
 *                  the matching command ('saveAllAndClose' or 'discardAllAndClose')
 *                  to this window's renderer and wait. When that renderer later
 *                  reports anyDirty:false while pendingClose is true, we flip
 *                  forceClose=true and call win.close() to complete the close. If
 *                  the user cancels a Save As dialog a tab stays dirty, the window
 *                  stays open, and pendingClose resets so a later close re-prompts.
 *
 * Cmd+Q coverage: Electron fires each window's 'close' after 'before-quit', so
 * the SAME per-window guard protects the red-button close AND Cmd+Q.
 */
export class WindowController {
  /** Window-level dirtiness: true when ANY open tab in this window is dirty. */
  anyDirty = false
  private forceClose = false
  private pendingClose = false

  constructor(readonly win: BrowserWindow) {}

  /**
   * Begin a save-then-close: ask the renderer to save EVERY dirty tab; close
   * when the window goes clean.
   */
  beginSaveAndClose(): void {
    this.pendingClose = true
    this.win.webContents.send(IPC.command, 'saveAllAndClose')
  }

  /**
   * Begin a discard-then-close ("Don't Save"): ask the renderer to delete EVERY
   * tab's crash backup and report the window clean. The same pendingClose
   * handshake then completes the close (setWindowDirty(false) below), but NO
   * file is written. This keeps the crash-recovery invariant intact - a clean
   * exit, whether via Save or Don't Save, leaves no backup behind.
   */
  beginDiscardAndClose(): void {
    this.pendingClose = true
    this.win.webContents.send(IPC.command, 'discardAllAndClose')
  }

  /** True if a close should be allowed without prompting (clean or forced). */
  canCloseWithout(quitGuardDisabled: boolean): boolean {
    if (this.forceClose || quitGuardDisabled) {
      this.forceClose = false // reset for any future re-use
      return true
    }
    return !this.anyDirty
  }

  /**
   * Update the window-level dirty flag from a setWindowDirty message. If a save
   * triggered by the close guard (pendingClose) just completed and the window is
   * now clean, proceed with closing this window.
   */
  setWindowDirty(anyDirty: boolean): void {
    this.anyDirty = anyDirty
    if (this.pendingClose && !anyDirty) {
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
    // "Don't Save": ask the renderer to discard the active doc's crash backup
    // first, then close (so a discarded doc leaves no backup to be falsely
    // recovered on next launch). The window stays open (e.preventDefault above)
    // until the renderer reports the doc clean, mirroring the Save handshake.
    controller.beginDiscardAndClose()
  } else if (response === 0) {
    // "Save": ask the renderer to save, then close when dirty goes false.
    controller.beginSaveAndClose()
  }
  // response === 2 ("Cancel"): do nothing - the window stays open.
}
