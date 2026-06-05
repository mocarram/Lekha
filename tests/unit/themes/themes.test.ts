/**
 * Unit tests for the theme registry and applyTheme utility.
 *
 * These tests run in happy-dom (default vitest environment) so
 * document.documentElement is available.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { THEMES, applyTheme } from '../../../src/renderer/themes/index'

// ---------------------------------------------------------------------------
// Reset dataset.theme before every test so tests are isolated.
// ---------------------------------------------------------------------------

beforeEach(() => {
  delete document.documentElement.dataset['theme']
})

// ---------------------------------------------------------------------------
// THEMES registry
// ---------------------------------------------------------------------------

describe('THEMES registry', () => {
  it('exports a non-empty array', () => {
    expect(Array.isArray(THEMES)).toBe(true)
    expect(THEMES.length).toBeGreaterThanOrEqual(3)
  })

  it('includes github theme with label "GitHub"', () => {
    const github = THEMES.find((t) => t.id === 'github')
    expect(github).toBeDefined()
    expect(github!.label).toBe('GitHub')
  })

  it('includes night theme with label "Night"', () => {
    const night = THEMES.find((t) => t.id === 'night')
    expect(night).toBeDefined()
    expect(night!.label).toBe('Night')
  })

  it('includes sepia theme with label "Sepia"', () => {
    const sepia = THEMES.find((t) => t.id === 'sepia')
    expect(sepia).toBeDefined()
    expect(sepia!.label).toBe('Sepia')
  })

  it('every theme has a non-empty id and label', () => {
    for (const theme of THEMES) {
      expect(typeof theme.id).toBe('string')
      expect(theme.id.length).toBeGreaterThan(0)
      expect(typeof theme.label).toBe('string')
      expect(theme.label.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// applyTheme
// ---------------------------------------------------------------------------

describe('applyTheme', () => {
  it('sets data-theme="night" when called with "night"', () => {
    applyTheme('night')
    expect(document.documentElement.dataset['theme']).toBe('night')
  })

  it('sets data-theme="sepia" when called with "sepia"', () => {
    applyTheme('sepia')
    expect(document.documentElement.dataset['theme']).toBe('sepia')
  })

  it('sets data-theme="github" when called with "github"', () => {
    // github is the default but we still track it explicitly so the
    // menu radio state has a reliable "current" value.
    applyTheme('github')
    expect(document.documentElement.dataset['theme']).toBe('github')
  })

  it('falls back to "github" for an unknown id', () => {
    applyTheme('unknown-theme-xyz')
    expect(document.documentElement.dataset['theme']).toBe('github')
  })

  it('switching from night to github updates the attribute', () => {
    applyTheme('night')
    expect(document.documentElement.dataset['theme']).toBe('night')
    applyTheme('github')
    expect(document.documentElement.dataset['theme']).toBe('github')
  })

  it('switching from sepia to night updates the attribute', () => {
    applyTheme('sepia')
    applyTheme('night')
    expect(document.documentElement.dataset['theme']).toBe('night')
  })
})
