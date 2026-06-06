// @vitest-environment node
/**
 * Unit tests for the pure window-geometry helpers in src/main/window.ts.
 *
 * Only the pure, Electron-free helpers are tested here: BrowserWindow creation
 * and the per-window close-guard state machine are Electron-bound and covered
 * by the e2e suite instead.
 */
import { describe, it, expect } from 'vitest'
import { nextWindowBounds, DEFAULT_WINDOW_SIZE, CASCADE_OFFSET } from '../../../src/main/window'

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
