// @vitest-environment node
/**
 * Unit tests for isSafeExternalUrl - the scheme allowlist guarding
 * shell.openExternal so the renderer cannot ask main to open dangerous URLs
 * (file:, javascript:, etc.).
 */
import { describe, it, expect } from 'vitest'
import { isSafeExternalUrl } from '../../../src/main/openExternal'

describe('isSafeExternalUrl', () => {
  it('allows http URLs', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
  })

  it('allows https URLs', () => {
    expect(isSafeExternalUrl('https://example.com/path?q=1')).toBe(true)
  })

  it('allows mailto URLs', () => {
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true)
  })

  it('rejects file URLs', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects javascript URLs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects data URLs', () => {
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isSafeExternalUrl('')).toBe(false)
  })

  it('rejects a non-URL string', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })

  it('is case-insensitive about the scheme', () => {
    expect(isSafeExternalUrl('HTTPS://example.com')).toBe(true)
    expect(isSafeExternalUrl('JavaScript:alert(1)')).toBe(false)
  })
})
