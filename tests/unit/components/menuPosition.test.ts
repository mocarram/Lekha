/**
 * Unit tests for the pure clampMenuPosition helper (viewport-clamping of
 * context menus opened at the cursor).
 */
import { describe, it, expect } from 'vitest'
import { clampMenuPosition } from '../../../src/renderer/components/useMenuPosition'

const VW = 1000
const VH = 800
const W = 200
const H = 300

describe('clampMenuPosition', () => {
  it('leaves a menu that fits at the click point untouched', () => {
    expect(clampMenuPosition(100, 120, W, H, VW, VH)).toEqual({ left: 100, top: 120 })
  })

  it('pulls a menu left when it would overflow the right edge', () => {
    // x=950, width 200 -> right edge 1150 > 1000; clamp to 1000-200-8 = 792.
    expect(clampMenuPosition(950, 120, W, H, VW, VH).left).toBe(792)
  })

  it('pulls a menu up when it would overflow the bottom edge', () => {
    // y=700, height 300 -> bottom 1000 > 800; clamp to 800-300-8 = 492.
    expect(clampMenuPosition(100, 700, W, H, VW, VH).top).toBe(492)
  })

  it('clamps both axes at the far corner', () => {
    expect(clampMenuPosition(990, 790, W, H, VW, VH)).toEqual({ left: 792, top: 492 })
  })

  it('pins to the top-left margin when the menu is larger than the viewport', () => {
    expect(clampMenuPosition(50, 50, 2000, 2000, VW, VH)).toEqual({ left: 8, top: 8 })
  })

  it('respects a custom margin', () => {
    expect(clampMenuPosition(990, 120, W, H, VW, VH, 20).left).toBe(780)
  })
})
