/**
 * Tests for the renderer-side user-theme injection + registry merge.
 *
 * Runs under happy-dom so document.head is available.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  escapeStyleCss,
  injectUserThemes,
  getAllThemes,
  applyTheme,
  THEMES,
} from '../../../src/renderer/themes/index'
import type { UserTheme } from '../../../src/shared/types'

const mk = (id: string, css: string, label = id): UserTheme => ({
  id,
  label,
  type: 'dark',
  css,
})

beforeEach(() => {
  // Reset injected styles + theme attribute between tests.
  document.head.querySelectorAll('style[data-user-themes]').forEach((el) => el.remove())
  injectUserThemes([])
  delete document.documentElement.dataset['theme']
})

describe('escapeStyleCss', () => {
  it('neutralizes a closing </style> tag (any case)', () => {
    expect(escapeStyleCss('a</style>b')).toBe('a<\\/style>b')
    expect(escapeStyleCss('a</STYLE>b')).toBe('a<\\/STYLE>b')
  })
  it('leaves ordinary CSS untouched', () => {
    expect(escapeStyleCss('[data-theme="x"]{--bg:#000}')).toBe('[data-theme="x"]{--bg:#000}')
  })
})

describe('injectUserThemes', () => {
  it('creates one managed <style data-user-themes> with all themes', () => {
    injectUserThemes([
      mk('abyss', '[data-theme="abyss"]{--bg:#000}'),
      mk('zen', '[data-theme="zen"]{--bg:#fff}'),
    ])
    const styles = document.head.querySelectorAll('style[data-user-themes]')
    expect(styles).toHaveLength(1)
    const text = styles[0]!.textContent ?? ''
    expect(text).toContain('[data-theme="abyss"]')
    expect(text).toContain('[data-theme="zen"]')
  })

  it('replaces (not appends) on a second call - still one element', () => {
    injectUserThemes([mk('abyss', '[data-theme="abyss"]{--bg:#000}')])
    injectUserThemes([mk('zen', '[data-theme="zen"]{--bg:#fff}')])
    const styles = document.head.querySelectorAll('style[data-user-themes]')
    expect(styles).toHaveLength(1)
    const text = styles[0]!.textContent ?? ''
    expect(text).toContain('[data-theme="zen"]')
    expect(text).not.toContain('[data-theme="abyss"]')
  })

  it('escapes </style> in the injected CSS', () => {
    injectUserThemes([mk('evil', '[data-theme="evil"]{}</style><script>x</script>')])
    const text = document.head.querySelector('style[data-user-themes]')!.textContent ?? ''
    expect(text).not.toContain('</style>')
    expect(text).toContain('<\\/style>')
  })
})

describe('applyTheme with user themes', () => {
  it('accepts an injected user theme id', () => {
    injectUserThemes([mk('abyss', '[data-theme="abyss"]{}')])
    applyTheme('abyss')
    expect(document.documentElement.dataset['theme']).toBe('abyss')
  })

  it('falls back to github for an unknown (or removed) id', () => {
    injectUserThemes([mk('abyss', '[data-theme="abyss"]{}')])
    applyTheme('abyss')
    injectUserThemes([]) // abyss removed
    applyTheme('abyss')
    expect(document.documentElement.dataset['theme']).toBe('github')
  })

  it('still accepts built-in theme ids', () => {
    applyTheme('night')
    expect(document.documentElement.dataset['theme']).toBe('night')
  })
})

describe('getAllThemes', () => {
  it('appends user themes after the built-ins', () => {
    const merged = getAllThemes([mk('abyss', '', 'Abyss')])
    expect(merged.slice(0, THEMES.length)).toEqual(THEMES)
    expect(merged.at(-1)).toEqual({ id: 'abyss', label: 'Abyss' })
  })
})
