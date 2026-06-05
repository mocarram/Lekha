import { type Schema } from 'prosemirror-model'
import { keymap } from 'prosemirror-keymap'
import { type Plugin, type Command } from 'prosemirror-state'
import { chainCommands } from 'prosemirror-commands'
import {
  splitListItem,
  sinkListItem,
  liftListItem,
} from 'prosemirror-schema-list'
import { goToNextCell } from 'prosemirror-tables'
import { editorCommandMap } from './editorCommands'

// ---------------------------------------------------------------------------
// keymapBindings
// ---------------------------------------------------------------------------

/**
 * Return the full keymap bindings record for Lekha.
 *
 * Inline mark toggles, block type setters, and history commands are sourced
 * from editorCommandMap so the menu/command path and keymap share ONE
 * implementation (DRY). Only the list-navigation bindings (Enter, Tab,
 * Shift-Tab) that chain across list_item and task_item live here because they
 * are structural key-handling concerns, not simple command wrappers.
 *
 * Exported separately so tests can call commands directly without a live view.
 */
export function keymapBindings(schema: Schema): Record<string, Command> {
  // Shared command implementations from editorCommandMap (single source of truth)
  const cmds = editorCommandMap(schema)

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
    // Inline mark toggles - pulled from editorCommandMap (shared with menu)
    'Mod-b': cmds.bold!,
    'Mod-i': cmds.italic!,
    'Mod-Shift-x': cmds.strikethrough!,
    'Mod-`': cmds.inlineCode!,

    // History - pulled from editorCommandMap (shared with menu)
    'Mod-z': cmds.undo!,
    'Mod-y': cmds.redo!,
    'Mod-Shift-z': cmds.redo!,

    // List navigation (chained across list_item and task_item)
    Enter: enterCmd,
    Tab: tabCmd,
    'Shift-Tab': shiftTabCmd,

    // Block type shortcuts: Mod-Alt-0 = paragraph, Mod-Alt-1..6 = headings
    // Also pulled from editorCommandMap (shared with menu)
    'Mod-Alt-0': cmds.paragraph!,
  }

  // Add Mod-Alt-1 through Mod-Alt-6 for heading levels
  for (let level = 1; level <= 6; level++) {
    bindings[`Mod-Alt-${level}`] = cmds[`heading${level}` as keyof typeof cmds]!
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
