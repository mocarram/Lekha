// @vitest-environment node
/**
 * Unit tests for the pure window-geometry helpers and the per-window close-guard
 * state machine (WindowController) in src/main/window.ts.
 *
 * BrowserWindow creation is Electron-bound and covered by the e2e suite; the
 * WindowController tests below drive the state machine against a hand-rolled fake
 * BrowserWindow (only the webContents.send + close methods it touches).
 */
import { describe, it, expect, vi } from 'vitest'
import {
  WindowController,
  nextWindowBounds,
  defaultWindowBounds,
  isSaneBounds,
  boundsIntersectAny,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_FILL_RATIO,
  DEFAULT_MAX_SIZE,
  CASCADE_OFFSET,
} from '../../../src/main/window'
import type { BrowserWindow } from 'electron'

// ---------------------------------------------------------------------------
// Fake BrowserWindow for the WindowController state-machine tests.
//
// The controller only touches win.webContents.send (to dispatch the close
// command), win.close (to complete the close once the renderer reports the
// window clean), and the isDestroyed() guards on the window and its
// webContents. We model exactly those, with vi.fn() spies so the tests can
// assert on the dispatched command and the close call.
//
// When `destroyed` is set, win.isDestroyed()/webContents.isDestroyed() report
// true and send() throws the exact error Electron raises once the render frame
// has been disposed (GPU crash / force-kill), so a test can prove the
// close-guard does not call into a dead frame.
// ---------------------------------------------------------------------------
function makeFakeWindow({ destroyed = false }: { destroyed?: boolean } = {}) {
  const send = vi.fn(() => {
    if (destroyed) {
      throw new Error('Render frame was disposed before WebFrameMain could be accessed')
    }
  })
  const close = vi.fn()
  const win = {
    webContents: { send, isDestroyed: () => destroyed },
    close,
    isDestroyed: () => destroyed,
  } as unknown as BrowserWindow
  return { win, send, close }
}

describe('isSaneBounds - accepts multi-monitor (negative) coordinates', () => {
  it('accepts bounds on a secondary display at negative coordinates', () => {
    // Regression: a window saved on an external monitor to the left has negative
    // x/y; rejecting it forced the small default instead of the saved size.
    expect(isSaneBounds({ x: -2950, y: -81, width: 1781, height: 1160 })).toBe(true)
  })

  it('rejects undefined, non-finite, and below-minimum sizes', () => {
    expect(isSaneBounds(undefined)).toBe(false)
    expect(isSaneBounds({ x: 0, y: 0, width: NaN, height: 800 })).toBe(false)
    expect(isSaneBounds({ x: 0, y: 0, width: 100, height: 100 })).toBe(false)
  })
})

describe('boundsIntersectAny - window visible on some display', () => {
  const primary = { x: 0, y: 0, width: 1512, height: 982 }
  const leftExternal = { x: -2992, y: -200, width: 2992, height: 1680 }

  it('true when the window overlaps a connected display (external monitor)', () => {
    expect(
      boundsIntersectAny({ x: -2950, y: -81, width: 1781, height: 1160 }, [primary, leftExternal]),
    ).toBe(true)
  })

  it('false when the saved display is gone (window off all displays)', () => {
    // Only the primary remains; the window saved at -2950 no longer intersects.
    expect(
      boundsIntersectAny({ x: -2950, y: -81, width: 1781, height: 1160 }, [primary]),
    ).toBe(false)
  })
})

describe('nextWindowBounds - cascade offset for additional windows', () => {
  it('offsets a new window down-right from the base bounds', () => {
    const base = { x: 100, y: 80, width: 1100, height: 720 }
    const next = nextWindowBounds(base)
    expect(next.x).toBe(100 + CASCADE_OFFSET)
    expect(next.y).toBe(80 + CASCADE_OFFSET)
    // Size is preserved when cascading from a known base.
    expect(next.width).toBe(1100)
    expect(next.height).toBe(720)
  })

  it('falls back to the default size+position when base is undefined', () => {
    const next = nextWindowBounds(undefined)
    expect(next.width).toBe(DEFAULT_WINDOW_SIZE.width)
    expect(next.height).toBe(DEFAULT_WINDOW_SIZE.height)
    // No base to offset from: cascade from the default origin.
    expect(next.x).toBe(CASCADE_OFFSET)
    expect(next.y).toBe(CASCADE_OFFSET)
  })

  it('is deterministic - same input yields same output', () => {
    const base = { x: 200, y: 150, width: 900, height: 600 }
    expect(nextWindowBounds(base)).toEqual(nextWindowBounds(base))
  })
})

