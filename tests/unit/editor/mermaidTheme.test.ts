/**
 * mermaidTheme.test.ts
 *
 * Tests the pure mermaidThemeFor mapper that drives mermaid's dark-mode sync.
 * mermaid itself is mocked so importing the module does not pull in the real
 * library (which would also run initialize() at load time).
 *
 * The full live re-render flow (applyTheme -> theme-change event -> re-init +
 * NodeView re-render) is exercised structurally by the editor; here we only
 * assert the data-theme -> mermaid theme mapping.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))

import { mermaidThemeFor } from '../../../src/renderer/editor/mermaid'

describe('mermaidThemeFor', () => {
  it('maps the dark app theme "night" to mermaid "dark"', () => {
    expect(mermaidThemeFor('night')).toBe('dark')
  })

  it('maps the dark app theme "graphite" to mermaid "dark"', () => {
    expect(mermaidThemeFor('graphite')).toBe('dark')
  })

  it('maps the dark themes "nord" and "solarized-dark" to mermaid "dark"', () => {
    expect(mermaidThemeFor('nord')).toBe('dark')
    expect(mermaidThemeFor('solarized-dark')).toBe('dark')
  })

  it('maps "github" to mermaid "default"', () => {
    expect(mermaidThemeFor('github')).toBe('default')
  })

  it('maps "sepia" to mermaid "default"', () => {
    expect(mermaidThemeFor('sepia')).toBe('default')
  })

  it('maps an unset (undefined) theme to mermaid "default"', () => {
    expect(mermaidThemeFor(undefined)).toBe('default')
  })

  it('maps an unknown theme id to mermaid "default"', () => {
    expect(mermaidThemeFor('solarized')).toBe('default')
  })
})
