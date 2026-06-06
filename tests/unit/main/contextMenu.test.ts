// @vitest-environment node
/**
 * Tests for buildContextMenuTemplate.
 *
 * The template builder is Electron-runtime-free (type-only imports) so it
 * runs in a plain Node vitest environment without mocking Electron.
 */
import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildContextMenuTemplate } from '../../../src/main/contextMenu'
import type {
  ContextMenuParams,
  ContextMenuCallbacks,
} from '../../../src/main/contextMenu'
import type { AppCommand } from '../../../src/shared/commands'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(overrides: Partial<ContextMenuParams> = {}): ContextMenuParams {
  return {
    misspelledWord: '',
    dictionarySuggestions: [],
    editFlags: { canCut: true, canCopy: true, canPaste: true },
    isEditable: true,
    selectionText: '',
    ...overrides,
  }
}

interface MockCallbacks {
  onReplace: ReturnType<typeof vi.fn<(suggestion: string) => void>>
  onAddToDictionary: ReturnType<typeof vi.fn<(word: string) => void>>
  send: ReturnType<typeof vi.fn<(cmd: AppCommand) => void>>
}

function makeCallbacks(overrides: Partial<ContextMenuCallbacks> = {}): MockCallbacks {
  return {
    onReplace: vi.fn<(suggestion: string) => void>(),
    onAddToDictionary: vi.fn<(word: string) => void>(),
    send: vi.fn<(cmd: AppCommand) => void>(),
    ...overrides,
  } as MockCallbacks
}

/**
 * Recursively walk a template and collect all leaf items (no submenu).
 */
function flattenItems(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  const result: MenuItemConstructorOptions[] = []
  for (const item of items) {
    if (item.submenu && Array.isArray(item.submenu)) {
      result.push(...flattenItems(item.submenu))
    } else {
      result.push(item)
    }
  }
  return result
}

/**
 * Recursively find the first item matching a predicate.
 */
function findItem(
  items: MenuItemConstructorOptions[],
  predicate: (item: MenuItemConstructorOptions) => boolean,
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (predicate(item)) return item
    if (item.submenu && Array.isArray(item.submenu)) {
      const found = findItem(item.submenu, predicate)
      if (found) return found
    }
  }
  return undefined
}

/** Safe click helper - calls click() with no args (handlers don't use Electron args). */
function clickItem(item: MenuItemConstructorOptions): void {
  if (item.click) {
    // @ts-expect-error calling with no args is safe; our handlers ignore Electron args
    item.click()
  }
}

// ---------------------------------------------------------------------------
// Spell suggestions
// ---------------------------------------------------------------------------

