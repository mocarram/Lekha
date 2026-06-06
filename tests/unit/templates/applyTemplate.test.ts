/**
 * Tests for the applyTemplate helper.
 *
 * applyTemplate(content, date) substitutes {{date}} with a formatted date
 * string. It is a pure function - no side effects, testable with fixed dates.
 */
import { describe, it, expect } from 'vitest'
import { applyTemplate } from '../../../src/renderer/templates/applyTemplate'

describe('applyTemplate', () => {
  it('replaces {{date}} with the formatted date string', () => {
    const date = new Date(2024, 0, 15) // 15 Jan 2024
    const result = applyTemplate('# {{date}}\n\nContent here.', date)
    expect(result).not.toContain('{{date}}')
    expect(result).toContain('2024')
  })

  it('replaces all occurrences of {{date}}', () => {
    const date = new Date(2024, 5, 3) // 3 Jun 2024
    const result = applyTemplate('# {{date}}\n\nUpdated: {{date}}', date)
    const remaining = (result.match(/\{\{date\}\}/g) ?? []).length
    expect(remaining).toBe(0)
  })

  it('formats the date as a human-readable string (YYYY-MM-DD)', () => {
    const date = new Date(2025, 11, 25) // 25 Dec 2025
    const result = applyTemplate('# {{date}}', date)
    // Should produce something like "2025-12-25"
    expect(result).toContain('2025-12-25')
  })

  it('returns content unchanged when there is no {{date}} placeholder', () => {
    const date = new Date(2024, 0, 1)
    const content = '# Static Title\n\nNo date here.'
    expect(applyTemplate(content, date)).toBe(content)
  })

  it('returns an empty string unchanged', () => {
    const date = new Date(2024, 0, 1)
    expect(applyTemplate('', date)).toBe('')
  })
})
