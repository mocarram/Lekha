import { type Schema } from 'prosemirror-model'
import { keymap } from 'prosemirror-keymap'
import { type Plugin, type Command } from 'prosemirror-state'
import { toggleMark, setBlockType, chainCommands } from 'prosemirror-commands'
import { undo, redo } from 'prosemirror-history'
import {
  splitListItem,
  sinkListItem,
  liftListItem,
} from 'prosemirror-schema-list'
import { goToNextCell } from 'prosemirror-tables'

// ---------------------------------------------------------------------------
// keymapBindings
// ---------------------------------------------------------------------------

/**
 * Return the full keymap bindings record for Lekha.
 * Exported separately so tests can call commands directly without a live view.
 */
export function keymapBindings(schema: Schema): Record<string, Command> {
  // List node types - both list_item and task_item get the same Enter/Tab/Shift-Tab
  const listItemType = schema.nodes['list_item']!
  const taskItemType = schema.nodes['task_item']!

  // DRY: chain the same command across both item types so one binding handles both.
  // Tab/Shift-Tab: try table-cell navigation first (goToNextCell), then fall
  // back to list indent/outdent. This lets Tab move between table cells while
  // still indenting list items outside a table context.
  const enterCmd = chainCommands(
    splitListItem(listItemType),
    splitListItem(taskItemType),
  )
  const tabCmd = chainCommands(
    goToNextCell(1),
    sinkListItem(listItemType),
    sinkListItem(taskItemType),
  )
  const shiftTabCmd = chainCommands(
    goToNextCell(-1),
    liftListItem(listItemType),
    liftListItem(taskItemType),
  )

  const bindings: Record<string, Command> = {
    // Inline mark toggles
    'Mod-b': toggleMark(schema.marks['strong']!),
    'Mod-i': toggleMark(schema.marks['em']!),
    'Mod-Shift-x': toggleMark(schema.marks['strikethrough']!),
    'Mod-`': toggleMark(schema.marks['code']!),

    // History
    'Mod-z': undo,
    'Mod-y': redo,
    'Mod-Shift-z': redo,

    // List navigation (chained across list_item and task_item)
    Enter: enterCmd,
    Tab: tabCmd,
    'Shift-Tab': shiftTabCmd,

    // Block type shortcuts: Mod-Alt-0 = paragraph, Mod-Alt-1..6 = headings
    'Mod-Alt-0': setBlockType(schema.nodes['paragraph']!),
  }

  // Add Mod-Alt-1 through Mod-Alt-6 for heading levels
  for (let level = 1; level <= 6; level++) {
    bindings[`Mod-Alt-${level}`] = setBlockType(schema.nodes['heading']!, {
      level,
    })
  }

  return bindings
}

// ---------------------------------------------------------------------------
// buildKeymap
// ---------------------------------------------------------------------------

/** Wrap the bindings record in a prosemirror-keymap plugin. */
export function buildKeymap(schema: Schema): Plugin {
  return keymap(keymapBindings(schema))
}
