/**
 * The afterSign notarization hook must be conditional: it notarizes only when
 * ALL three Apple credential env vars are present, and silently skips otherwise
 * (local builds, unsigned CI). This tests the pure gating function.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { shouldNotarize } = require('../../../build/notarize.cjs') as {
  shouldNotarize: (env: Record<string, string | undefined>) => boolean
}

describe('notarize hook gating (shouldNotarize)', () => {
  it('returns false when no credentials are set', () => {
    expect(shouldNotarize({})).toBe(false)
  })

  it('returns false when only some credentials are set', () => {
    expect(shouldNotarize({ APPLE_ID: 'a@b.c' })).toBe(false)
    expect(shouldNotarize({ APPLE_ID: 'a@b.c', APPLE_TEAM_ID: 'TEAM' })).toBe(false)
  })

  it('returns true only when all three credentials are present', () => {
    expect(
      shouldNotarize({
        APPLE_ID: 'a@b.c',
        APPLE_APP_SPECIFIC_PASSWORD: 'pw',
        APPLE_TEAM_ID: 'TEAM',
      }),
    ).toBe(true)
  })

  it('treats empty strings as missing', () => {
    expect(
      shouldNotarize({ APPLE_ID: '', APPLE_APP_SPECIFIC_PASSWORD: '', APPLE_TEAM_ID: '' }),
    ).toBe(false)
  })
})
