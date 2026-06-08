/**
 * editorCommands.ts
 *
 * Canonical source of truth for all editor-affecting ProseMirror command
 * builders. Both keymapBindings and EditorView.runCommand (triggered by the
 * native menu / useCommands hook) consume the same map so there is ONE place
 * to add, change, or remove a command.
 */
import { type Schema, type NodeType, type Node as ProseMirrorNode } from 'prosemirror-model'
import { type Command, type Transaction, TextSelection } from 'prosemirror-state'
import { toggleMark, setBlockType, wrapIn, chainCommands } from 'prosemirror-commands'
import { undo, redo } from 'prosemirror-history'
import { wrapInList, sinkListItem, liftListItem } from 'prosemirror-schema-list'
import type { AppCommand } from '@shared/commands'

// ---------------------------------------------------------------------------
// taskList helper
// ---------------------------------------------------------------------------

/**
 * Build a command that wraps the selected block(s) in a task_list whose
 * children are task_item nodes (checked: false) rather than plain list_items.
 *
 * Strategy:
 *   1. Collect the set of top-level blocks that overlap the selection.
 *   2. Wrap each block's content in a task_item node.
 *   3. Wrap the resulting task_items in a single task_list node.
 *   4. Replace the original block range with the new task_list.
 *
 * This is intentionally simpler than prosemirror-schema-list's wrapInList
 * (which doesn't know about task_item). It handles the common "wrap a
 * paragraph as a task item" case well; edge cases like nested lists are left
 * for future refinement.
 */
function wrapInTaskList(schema: Schema): Command {
  return (state, dispatch) => {
    const taskListType: NodeType | undefined = schema.nodes['task_list']
    const taskItemType: NodeType | undefined = schema.nodes['task_item']
    if (!taskListType || !taskItemType) return false

    const { from, to } = state.selection
    const { doc } = state

    // Gather all top-level blocks that touch the selection range.
    const blocks: { node: ProseMirrorNode; start: number; end: number }[] = []
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.isBlock && !node.isTextblock && node.type !== taskListType) {
        // Skip container blocks - we want their children (the actual text blocks).
        return true
      }
      if (node.isTextblock || (node.isBlock && node.isLeaf)) {
        blocks.push({ node, start: pos, end: pos + node.nodeSize })
        return false // don't descend further
      }
      return true
    })

    if (blocks.length === 0) return false
    if (!dispatch) return true

    // Build task_item nodes wrapping each collected block's content.
    const taskItems = blocks.map(({ node }) =>
      taskItemType.create({ checked: false }, node.content),
    )

    // Build the task_list containing all task_items.
    const taskList = taskListType.create(null, taskItems)

    // Replace the range spanning all collected blocks with the new task_list.
    const rangeStart = blocks[0]!.start
    const rangeEnd = blocks[blocks.length - 1]!.end

    const tr: Transaction = state.tr.replaceWith(rangeStart, rangeEnd, taskList)
    dispatch(tr.scrollIntoView())
    return true
  }
}

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
 * link / insertImage are NOT in this map: they are dialog-driven (see
 * linkCommands.ts + LinkDialog/ImageDialog), routed by useCommands rather than
 * by a zero-arg ProseMirror command.
 */
