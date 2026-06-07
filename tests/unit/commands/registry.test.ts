/**
 * Unit tests for the command registry (src/renderer/commands/registry.ts).
 *
 * The registry is the single source of truth for the labels + shortcut hints
 * shown in the command palette. Every entry must reference a real AppCommand,
 * carry a non-empty human label, and the list must exclude the two palette
 * entry-points (commandPalette / quickOpen) so the palette can never recurse
 * into itself.
 */
import { describe, it, expect } from 'vitest'
import { COMMANDS } from '../../../src/renderer/commands/registry'
import type { AppCommand } from '../../../src/shared/commands'

// The full set of valid AppCommand ids, kept here as a runtime check so a typo
// in the registry is caught by the type system AND the test.
const VALID_IDS: ReadonlySet<AppCommand> = new Set<AppCommand>([
  'new',
  'newWindow',
  'open',
  'openFolder',
  'save',
  'saveAs',
  'revertToSaved',
  'showInFinder',
  'revealInFileTree',
  'duplicateFile',
  'renameFile',
  'moveFileTo',
  'deleteFile',
  'print',
  'toggleSource',
  'toggleSidebar',
  'find',
  'replace',
  'bold',
  'italic',
  'strikethrough',
  'inlineCode',
  'underline',
  'highlight',
  'superscript',
  'subscript',
  'clearFormatting',
  'link',
  'insertImage',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'paragraph',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'undo',
  'redo',
  'exportHtml',
  'exportPdf',
  'exportDocx',
  'exportEpub',
  'exportRtf',
  'exportLatex',
  'exportOpml',
  'toggleFocusMode',
  'toggleTypewriterMode',
  'preferences',
  'copyAsHtml',
  'copyAsMarkdown',
  'commandPalette',
  'quickOpen',
  'presentation',
  'newFromTemplate',
])

describe('COMMANDS registry', () => {
  it('is non-empty', () => {
    expect(COMMANDS.length).toBeGreaterThan(0)
  })

  it('every entry references a valid AppCommand id', () => {
    for (const cmd of COMMANDS) {
      expect(VALID_IDS.has(cmd.id)).toBe(true)
    }
  })

  it('every entry has a non-empty label', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('has no duplicate ids', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('excludes commandPalette and quickOpen (no recursion)', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(ids).not.toContain('commandPalette')
    expect(ids).not.toContain('quickOpen')
  })

  it('covers the core user-facing commands', () => {
    const ids = new Set(COMMANDS.map((c) => c.id))
    for (const expected of [
      'save',
      'open',
      'bold',
      'italic',
      'heading1',
      'bulletList',
      'undo',
      'exportHtml',
      'preferences',
    ] as const) {
      expect(ids.has(expected)).toBe(true)
    }
  })
})
