/**
 * Unit tests for the pure update-channel + version helpers.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeChannel,
  parseVersion,
  isNewerVersion,
  DEFAULT_UPDATE_CHANNEL,
} from '../../../src/shared/updateChannel'

describe('normalizeChannel', () => {
  it('accepts the direct channel', () => {
    expect(normalizeChannel('direct')).toBe('direct')
  })

  it('falls back to the default for anything else', () => {
    expect(normalizeChannel('homebrew')).toBe('homebrew')
    expect(normalizeChannel('')).toBe(DEFAULT_UPDATE_CHANNEL)
    expect(normalizeChannel(undefined)).toBe(DEFAULT_UPDATE_CHANNEL)
    expect(normalizeChannel('nonsense')).toBe(DEFAULT_UPDATE_CHANNEL)
    expect(normalizeChannel(42)).toBe(DEFAULT_UPDATE_CHANNEL)
  })

  it('defaults to homebrew (the unsigned cask channel)', () => {
    expect(DEFAULT_UPDATE_CHANNEL).toBe('homebrew')
  })
})

describe('parseVersion', () => {
  it('parses plain and v-prefixed versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('v0.1.0')).toEqual([0, 1, 0])
    expect(parseVersion('V2.0.0')).toEqual([2, 0, 0])
  })

  it('ignores pre-release / build suffixes and tolerates missing parts', () => {
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3])
    expect(parseVersion('1.2.3+build.5')).toEqual([1, 2, 3])
    expect(parseVersion('1.2')).toEqual([1, 2, 0])
    expect(parseVersion('1')).toEqual([1, 0, 0])
    expect(parseVersion('garbage')).toEqual([0, 0, 0])
  })
})

describe('isNewerVersion', () => {
  it('detects a strictly newer release at each level', () => {
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.1.9')).toBe(true)
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true)
    expect(isNewerVersion('v0.1.1', '0.1.0')).toBe(true)
  })

  it('is false for equal or older versions', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false)
    expect(isNewerVersion('0.9.9', '1.0.0')).toBe(false)
  })

  it('treats a pre-release of the same release as not newer', () => {
    expect(isNewerVersion('1.2.3-rc.1', '1.2.3')).toBe(false)
  })
})
