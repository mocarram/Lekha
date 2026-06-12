/**
 * Unit tests for the page-zoom math behind the zoom:adjust IPC handler.
 */
import { describe, it, expect } from 'vitest'
import {
  nextZoomLevel,
  clampZoomFactor,
  ZOOM_LEVEL_MIN,
  ZOOM_LEVEL_MAX,
  ZOOM_LEVEL_STEP,
} from '../../../src/main/zoom'

describe('nextZoomLevel', () => {
  it('steps in and out by the standard increment', () => {
    expect(nextZoomLevel(0, 'in')).toBe(ZOOM_LEVEL_STEP)
    expect(nextZoomLevel(0, 'out')).toBe(-ZOOM_LEVEL_STEP)
    expect(nextZoomLevel(1, 'in')).toBe(1.5)
  })

  it('reset returns to level 0 from anywhere', () => {
    expect(nextZoomLevel(2.5, 'reset')).toBe(0)
    expect(nextZoomLevel(-2, 'reset')).toBe(0)
  })

  it('clamps at both ends of the supported range', () => {
    expect(nextZoomLevel(ZOOM_LEVEL_MAX, 'in')).toBe(ZOOM_LEVEL_MAX)
    expect(nextZoomLevel(ZOOM_LEVEL_MIN, 'out')).toBe(ZOOM_LEVEL_MIN)
  })
})

describe('clampZoomFactor', () => {
  it('passes through factors inside the range', () => {
    expect(clampZoomFactor(1)).toBe(1)
    expect(clampZoomFactor(1.2)).toBe(1.2)
  })

  it('clamps factors outside the level range', () => {
    expect(clampZoomFactor(10)).toBeCloseTo(Math.pow(1.2, ZOOM_LEVEL_MAX), 10)
    expect(clampZoomFactor(0.1)).toBeCloseTo(Math.pow(1.2, ZOOM_LEVEL_MIN), 10)
  })

  it('resets nonsense input to 1', () => {
    expect(clampZoomFactor(Number.NaN)).toBe(1)
    expect(clampZoomFactor(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampZoomFactor(0)).toBe(1)
    expect(clampZoomFactor(-2)).toBe(1)
  })
})
