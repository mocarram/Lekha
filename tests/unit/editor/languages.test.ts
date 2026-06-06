/**
 * languages.test.ts
 *
 * Tests for the languages helper module:
 *   - COMMON_LANGUAGES contains the expected curated set
 *   - availableLanguages() is sorted, deduped, and includes the common set
 *   - 'mermaid' and 'plaintext' are always included
 */

import { describe, it, expect } from 'vitest'
import { COMMON_LANGUAGES, availableLanguages } from '../../../src/renderer/editor/languages'

describe('COMMON_LANGUAGES', () => {
  it('includes core languages', () => {
    const required = ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'bash', 'json', 'yaml', 'html', 'css', 'sql', 'markdown', 'mermaid', 'plaintext']
    for (const lang of required) {
      expect(COMMON_LANGUAGES).toContain(lang)
    }
  })

  it('contains no duplicates', () => {
    expect(new Set(COMMON_LANGUAGES).size).toBe(COMMON_LANGUAGES.length)
  })
})

describe('availableLanguages()', () => {
  it('includes all COMMON_LANGUAGES', () => {
    const avail = availableLanguages()
    for (const lang of COMMON_LANGUAGES) {
      expect(avail).toContain(lang)
    }
  })

  it('includes javascript', () => {
    expect(availableLanguages()).toContain('javascript')
  })

  it('includes python', () => {
    expect(availableLanguages()).toContain('python')
  })

  it('includes mermaid', () => {
    expect(availableLanguages()).toContain('mermaid')
  })

  it('includes plaintext', () => {
    expect(availableLanguages()).toContain('plaintext')
  })

  it('is sorted alphabetically', () => {
    const avail = availableLanguages()
    const sorted = [...avail].sort((a, b) => a.localeCompare(b))
    expect(avail).toEqual(sorted)
  })

  it('has no duplicates', () => {
    const avail = availableLanguages()
    expect(new Set(avail).size).toBe(avail.length)
  })

  it('includes lowlight registered languages (e.g. typescript, go, rust)', () => {
    const avail = availableLanguages()
    // These come from lowlight/common and must be present
    expect(avail).toContain('typescript')
    expect(avail).toContain('go')
    expect(avail).toContain('rust')
  })

  it('is a non-empty array', () => {
    expect(availableLanguages().length).toBeGreaterThan(10)
  })
})
