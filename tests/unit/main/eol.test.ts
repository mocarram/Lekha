import { describe, it, expect } from 'vitest'
import { normalizeLineEndings, detectEol } from '../../../src/shared/eol'

describe('normalizeLineEndings', () => {
  it('collapses CRLF/CR to LF for "lf"', () => {
    expect(normalizeLineEndings('a\r\nb\rc\nd', 'lf')).toBe('a\nb\nc\nd')
  })
  it('converts LF to CRLF for "crlf"', () => {
    expect(normalizeLineEndings('a\nb\nc', 'crlf')).toBe('a\r\nb\r\nc')
  })
  it('is idempotent', () => {
    const lf = normalizeLineEndings('a\r\nb', 'lf')
    expect(normalizeLineEndings(lf, 'lf')).toBe(lf)
    const crlf = normalizeLineEndings('a\nb', 'crlf')
    expect(normalizeLineEndings(crlf, 'crlf')).toBe(crlf)
  })
})

describe('detectEol', () => {
  it('returns crlf when CRLF present, else lf', () => {
    expect(detectEol('a\r\nb')).toBe('crlf')
    expect(detectEol('a\nb')).toBe('lf')
    expect(detectEol('plain')).toBe('lf')
  })
})
