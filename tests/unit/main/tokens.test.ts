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
