// @vitest-environment node
/**
 * Unit tests for the pure window-geometry helpers in src/main/window.ts.
 *
 * Only the pure, Electron-free helpers are tested here: BrowserWindow creation
 * and the per-window close-guard state machine are Electron-bound and covered
 * by the e2e suite instead.
 */
import { describe, it, expect } from 'vitest'
import {
  nextWindowBounds,
  defaultWindowBounds,
  isSaneBounds,
  boundsIntersectAny,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_FILL_RATIO,
  DEFAULT_MAX_SIZE,
  CASCADE_OFFSET,
} from '../../../src/main/window'

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