describe('buildContextMenuTemplate - spell suggestions', () => {
  it('shows suggestions when misspelledWord is present', () => {
    const params = makeParams({
      misspelledWord: 'helllo',
      dictionarySuggestions: ['hello', 'hell', 'helo'],
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const labels = flattenItems(template).map((i) => i.label)
    expect(labels).toContain('hello')
    expect(labels).toContain('hell')
    expect(labels).toContain('helo')
  })

  it('clicking a suggestion calls onReplace with that suggestion', () => {
    const params = makeParams({
      misspelledWord: 'teh',
      dictionarySuggestions: ['the', 'ten'],
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const suggestion = findItem(template, (i) => i.label === 'the')
    expect(suggestion).toBeDefined()
    clickItem(suggestion!)
    expect(callbacks.onReplace).toHaveBeenCalledWith('the')
  })

  it('clicking a second suggestion calls onReplace with the correct value', () => {
    const params = makeParams({
      misspelledWord: 'teh',
      dictionarySuggestions: ['the', 'ten'],
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const suggestion = findItem(template, (i) => i.label === 'ten')
    expect(suggestion).toBeDefined()
    clickItem(suggestion!)
    expect(callbacks.onReplace).toHaveBeenCalledWith('ten')
  })

  it('shows "Add to Dictionary" when misspelledWord is present', () => {
    const params = makeParams({
      misspelledWord: 'teh',
      dictionarySuggestions: ['the'],
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const addItem = findItem(template, (i) => i.label === 'Add to Dictionary')
    expect(addItem).toBeDefined()
  })

  it('clicking "Add to Dictionary" calls onAddToDictionary with the misspelled word', () => {
    const word = 'helllo'
    const params = makeParams({
      misspelledWord: word,
      dictionarySuggestions: ['hello'],
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const addItem = findItem(template, (i) => i.label === 'Add to Dictionary')
    expect(addItem).toBeDefined()
    clickItem(addItem!)
    expect(callbacks.onAddToDictionary).toHaveBeenCalledWith(word)
  })

  it('caps suggestions at 5', () => {
    const params = makeParams({
      misspelledWord: 'wrrd',
      dictionarySuggestions: ['word', 'ward', 'werd', 'wrod', 'wrd', 'extra'],
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const leaves = flattenItems(template)
    const suggestionItems = leaves.filter(
      (i) => i.label !== 'Add to Dictionary' && !i.role && i.type !== 'separator',
    )
    // Only count items that are likely spell suggestions (not menu commands)
    const knownSuggestions = ['word', 'ward', 'werd', 'wrod', 'wrd']
    const shownSuggestions = suggestionItems.filter((i) => knownSuggestions.includes(i.label ?? ''))
    expect(shownSuggestions).toHaveLength(5)
    const extraItem = findItem(template, (i) => i.label === 'extra')
    expect(extraItem).toBeUndefined()
  })

  it('shows "No Suggestions" when misspelledWord exists but no suggestions available', () => {
    const params = makeParams({
      misspelledWord: 'xyzzy',
      dictionarySuggestions: [],
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const noSugg = findItem(template, (i) => i.label === 'No Suggestions')
    expect(noSugg).toBeDefined()
    expect(noSugg?.enabled).toBe(false)
  })

  it('does NOT show suggestions section when misspelledWord is empty', () => {
    const params = makeParams({ misspelledWord: '', dictionarySuggestions: ['hello'] })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const addItem = findItem(template, (i) => i.label === 'Add to Dictionary')
    expect(addItem).toBeUndefined()
    const noSugg = findItem(template, (i) => i.label === 'No Suggestions')
    expect(noSugg).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Clipboard roles
// ---------------------------------------------------------------------------

describe('buildContextMenuTemplate - clipboard roles', () => {
  it('includes Cut, Copy, Paste, and Select All role items', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const roles = template.filter((i) => i.role).map((i) => i.role)
    expect(roles).toContain('cut')
    expect(roles).toContain('copy')
    expect(roles).toContain('paste')
    expect(roles).toContain('selectAll')
  })

  it('Cut is disabled when editFlags.canCut is false', () => {
    const params = makeParams({
      editFlags: { canCut: false, canCopy: true, canPaste: true },
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const cutItem = template.find((i) => i.role === 'cut')
    expect(cutItem?.enabled).toBe(false)
  })

  it('Copy is disabled when editFlags.canCopy is false', () => {
    const params = makeParams({
      editFlags: { canCut: true, canCopy: false, canPaste: true },
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const copyItem = template.find((i) => i.role === 'copy')
    expect(copyItem?.enabled).toBe(false)
  })

  it('Paste is disabled when editFlags.canPaste is false', () => {
    const params = makeParams({
      editFlags: { canCut: true, canCopy: true, canPaste: false },
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const pasteItem = template.find((i) => i.role === 'paste')
    expect(pasteItem?.enabled).toBe(false)
  })

  it('Cut/Copy/Paste are enabled when editFlags allow them', () => {
    const params = makeParams({
      editFlags: { canCut: true, canCopy: true, canPaste: true },
    })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const cutItem = template.find((i) => i.role === 'cut')
    const copyItem = template.find((i) => i.role === 'copy')
    const pasteItem = template.find((i) => i.role === 'paste')
    expect(cutItem?.enabled).toBe(true)
    expect(copyItem?.enabled).toBe(true)
    expect(pasteItem?.enabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Copy as Markdown / Copy as HTML
// ---------------------------------------------------------------------------

describe('buildContextMenuTemplate - copy as Markdown / HTML', () => {
  it('includes "Copy as Markdown" item', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const item = findItem(template, (i) => i.label === 'Copy as Markdown')
    expect(item).toBeDefined()
  })

  it('includes "Copy as HTML" item', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const item = findItem(template, (i) => i.label === 'Copy as HTML')
    expect(item).toBeDefined()
  })

  it('clicking "Copy as Markdown" calls send("copyAsMarkdown")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const item = findItem(template, (i) => i.label === 'Copy as Markdown')
    expect(item).toBeDefined()
    clickItem(item!)
    expect(callbacks.send).toHaveBeenCalledWith('copyAsMarkdown')
  })

  it('clicking "Copy as HTML" calls send("copyAsHtml")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const item = findItem(template, (i) => i.label === 'Copy as HTML')
    expect(item).toBeDefined()
    clickItem(item!)
    expect(callbacks.send).toHaveBeenCalledWith('copyAsHtml')
  })
})

// ---------------------------------------------------------------------------
// Format submenu
// ---------------------------------------------------------------------------

describe('buildContextMenuTemplate - Format submenu', () => {
  it('includes a Format submenu', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const formatMenu = template.find((i) => i.label === 'Format')
    expect(formatMenu).toBeDefined()
    expect(Array.isArray(formatMenu?.submenu)).toBe(true)
  })

  it('Format submenu contains Bold, Italic, Strikethrough, Code, Link', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const formatMenu = template.find((i) => i.label === 'Format')
    const items = formatMenu!.submenu as MenuItemConstructorOptions[]
    const labels = items.map((i) => i.label)
    expect(labels).toContain('Bold')
    expect(labels).toContain('Italic')
    expect(labels).toContain('Strikethrough')
    expect(labels).toContain('Code')
    expect(labels).toContain('Link')
  })

  it('clicking Format > Bold calls send("bold")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const boldItem = findItem(template, (i) => i.label === 'Bold')
    expect(boldItem).toBeDefined()
    clickItem(boldItem!)
    expect(callbacks.send).toHaveBeenCalledWith('bold')
  })

  it('clicking Format > Italic calls send("italic")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const item = findItem(template, (i) => i.label === 'Italic')
    expect(item).toBeDefined()
    clickItem(item!)
    expect(callbacks.send).toHaveBeenCalledWith('italic')
  })

  it('clicking Format > Strikethrough calls send("strikethrough")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const item = findItem(template, (i) => i.label === 'Strikethrough')
    expect(item).toBeDefined()
    clickItem(item!)
    expect(callbacks.send).toHaveBeenCalledWith('strikethrough')
  })

  it('clicking Format > Code calls send("inlineCode")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const item = findItem(template, (i) => i.label === 'Code')
    expect(item).toBeDefined()
    clickItem(item!)
    expect(callbacks.send).toHaveBeenCalledWith('inlineCode')
  })
})

// ---------------------------------------------------------------------------
// Insert submenu
// ---------------------------------------------------------------------------

describe('buildContextMenuTemplate - Insert submenu', () => {
  it('includes an Insert submenu', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const insertMenu = template.find((i) => i.label === 'Insert')
    expect(insertMenu).toBeDefined()
    expect(Array.isArray(insertMenu?.submenu)).toBe(true)
  })

  it('Insert submenu contains Link and Image', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const insertMenu = template.find((i) => i.label === 'Insert')
    const items = insertMenu!.submenu as MenuItemConstructorOptions[]
    const labels = items.map((i) => i.label)
    expect(labels).toContain('Link')
    expect(labels).toContain('Image')
  })

  it('clicking Insert > Link calls send("link")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    // Insert submenu's Link - find in Insert specifically
    const insertMenu = template.find((i) => i.label === 'Insert')
    const items = insertMenu!.submenu as MenuItemConstructorOptions[]
    const linkItem = items.find((i) => i.label === 'Link')
    expect(linkItem).toBeDefined()
    clickItem(linkItem!)
    expect(callbacks.send).toHaveBeenCalledWith('link')
  })

  it('clicking Insert > Image calls send("insertImage")', () => {
    const params = makeParams()
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const insertMenu = template.find((i) => i.label === 'Insert')
    const items = insertMenu!.submenu as MenuItemConstructorOptions[]
    const imageItem = items.find((i) => i.label === 'Image')
    expect(imageItem).toBeDefined()
    clickItem(imageItem!)
    expect(callbacks.send).toHaveBeenCalledWith('insertImage')
  })
})

// ---------------------------------------------------------------------------
// No misspelled word: no spell section
// ---------------------------------------------------------------------------

describe('buildContextMenuTemplate - no misspelled word', () => {
  it('does not call onReplace or onAddToDictionary when no misspelled word', () => {
    const params = makeParams({ misspelledWord: '' })
    const callbacks = makeCallbacks()
    buildContextMenuTemplate(params, callbacks)
    expect(callbacks.onReplace).not.toHaveBeenCalled()
    expect(callbacks.onAddToDictionary).not.toHaveBeenCalled()
  })

  it('includes clipboard and format items even with no misspelled word', () => {
    const params = makeParams({ misspelledWord: '' })
    const callbacks = makeCallbacks()
    const template = buildContextMenuTemplate(params, callbacks)
    const roles = template.filter((i) => i.role).map((i) => i.role)
    expect(roles).toContain('copy')
    expect(roles).toContain('paste')
    const boldItem = findItem(template, (i) => i.label === 'Bold')
    expect(boldItem).toBeDefined()
  })
})
