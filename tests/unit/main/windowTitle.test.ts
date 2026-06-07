import { describe, it, expect } from 'vitest'
import { formatWindowTitle } from '@main/windowTitle'

describe('formatWindowTitle', () => {
  it('macOS shows just the document name (native edited-dot handles dirty)', () => {
    expect(formatWindowTitle('notes.md', false, true)).toBe('notes.md')
    expect(formatWindowTitle('notes.md', true, true)).toBe('notes.md')
  })

  it('non-macOS prefixes "• " only when dirty', () => {
    expect(formatWindowTitle('notes.md', false, false)).toBe('notes.md')
    expect(formatWindowTitle('notes.md', true, false)).toBe('• notes.md')
  })
})
