/**
 * Contract tests for the design-token system (styles/tokens.css).
 *
 * These read the CSS files from disk (not via Vite ?raw, which is stubbed empty
 * in vitest) to lock the architecture: tokens.css is the single source of the
 * token contract, and github.css holds only component rules (no token blocks).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { DEFAULT_TEMPLATE_CSS } from '@main/themeTemplate'

const here = dirname(fileURLToPath(import.meta.url))
const stylesDir = resolve(here, '../../../src/renderer/styles')
const read = (p: string): string => readFileSync(resolve(stylesDir, p), 'utf8')

describe('tokens.css - the token contract', () => {
  const tokens = read('tokens.css')

  it('declares the Layer-1 palette primitives (--gh-*)', () => {
    expect(tokens).toContain('--gh-bg:')
    expect(tokens).toContain('--gh-link:')
    expect(tokens).toContain('--gh-hljs-keyword:')
  })

  it('declares the Layer-2 semantic tokens components consume', () => {
    for (const t of ['--bg:', '--surface:', '--text:', '--text-muted:', '--accent:', '--border:']) {
      expect(tokens).toContain(t)
    }
  })

  it('declares editor layout + font tokens', () => {
    expect(tokens).toContain('--editor-max-width:')
    expect(tokens).toContain('--editor-line-height:')
    expect(tokens).toContain('--font-ui:')
    expect(tokens).toContain('--font-editor:')
  })

  it('declares the component-scoped tokens moved out of github.css', () => {
    expect(tokens).toContain('--list-indent:')
    expect(tokens).toContain('--focus-dim:')
  })

  it('maps the legacy --color-* aliases onto Layer-2 tokens', () => {
    expect(tokens).toContain('--color-bg:')
    expect(tokens).toContain('var(--bg)')
  })
})

describe('github.css - component rules only (no token declarations)', () => {
  const github = read('themes/github.css')

  it('no longer references the --gh-* palette (tokens extracted)', () => {
    expect(github).not.toContain('--gh-')
  })

  it('no longer declares a :root token block', () => {
    expect(github).not.toContain(':root {')
  })

  it('still contains token-driven component rules', () => {
    expect(github).toContain('var(--bg)')
    expect(github).toContain('.title-bar')
  })
})

describe('global.css - structural skeleton only', () => {
  const global = read('global.css')

  it('no longer declares color/token :root values', () => {
    expect(global).not.toContain('--color-bg: #')
    expect(global).not.toContain('--font-ui: system-ui')
  })
})

describe('global.css - keyboard focus indicators (WCAG 2.4.7)', () => {
  const global = read('global.css')

  // Every interactive control flagged by the a11y audit must have a
  // :focus-visible rule so keyboard users get a visible focus ring.
  const focusables = [
    '.sidebar__tab-btn:focus-visible',
    '.status-bar__counts:focus-visible',
    '.status-bar__mode-btn:focus-visible',
    '.dialog-btn:focus-visible',
    '.outline__item:focus-visible',
    '.file-tree__row:focus-visible',
  ]
  for (const sel of focusables) {
    it(`defines ${sel}`, () => {
      expect(global).toContain(sel)
    })
  }
})

describe('DEFAULT_TEMPLATE_CSS - custom-theme starter (seeded into userData)', () => {
  // Imported from the main-process source of truth (seeded as _template.css).
  const template = DEFAULT_TEMPLATE_CSS

  it('scopes overrides to a [data-theme] selector (never :root, so it is inert)', () => {
    expect(template).toContain('[data-theme="my-theme"]')
    // No :root { rule - the template must never apply globally.
    expect(template).not.toMatch(/:root\s*\{/)
  })

  it('documents the metadata header (@name / @type)', () => {
    expect(template).toContain('@name')
    expect(template).toContain('@type')
  })

  it('lists the core overridable tokens so authors see them in one place', () => {
    for (const t of ['--bg:', '--text:', '--accent:', '--code-bg:', '--editor-max-width:']) {
      expect(template).toContain(t)
    }
  })
})

describe('built-in themes are token-only (no component selectors)', () => {
  const themeFiles = [
    'night', 'graphite', 'sepia', 'nord', 'solarized-light', 'solarized-dark',
  ]
  for (const name of themeFiles) {
    it(`${name}.css contains only [data-theme] token overrides`, () => {
      const css = read(`themes/${name}.css`)
      // Every rule block must be scoped to a [data-theme] selector: there must
      // be no bare component/class/element selectors leaking structural CSS.
      const ruleOpeners = css.match(/^[^@\s/}][^{]*\{/gm) ?? []
      for (const opener of ruleOpeners) {
        expect(opener).toContain('[data-theme')
      }
    })
  }
})
