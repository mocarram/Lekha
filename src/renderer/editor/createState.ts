import { EditorState } from 'prosemirror-state'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { history } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { tableEditing, columnResizing } from 'prosemirror-tables'
import { schema } from './schema'
import { parseMarkdown } from './parser'
import { buildInputRules } from './inputRules'
import { buildKeymap } from './keymap'
import { highlightPlugin } from './plugins/highlight'
import { findHighlightPlugin } from './plugins/findHighlight'
import { focusModePlugin } from './plugins/focusMode'
import { activeBlockPlugin } from './plugins/activeBlock'
import { typewriterPlugin } from './plugins/typewriter'
import { headingFoldPlugin } from './plugins/headingFold'
import { slashMenuPlugin } from './plugins/slashMenu'

/**
 * Create a fully-configured EditorState from a Markdown string.
 *
 * Plugin order (matters for event handling priority):
 *   1. buildInputRules   - inline/block input rule transforms
 *   1b. slashMenuPlugin  - `/` block-insert menu (swallows nav keys while open)
 *   2. buildKeymap       - Lekha-specific shortcuts (Mod-b, headings, lists...)
 *   3. keymap(baseKeymap)- prosemirror baseline (Enter, Backspace, etc.)
 *   4. dropCursor        - visual drop position indicator
 *   5. gapCursor         - keyboard navigation past un-enterable nodes
 *   6. history           - undo/redo (exactly once - no duplicate)
 *   7. columnResizing    - table column drag-to-resize (must precede tableEditing)
 *   8. tableEditing      - GFM table cell navigation and commands
 *   9. highlightPlugin   - syntax highlighting decorations for code blocks
 *  10. findHighlightPlugin - find/replace match decorations
 *  11. focusModePlugin   - node decoration marking the focused top-level block
 *  12. activeBlockPlugin - node decoration marking the active block (is-active-block)
 *  13. typewriterPlugin  - view lifecycle that centers the caret line on scroll
 *  14. headingFoldPlugin  - clickable heading chevrons + view-only section fold
 */
export function createEditorState(markdown: string): EditorState {
  return EditorState.create({
    doc: parseMarkdown(markdown),
    plugins: [
      buildInputRules(schema),
      // Slash menu BEFORE the keymaps: while the menu is open it must swallow
      // Arrow/Enter/Escape (handleKeyDown) before the editor's own bindings act.
      slashMenuPlugin(),
      buildKeymap(schema),
      keymap(baseKeymap),
      dropCursor(),
      gapCursor(),
      history(),
      columnResizing(),
      tableEditing(),
      highlightPlugin(),
      findHighlightPlugin(),
      focusModePlugin(),
      activeBlockPlugin(),
      typewriterPlugin(),
      headingFoldPlugin(),
    ],
  })
}
