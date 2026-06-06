// @vitest-environment node
/**
 * Unit tests for isSafeExternalUrl - the scheme allowlist guarding
 * shell.openExternal so the renderer cannot ask main to open dangerous URLs
 * (file:, javascript:, etc.).
 */
import { describe, it, expect } from 'vitest'
import { isSafeExternalUrl, decideWindowOpen } from '../../../src/main/openExternal'

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

describe('decideWindowOpen', () => {
  it('ALWAYS denies the child window (never opens an in-app window)', () => {
    expect(decideWindowOpen('https://example.com').action).toBe('deny')
    expect(decideWindowOpen('javascript:alert(1)').action).toBe('deny')
    expect(decideWindowOpen('file:///etc/passwd').action).toBe('deny')
    expect(decideWindowOpen('').action).toBe('deny')
  })

  it('forwards safe http/https/mailto URLs to shell.openExternal', () => {
    expect(decideWindowOpen('https://example.com').openExternal).toBe(true)
    expect(decideWindowOpen('http://example.com').openExternal).toBe(true)
    expect(decideWindowOpen('mailto:a@b.com').openExternal).toBe(true)
  })

  it('does NOT open external for unsafe schemes', () => {
    expect(decideWindowOpen('javascript:alert(1)').openExternal).toBe(false)
    expect(decideWindowOpen('file:///etc/passwd').openExternal).toBe(false)
    expect(decideWindowOpen('data:text/html,<script>').openExternal).toBe(false)
    expect(decideWindowOpen('not a url').openExternal).toBe(false)
  })
})
