/**
 * Unit tests for the pure window-color helpers.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeWindowColor,
  WINDOW_COLOR_SWATCHES,
} from '../../../src/shared/windowColor'

describe('normalizeWindowColor', () => {
  it('accepts and lowercases a #rrggbb hex', () => {
    expect(normalizeWindowColor('#3B82F6')).toBe('#3b82f6')
    expect(normalizeWindowColor('  #0D9488  ')).toBe('#0d9488')
  })

  it('expands a #rgb shorthand to #rrggbb', () => {
    expect(normalizeWindowColor('#f00')).toBe('#ff0000')
    expect(normalizeWindowColor('#abc')).toBe('#aabbcc')
  })

  it('rejects malformed / empty / non-string values as null', () => {
    expect(normalizeWindowColor('')).toBeNull()
    expect(normalizeWindowColor('red')).toBeNull()
    expect(normalizeWindowColor('#12')).toBeNull()
    expect(normalizeWindowColor('#1234567')).toBeNull()
    expect(normalizeWindowColor('3b82f6')).toBeNull()
    expect(normalizeWindowColor(null)).toBeNull()
    expect(normalizeWindowColor(undefined)).toBeNull()
    expect(normalizeWindowColor(0x3b82f6)).toBeNull()
  })
})

describe('WINDOW_COLOR_SWATCHES', () => {
  it('is a non-empty palette of unique, valid, normalized hexes', () => {
    expect(WINDOW_COLOR_SWATCHES.length).toBeGreaterThan(0)
    const hexes = WINDOW_COLOR_SWATCHES.map((s) => s.hex)
    expect(new Set(hexes).size).toBe(hexes.length)
    for (const s of WINDOW_COLOR_SWATCHES) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(normalizeWindowColor(s.hex)).toBe(s.hex)
    }
  })
})