describe('defaultWindowBounds - big, centered first window', () => {
  it('fills a fraction of the work area on a typical display', () => {
    const b = defaultWindowBounds({ width: 1440, height: 900 })
    expect(b.width).toBe(Math.round(1440 * DEFAULT_FILL_RATIO))
    expect(b.height).toBe(Math.round(900 * DEFAULT_FILL_RATIO))
    // Bigger than the old fixed default so the window opens large.
    expect(b.width).toBeGreaterThan(DEFAULT_WINDOW_SIZE.width)
    // x/y omitted so Electron centers the window.
    expect(b.x).toBeUndefined()
    expect(b.y).toBeUndefined()
  })

  it('caps the size on very large displays', () => {
    const b = defaultWindowBounds({ width: 3840, height: 2160 })
    expect(b.width).toBe(DEFAULT_MAX_SIZE.width)
    expect(b.height).toBe(DEFAULT_MAX_SIZE.height)
  })

  it('falls back to the fixed default when the work area is too small or invalid', () => {
    expect(defaultWindowBounds({ width: 100, height: 100 })).toEqual({ ...DEFAULT_WINDOW_SIZE })
    expect(defaultWindowBounds({ width: NaN, height: 900 })).toEqual({ ...DEFAULT_WINDOW_SIZE })
  })
})

describe('WindowController - window-level close-guard state machine', () => {
  it('canCloseWithout reflects window-level dirtiness (anyDirty)', () => {
    const { win } = makeFakeWindow()
    const controller = new WindowController(win)

    // Clean window: a close is allowed without prompting.
    expect(controller.anyDirty).toBe(false)
    expect(controller.canCloseWithout(false)).toBe(true)

    // Any open tab dirty -> the guard must block (prompt) the close.
    controller.setWindowDirty(true)
    expect(controller.canCloseWithout(false)).toBe(false)

    // The e2e teardown bypass forces a close regardless of dirtiness.
    expect(controller.canCloseWithout(true)).toBe(true)
  })

  it('setWindowDirty(false) while pendingClose (after Save) closes the window and forces it', () => {
    const { win, close } = makeFakeWindow()
    const controller = new WindowController(win)
    controller.setWindowDirty(true)

    // Start the save-then-close handshake (pendingClose = true).
    controller.beginSaveAndClose()
    // The renderer reports the window clean once every dirty tab is saved.
    controller.setWindowDirty(false)

    // The handshake completes: win.close() is called and the next close passes
    // the guard unprompted (forceClose), then resets.
    expect(close).toHaveBeenCalledOnce()
    expect(controller.canCloseWithout(false)).toBe(true) // forceClose was set
    // forceClose resets after one use: a fresh clean window still closes, a
    // dirty one would block again.
    expect(controller.canCloseWithout(false)).toBe(true) // now via !anyDirty (clean)
  })

  it('beginSaveAndClose dispatches the saveAllAndClose command to the renderer', () => {
    const { win, send } = makeFakeWindow()
    const controller = new WindowController(win)

    controller.beginSaveAndClose()

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('app:command', 'saveAllAndClose')
  })

  it('beginDiscardAndClose dispatches the discardAllAndClose command to the renderer', () => {
    const { win, send } = makeFakeWindow()
    const controller = new WindowController(win)

    controller.beginDiscardAndClose()

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('app:command', 'discardAllAndClose')
  })

  it('beginSaveAndClose is inert (no throw, no send) when the renderer frame is gone', () => {
    // Abnormal teardown (GPU crash / force-kill): webContents.send throws
    // "Render frame was disposed...". The guard must short-circuit so the close
    // path does not spam that error.
    const { win, send } = makeFakeWindow({ destroyed: true })
    const controller = new WindowController(win)

    expect(() => controller.beginSaveAndClose()).not.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('beginDiscardAndClose is inert (no throw, no send) when the renderer frame is gone', () => {
    const { win, send } = makeFakeWindow({ destroyed: true })
    const controller = new WindowController(win)

    expect(() => controller.beginDiscardAndClose()).not.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('does NOT close while pendingClose is unset (a stray clean report is inert)', () => {
    const { win, close } = makeFakeWindow()
    const controller = new WindowController(win)
    controller.setWindowDirty(true)

    // No Save/Discard handshake started: a clean report must not close the window.
    controller.setWindowDirty(false)
    expect(close).not.toHaveBeenCalled()
  })
})
