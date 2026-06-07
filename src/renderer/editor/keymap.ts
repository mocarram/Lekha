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
import { undoInputRule } from 'prosemirror-inputrules'
import { editorCommandMap } from './editorCommands'
import { addRowOnTab } from './tableCommands'

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
    // In the last table cell, Tab appends a new row (WYSIWYG behavior).
    addRowOnTab,
    sinkListItem(listItemType),
    sinkListItem(taskItemType),
  )
  const shiftTabCmd = chainCommands(
    goToNextCell(-1),
    liftListItem(listItemType),
    liftListItem(taskItemType),
  )

  // Shift-Enter inserts a hard line break (WYSIWYG: soft newline within a block).
  const hardBreakType = schema.nodes['hard_break']
  const hardBreakCmd: Command = (state, dispatch) => {
    if (!hardBreakType) return false
    if (dispatch) {
      dispatch(
        state.tr.replaceSelectionWith(hardBreakType.create()).scrollIntoView(),
      )
    }
    return true
  }

  const bindings: Record<string, Command> = {
    // Inline mark toggles - pulled from editorCommandMap (shared with menu)
    'Mod-b': cmds.bold!,
    'Mod-i': cmds.italic!,
    'Mod-Shift-x': cmds.strikethrough!,
    'Mod-`': cmds.inlineCode!,
    'Mod-u': cmds.underline!,

    // History - pulled from editorCommandMap (shared with menu)
    'Mod-z': cmds.undo!,
    'Mod-y': cmds.redo!,
    'Mod-Shift-z': cmds.redo!,

    // List navigation (chained across list_item and task_item)
    Enter: enterCmd,
    Tab: tabCmd,
    'Shift-Tab': shiftTabCmd,

    // Hard line break (WYSIWYG parity)
    'Shift-Enter': hardBreakCmd,

    // Backspace first tries to undo a just-applied input rule (so e.g. typing
    // "# " then immediately Backspace restores the literal "# " instead of
    // leaving an empty heading). undoInputRule returns false when there is
    // nothing to revert, letting the base keymap handle a normal delete.
    Backspace: undoInputRule,

    // Block type shortcuts. WYSIWYG uses Cmd+1..6 for headings and Cmd+0 for
    // paragraph; we bind those as the primary shortcuts and keep Mod-Alt-0..6
    // as alternates (shared impl from editorCommandMap).
    'Mod-0': cmds.paragraph!,
    'Mod-Alt-0': cmds.paragraph!,

    // Indent / outdent list items (WYSIWYG: Cmd+] / Cmd+[). Shared impl from
    // editorCommandMap (chained sink/lift across list_item + task_item).
    'Mod-]': cmds.indent!,
    'Mod-[': cmds.outdent!,

    // Increase / decrease heading level (WYSIWYG: Cmd+Shift+= / Cmd+Shift+-).
    'Mod-Shift-=': cmds.increaseHeading!,
    'Mod-Shift--': cmds.decreaseHeading!,
  }

  // Add heading level shortcuts: Mod-1..6 (WYSIWYG) + Mod-Alt-1..6 (alternate).
  for (let level = 1; level <= 6; level++) {
    const cmd = cmds[`heading${level}` as keyof typeof cmds]!
    bindings[`Mod-${level}`] = cmd
    bindings[`Mod-Alt-${level}`] = cmd
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
