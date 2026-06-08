/**
 * Unit tests for the theme registry and applyTheme utility.
 *
 * These tests run in happy-dom (default vitest environment) so
 * document.documentElement is available.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  THEMES,
  applyTheme,
  applyCachedThemeEarly,
} from '../../../src/renderer/themes/index'

// ---------------------------------------------------------------------------
// Reset dataset.theme + the theme cache before every test so tests are isolated.
// ---------------------------------------------------------------------------

beforeEach(() => {
  delete document.documentElement.dataset['theme']
  localStorage.clear()
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

  it('includes graphite theme with label "Graphite"', () => {
    const t = THEMES.find((x) => x.id === 'graphite')
    expect(t).toBeDefined()
    expect(t!.label).toBe('Graphite')
  })

  it('includes sepia theme with label "Sepia"', () => {
    const sepia = THEMES.find((t) => t.id === 'sepia')
    expect(sepia).toBeDefined()
    expect(sepia!.label).toBe('Sepia')
  })

  it('includes solarized-light theme with label "Solarized Light"', () => {
    const t = THEMES.find((x) => x.id === 'solarized-light')
    expect(t).toBeDefined()
    expect(t!.label).toBe('Solarized Light')
  })

  it('includes solarized-dark theme with label "Solarized Dark"', () => {
    const t = THEMES.find((x) => x.id === 'solarized-dark')
    expect(t).toBeDefined()
    expect(t!.label).toBe('Solarized Dark')
  })

  it('includes nord theme with label "Nord"', () => {
    const t = THEMES.find((x) => x.id === 'nord')
    expect(t).toBeDefined()
    expect(t!.label).toBe('Nord')
  })

  it('includes high-contrast theme with label "High Contrast"', () => {
    const t = THEMES.find((x) => x.id === 'high-contrast')
    expect(t).toBeDefined()
    expect(t!.label).toBe('High Contrast')
    expect(t!.type).toBe('dark')
  })

  it('has at least 6 themes after adding the 3 new ones', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(6)
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

  it('sets data-theme="solarized-light" when called with "solarized-light"', () => {
    applyTheme('solarized-light')
    expect(document.documentElement.dataset['theme']).toBe('solarized-light')
  })

  it('sets data-theme="solarized-dark" when called with "solarized-dark"', () => {
    applyTheme('solarized-dark')
    expect(document.documentElement.dataset['theme']).toBe('solarized-dark')
  })

  it('sets data-theme="nord" when called with "nord"', () => {
    applyTheme('nord')
    expect(document.documentElement.dataset['theme']).toBe('nord')
  })

  it('sets data-theme="graphite" when called with "graphite"', () => {
    applyTheme('graphite')
    expect(document.documentElement.dataset['theme']).toBe('graphite')
  })

  it('sets data-theme="high-contrast" when called with "high-contrast"', () => {
    applyTheme('high-contrast')
    expect(document.documentElement.dataset['theme']).toBe('high-contrast')
  })
})

// ---------------------------------------------------------------------------
// Theme cache + early apply (FOUC avoidance)
// ---------------------------------------------------------------------------

describe('theme cache (applyCachedThemeEarly)', () => {
  it('applyTheme caches the resolved theme id in localStorage', () => {
    applyTheme('night')
    expect(localStorage.getItem('lekha:theme')).toBe('night')
  })

  it('caches the FALLBACK id when given an unknown theme', () => {
    applyTheme('does-not-exist')
    expect(document.documentElement.dataset['theme']).toBe('github')
    expect(localStorage.getItem('lekha:theme')).toBe('github')
  })

  it('applyCachedThemeEarly applies a cached built-in theme before render', () => {
    localStorage.setItem('lekha:theme', 'nord')
    applyCachedThemeEarly()
    expect(document.documentElement.dataset['theme']).toBe('nord')
  })

  it('applyCachedThemeEarly ignores an unknown cached id (no data-theme set)', () => {
    localStorage.setItem('lekha:theme', 'totally-unknown')
    applyCachedThemeEarly()
    expect(document.documentElement.dataset['theme']).toBeUndefined()
  })

  it('applyCachedThemeEarly is a no-op when nothing is cached', () => {
    applyCachedThemeEarly()
    expect(document.documentElement.dataset['theme']).toBeUndefined()
  })

  it('round-trips: applyTheme then applyCachedThemeEarly restores the same theme', () => {
    applyTheme('solarized-dark')
    delete document.documentElement.dataset['theme']
    applyCachedThemeEarly()
    expect(document.documentElement.dataset['theme']).toBe('solarized-dark')
  })
})
