/**
 * Unit tests for the sidebar resize helper.
 *
 * clampSidebarWidth is a pure function that clamps a px value to the
 * [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH] range. Tests run in a pure Node
 * environment (no DOM needed).
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  clampSidebarWidth,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
} from '../../../src/renderer/components/sidebarResizerUtils'

describe('clampSidebarWidth', () => {
  it('clamps below minimum up to SIDEBAR_MIN_WIDTH (180)', () => {
    expect(clampSidebarWidth(50)).toBe(180)
    expect(clampSidebarWidth(0)).toBe(180)
    expect(clampSidebarWidth(-100)).toBe(180)
    expect(clampSidebarWidth(179)).toBe(180)
  })

  it('passes through values within the range', () => {
    expect(clampSidebarWidth(180)).toBe(180)
    expect(clampSidebarWidth(300)).toBe(300)
    expect(clampSidebarWidth(240)).toBe(240)
    expect(clampSidebarWidth(480)).toBe(480)
  })

  it('clamps above maximum down to SIDEBAR_MAX_WIDTH (480)', () => {
    expect(clampSidebarWidth(999)).toBe(480)
    expect(clampSidebarWidth(481)).toBe(480)
    expect(clampSidebarWidth(10000)).toBe(480)
  })

  it('SIDEBAR_MIN_WIDTH is 180', () => {
    expect(SIDEBAR_MIN_WIDTH).toBe(180)
  })

  it('SIDEBAR_MAX_WIDTH is 480', () => {
    expect(SIDEBAR_MAX_WIDTH).toBe(480)
  })

  it('SIDEBAR_DEFAULT_WIDTH is 240', () => {
    expect(SIDEBAR_DEFAULT_WIDTH).toBe(240)
  })
})
