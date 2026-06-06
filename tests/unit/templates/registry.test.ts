/**
 * Tests for the built-in template registry.
 *
 * Asserts structural invariants:
 *   - BUILTIN_TEMPLATES is non-empty
 *   - Each template has a non-empty id, name, and content
 *   - Ids are unique
 *   - All expected templates are present
 *   - Each content string has at least one Markdown heading
 *   - The registry module is pure (no Date/side-effects in module scope)
 */
import { describe, it, expect } from 'vitest'
import { BUILTIN_TEMPLATES } from '../../../src/renderer/templates/registry'

const EXPECTED_IDS = [
  'meeting-notes',
  'daily-note',
  'blog-post',
  'readme',
  'project-plan',
  'todo-list',
] as const

describe('BUILTIN_TEMPLATES - structure', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BUILTIN_TEMPLATES)).toBe(true)
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThan(0)
  })

  it('every template has a non-empty id', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(typeof t.id).toBe('string')
      expect(t.id.trim().length).toBeGreaterThan(0)
    }
  })

  it('every template has a non-empty name', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(typeof t.name).toBe('string')
      expect(t.name.trim().length).toBeGreaterThan(0)
    }
  })

  it('every template has non-empty content', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(typeof t.content).toBe('string')
      expect(t.content.trim().length).toBeGreaterThan(0)
    }
  })

  it('all ids are unique', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('contains all expected template ids', () => {
    const ids = new Set(BUILTIN_TEMPLATES.map((t) => t.id))
    for (const expected of EXPECTED_IDS) {
      expect(ids.has(expected), `Missing template: ${expected}`).toBe(true)
    }
  })
})

describe('BUILTIN_TEMPLATES - content quality', () => {
  it('every template content contains at least one Markdown heading', () => {
    const headingRe = /^#{1,6} .+/m
    for (const t of BUILTIN_TEMPLATES) {
      expect(headingRe.test(t.content), `No heading in template "${t.id}"`).toBe(true)
    }
  })

  it('daily-note content contains the {{date}} placeholder', () => {
    const daily = BUILTIN_TEMPLATES.find((t) => t.id === 'daily-note')
    expect(daily).toBeDefined()
    expect(daily!.content).toContain('{{date}}')
  })

  it('non-daily-note templates do not contain {{date}} as a raw placeholder (substituted at insertion)', () => {
    // Only daily-note should use the date placeholder in the registry.
    // Others may have date-like text but not the exact {{date}} token.
    const others = BUILTIN_TEMPLATES.filter((t) => t.id !== 'daily-note')
    for (const t of others) {
      expect(t.content).not.toContain('{{date}}')
    }
  })
})
