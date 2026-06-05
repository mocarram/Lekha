/**
 * editorCommands.ts
 *
 * Canonical source of truth for all editor-affecting ProseMirror command
 * builders. Both keymapBindings and EditorView.runCommand (triggered by the
 * native menu / useCommands hook) consume the same map so there is ONE place
 * to add, change, or remove a command.
 */
import { type Schema } from 'prosemirror-model'
import { type Command } from 'prosemirror-state'
import { toggleMark, setBlockType, wrapIn } from 'prosemirror-commands'
import { undo, redo } from 'prosemirror-history'
import { wrapInList } from 'prosemirror-schema-list'
import type { AppCommand } from '@shared/commands'

// ---------------------------------------------------------------------------
// horizontalRule helper
// ---------------------------------------------------------------------------

/**
 * Build a command that inserts a horizontal_rule node after the current
 * selection. Falls back to inserting before if the position is at the end.
 */
function insertHorizontalRule(schema: Schema): Command {
  return (state, dispatch) => {
    const hrType = schema.nodes['horizontal_rule']
    if (!hrType) return false
    if (dispatch) {
      // Replace the selection with the hr node then move cursor past it.
      dispatch(state.tr.replaceSelectionWith(hrType.create()).scrollIntoView())
    }
    return true
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a partial map from AppCommand to ProseMirror Command for all
 * editor-affecting commands.
 *
 * Commands that are handled elsewhere (file ops, sidebar, find/replace,
 * mode toggle) are intentionally absent - the caller (useCommands) routes
 * those independently.
 *
 * link: a simple toggleMark with an empty href placeholder is provided.
 * A richer link dialog is planned for a later task (M13). The command is
 * commented as provisional.
 */
export function editorCommandMap(schema: Schema): Partial<Record<AppCommand, Command>> {
  // -------------------------------------------------------------------------
  // Inline mark toggles
  // -------------------------------------------------------------------------
  const bold = toggleMark(schema.marks['strong']!)
  const italic = toggleMark(schema.marks['em']!)
  const strikethrough = toggleMark(schema.marks['strikethrough']!)
  const inlineCode = toggleMark(schema.marks['code']!)

  // link: provisional - toggles the link mark with an empty href.
  // A proper dialog-based flow is deferred to the find/replace task (M13).
  const link = toggleMark(schema.marks['link']!, { href: '' })

  // -------------------------------------------------------------------------
  // Block type setters
  // -------------------------------------------------------------------------
  const paragraph = setBlockType(schema.nodes['paragraph']!)
  const codeBlock = setBlockType(schema.nodes['code_block']!)

  // Heading levels 1-6 share the same heading node type; only the attr differs.
  const heading = (level: number): Command =>
    setBlockType(schema.nodes['heading']!, { level })

  // -------------------------------------------------------------------------
  // Wrap commands (list / blockquote)
  // -------------------------------------------------------------------------
  const bulletList = wrapInList(schema.nodes['bullet_list']!)
  const orderedList = wrapInList(schema.nodes['ordered_list']!)
  const blockquote = wrapIn(schema.nodes['blockquote']!)

  // taskList: wrap in task_list. The task_list node accepts (task_item | list_item)+
  // so the newly wrapped items will be plain list_items initially (correct for
  // a basic toggle; a richer UX converting items to task_items is future work).
  const taskList = wrapInList(schema.nodes['task_list']!)

  // -------------------------------------------------------------------------
  // Horizontal rule
  // -------------------------------------------------------------------------
  const horizontalRule = insertHorizontalRule(schema)

  return {
    // Marks
    bold,
    italic,
    strikethrough,
    inlineCode,
    link, // provisional - see comment above

    // Block types
    paragraph,
    codeBlock,
    heading1: heading(1),
    heading2: heading(2),
    heading3: heading(3),
    heading4: heading(4),
    heading5: heading(5),
    heading6: heading(6),

    // Lists and wraps
    bulletList,
    orderedList,
    taskList,
    blockquote,

    // Block insert
    horizontalRule,

    // History
    undo,
    redo,
  }
}