export function editorCommandMap(schema: Schema): Partial<Record<AppCommand, Command>> {
  // -------------------------------------------------------------------------
  // Inline mark toggles
  // -------------------------------------------------------------------------
  const bold = toggleMark(schema.marks['strong']!)
  const italic = toggleMark(schema.marks['em']!)
  const strikethrough = toggleMark(schema.marks['strikethrough']!)
  const inlineCode = toggleMark(schema.marks['code']!)
  const underline = toggleMark(schema.marks['underline']!)
  const highlight = toggleMark(schema.marks['highlight']!)
  const superscript = toggleMark(schema.marks['superscript']!)
  const subscript = toggleMark(schema.marks['subscript']!)

  // Jump the caret to the very start / end of the document and scroll there.
  const jumpToTop: Command = (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.atStart(state.doc)).scrollIntoView())
    }
    return true
  }
  const jumpToBottom: Command = (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.atEnd(state.doc)).scrollIntoView())
    }
    return true
  }

  // Select the textblock the caret is in (the "line"/paragraph). Expands the
  // selection to span from the start to the end of the current textblock.
  const selectLine: Command = (state, dispatch) => {
    const { $from } = state.selection
    const start = $from.start()
    const end = $from.end()
    if (start === end) return false
    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)))
    }
    return true
  }

  // Select the whole block node enclosing the caret (the "block"): the parent
  // container one level up (e.g. the list item, blockquote, or table cell), or
  // the textblock itself when already at the top level.
  const selectBlock: Command = (state, dispatch) => {
    const { $from } = state.selection
    const depth = $from.depth > 1 ? $from.depth - 1 : $from.depth
    const start = $from.start(depth)
    const end = $from.end(depth)
    if (start === end) return false
    if (dispatch) {
      // TextSelection.between snaps the endpoints to the nearest valid inline
      // positions so a block that spans multiple textblocks (e.g. a list item
      // or blockquote) yields a valid selection.
      const sel = TextSelection.between(state.doc.resolve(start), state.doc.resolve(end))
      dispatch(state.tr.setSelection(sel))
    }
    return true
  }

  // Clear inline formatting: strip ALL marks from the (non-empty) selection.
  const clearFormatting: Command = (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    if (dispatch) dispatch(state.tr.removeMark(from, to, null))
    return true
  }

  // -------------------------------------------------------------------------
  // Block type setters
  // -------------------------------------------------------------------------
  const paragraph = setBlockType(schema.nodes['paragraph']!)
  const codeBlock = setBlockType(schema.nodes['code_block']!)

  // Heading levels 1-6 share the same heading node type; only the attr differs.
  const heading = (level: number): Command =>
    setBlockType(schema.nodes['heading']!, { level })

  // Promote / demote the heading level of the current block along a single
  // ladder: paragraph <-> H6 <-> H5 <-> ... <-> H1.
  //   increaseHeading: one step MORE prominent (paragraph -> H6, H3 -> H2).
  //   decreaseHeading: one step LESS prominent (H1 -> H2, H6 -> paragraph).
  // Provides the familiar "Increase / Decrease Heading Level" commands.
  const headingType = schema.nodes['heading']!
  const paragraphType = schema.nodes['paragraph']!
  const shiftHeading = (delta: number): Command => (state, dispatch) => {
    const { $from } = state.selection
    const node = $from.parent
    if (node.type !== headingType && node.type !== paragraphType) return false
    const current = node.type === headingType ? (node.attrs['level'] as number) : 7
    // delta < 0 => more prominent (smaller number); delta > 0 => less prominent.
    const next = current + delta
    if (next < 1) return false
    if (next > 6) {
      // Demoting past H6 turns the block back into a paragraph.
      return setBlockType(paragraphType)(state, dispatch)
    }
    return setBlockType(headingType, { level: next })(state, dispatch)
  }
  const increaseHeading = shiftHeading(-1)
  const decreaseHeading = shiftHeading(1)

  // Indent / outdent: sink or lift the current list item. Chained across
  // list_item and task_item so it works in both list flavours. Returns false
  // outside a list (lets the caller treat it as a no-op).
  const listItemType = schema.nodes['list_item']!
  const taskItemType = schema.nodes['task_item']!
  const indent = chainCommands(sinkListItem(listItemType), sinkListItem(taskItemType))
  const outdent = chainCommands(liftListItem(listItemType), liftListItem(taskItemType))

  // -------------------------------------------------------------------------
  // Wrap commands (list / blockquote)
  // -------------------------------------------------------------------------
  const bulletList = wrapInList(schema.nodes['bullet_list']!)
  const orderedList = wrapInList(schema.nodes['ordered_list']!)
  const blockquote = wrapIn(schema.nodes['blockquote']!)

  // taskList: wrap the selected block(s) in a task_list of task_item nodes
  // (checked: false). Uses a custom command rather than wrapInList because
  // wrapInList wraps in list_item by default and doesn't know about task_item.
  const taskList = wrapInTaskList(schema)

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
    underline,
    highlight,
    superscript,
    subscript,
    clearFormatting,
    selectLine,
    selectBlock,
    jumpToTop,
    jumpToBottom,

    // Block types
    paragraph,
    codeBlock,
    heading1: heading(1),
    heading2: heading(2),
    heading3: heading(3),
    heading4: heading(4),
    heading5: heading(5),
    heading6: heading(6),
    increaseHeading,
    decreaseHeading,
    indent,
    outdent,

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
