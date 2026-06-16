/**
 * contextMenu.ts - Pure context-menu template builder.
 *
 * buildContextMenuTemplate is fully Electron-runtime-free: it accepts typed
 * params + callback functions and returns a MenuItemConstructorOptions array.
 * The Electron wiring (Menu.buildFromTemplate(...).popup(), webContents events)
 * lives in index.ts and is NOT tested here.
 *
 * Structure of the built menu:
 *   [Spell suggestions + "Add to Dictionary" + separator]  (only when misspelled)
 *   Cut / Copy / Paste / Select All
 *   separator
 *   Copy as Markdown / Copy as HTML
 *   separator
 *   Format > Bold / Italic / Strikethrough / Code / Link
 *   separator
 *   Insert > Link / Image
 */
import type { MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '@shared/commands'

// ---------------------------------------------------------------------------
// Parameter types (a minimal subset of Electron's ContextMenuParams)
// ---------------------------------------------------------------------------

/** Edit-flags subset that we actually use. */
export interface ContextEditFlags {
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
}

/**
 * The subset of Electron's ContextMenuParams that buildContextMenuTemplate
 * needs. Typed explicitly so there is no `any` leak.
 */
export interface ContextMenuParams {
  /** The currently misspelled word, or empty string when none. */
  misspelledWord: string
  /** Spell-checker suggestions (up to ~5 used). */
  dictionarySuggestions: string[]
  /** Edit-operation availability. */
  editFlags: ContextEditFlags
  /** Whether the clicked target is editable. */
  isEditable: boolean
  /** The user's current text selection. */
  selectionText: string
}

/** Callbacks injected by the caller; keep the template free of Electron runtime. */
export interface ContextMenuCallbacks {
  /** Called when the user picks a spell suggestion. */
  onReplace: (suggestion: string) => void
  /** Called when the user picks "Add to Dictionary". */
  onAddToDictionary: (word: string) => void
  /** Called when the user picks an app-command item. */
  send: (cmd: AppCommand) => void
}

// ---------------------------------------------------------------------------
// Max number of spell suggestions to show.
// ---------------------------------------------------------------------------

const MAX_SPELL_SUGGESTIONS = 5

// ---------------------------------------------------------------------------
// Helper: make a command item
// ---------------------------------------------------------------------------

function cmdItem(
  label: string,
  cmd: AppCommand,
  send: (cmd: AppCommand) => void,
): MenuItemConstructorOptions {
  return { label, click: () => { send(cmd) } }
}

const sep: MenuItemConstructorOptions = { type: 'separator' }

/**
 * Whether the native editor context menu should appear for a right-click.
 *
 * Only inside EDITABLE content (the ProseMirror / CodeMirror editor). Electron
 * emits 'context-menu' for every right-click in the window, so without this
 * gate the editor's Cut/Copy/Format menu also appeared on non-editor chrome
 * that has no menu of its own - notably the gap between the tab bar and the
 * editor. Surfaces with their own React menu (tabs, the window-color picker,
 * the file tree) already suppress the event via DOM preventDefault.
 */
export function shouldShowContextMenu(params: Pick<ContextMenuParams, 'isEditable'>): boolean {
  return params.isEditable
}

// ---------------------------------------------------------------------------
// buildContextMenuTemplate
// ---------------------------------------------------------------------------

/**
 * Build the right-click context menu template.
 *
 * Pure function: no Electron runtime imports, fully unit-testable.
 * The caller (index.ts) wraps the result in Menu.buildFromTemplate + .popup().
 *
 * @param params    Subset of Electron's ContextMenuParams.
 * @param callbacks Wired by the caller to live webContents/session methods.
 */
export function buildContextMenuTemplate(
  params: ContextMenuParams,
  callbacks: ContextMenuCallbacks,
): MenuItemConstructorOptions[] {
  const { misspelledWord, dictionarySuggestions, editFlags } = params
  const { onReplace, onAddToDictionary, send } = callbacks

  const items: MenuItemConstructorOptions[] = []

  // -------------------------------------------------------------------------
  // Spell suggestions (only when a misspelled word is present)
  // -------------------------------------------------------------------------
  if (misspelledWord.length > 0) {
    const suggestions = dictionarySuggestions.slice(0, MAX_SPELL_SUGGESTIONS)

    if (suggestions.length === 0) {
      items.push({ label: 'No Suggestions', enabled: false })
    } else {
      for (const suggestion of suggestions) {
        items.push({
          label: suggestion,
          click: () => { onReplace(suggestion) },
        })
      }
    }

    items.push({
      label: 'Add to Dictionary',
      click: () => { onAddToDictionary(misspelledWord) },
    })

    items.push(sep)
  }

  // -------------------------------------------------------------------------
  // Clipboard: Cut / Copy / Paste / Select All
  // -------------------------------------------------------------------------
  items.push({ role: 'cut',       enabled: editFlags.canCut  })
  items.push({ role: 'copy',      enabled: editFlags.canCopy })
  items.push({ role: 'paste',     enabled: editFlags.canPaste })
  items.push({ role: 'selectAll' })

  // -------------------------------------------------------------------------
  // Copy as Markdown / Copy as HTML
  // -------------------------------------------------------------------------
  items.push(sep)
  items.push(cmdItem('Copy as Markdown', 'copyAsMarkdown', send))
  items.push(cmdItem('Copy as HTML',     'copyAsHtml',     send))

  // -------------------------------------------------------------------------
  // Format submenu
  // -------------------------------------------------------------------------
  items.push(sep)
  items.push({
    label: 'Format',
    submenu: [
      cmdItem('Bold',          'bold',          send),
      cmdItem('Italic',        'italic',        send),
      cmdItem('Strikethrough', 'strikethrough', send),
      cmdItem('Code',          'inlineCode',    send),
      cmdItem('Link',          'link',          send),
    ],
  })

  // -------------------------------------------------------------------------
  // Insert submenu
  // -------------------------------------------------------------------------
  items.push({
    label: 'Insert',
    submenu: [
      cmdItem('Link',  'link',        send),
      cmdItem('Image', 'insertImage', send),
    ],
  })

  return items
}
