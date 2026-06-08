/**
 * slashMenu.ts - the `/` block-insert menu plugin.
 *
 * Typing `/` at the START of an empty paragraph opens a Notion-style popup that
 * lists block types to insert; typing after the slash fuzzy-filters the list,
 * and selecting an item replaces the `/query` text with the chosen block.
 *
 * ---------------------------------------------------------------------------
 * Architecture / wiring
 * ---------------------------------------------------------------------------
 * The plugin owns ONLY the activation state: `{ open, from, query }`. It does
 * NOT own the selection index or render anything. The React `SlashMenu`
 * component (rendered by EditorView) computes the filtered items via
 * fuzzyFilter, owns its own `selectedIndex`, and handles Arrow/Enter/Esc via a
 * window listener while open. To stop the editor ALSO acting on those keys
 * while the menu is up, the plugin's `handleKeyDown` swallows them whenever the
 * menu is open. EditorView bridges the two by reading this plugin's state on
 * every transaction and lifting `{ open, from, query }` into React state, and
 * by calling `insertBlock` in response to the component's callbacks.
 *
 * ---------------------------------------------------------------------------
 * Activation detection (why it never hijacks a literal slash)
 * ---------------------------------------------------------------------------
 * The menu opens ONLY when, after a transaction, the selection is an empty
 * cursor sitting at the END of a paragraph whose entire text is `/<query>`
 * (the slash is the very first character of the block, and `query` contains no
 * whitespace). A slash typed mid-sentence ("a/b", "and/or", or at the end of
 * "hello") fails this check because the block text is not `/...` from offset 0,
 * so the menu stays closed. Pressing Space (which would make `query` contain
 * whitespace) or moving the cursor away also closes it.
 */
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from 'prosemirror-state'
import { setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { schema } from '../schema'

// ---------------------------------------------------------------------------
// Menu item catalogue
// ---------------------------------------------------------------------------

/** A selectable block type in the slash menu. */
export interface SlashItem {
  /** Stable id passed to insertBlock and used as the React key. */
  id: string
  /** Human label shown in the menu. */
  label: string
  /** Extra search terms (matched alongside the label by the fuzzy filter). */
  keywords: string[]
  /** A short glyph shown as the item's icon (keeps the menu lean - no asset deps). */
  icon: string
}

/**
 * The catalogue, in display order. The `id` doubles as the action selector in
 * insertBlock. Keywords broaden fuzzy matching (e.g. "ul"/"todo"/"divider").
 */
export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: 'heading1', label: 'Heading 1', keywords: ['h1', 'title', 'header'], icon: 'H1' },
  { id: 'heading2', label: 'Heading 2', keywords: ['h2', 'subtitle', 'header'], icon: 'H2' },
  { id: 'heading3', label: 'Heading 3', keywords: ['h3', 'header'], icon: 'H3' },
  { id: 'bulletList', label: 'Bullet List', keywords: ['ul', 'unordered', 'list', 'bullet'], icon: '•' },
  { id: 'orderedList', label: 'Numbered List', keywords: ['ol', 'ordered', 'list', 'number'], icon: '1.' },
  { id: 'taskList', label: 'Task List', keywords: ['todo', 'checklist', 'check', 'list'], icon: '☑' },
  { id: 'blockquote', label: 'Blockquote', keywords: ['quote', 'citation'], icon: '"' },
  { id: 'codeBlock', label: 'Code Block', keywords: ['code', 'pre', 'fence', 'snippet'], icon: '</>' },
  { id: 'table', label: 'Table', keywords: ['grid', 'rows', 'columns', 'gfm'], icon: '⊞' },
  { id: 'mathBlock', label: 'Math Block', keywords: ['latex', 'katex', 'equation', 'formula'], icon: '∑' },
  { id: 'diagram', label: 'Diagram', keywords: ['mermaid', 'flowchart', 'graph', 'chart'], icon: '◇' },
  { id: 'horizontalRule', label: 'Horizontal Rule', keywords: ['hr', 'divider', 'separator', 'line'], icon: '―' },
  { id: 'image', label: 'Image', keywords: ['img', 'picture', 'photo', 'figure'], icon: '🖼' },
]

// ---------------------------------------------------------------------------
// Plugin state
// ---------------------------------------------------------------------------

/** The slash menu's tracked state. Meaningful only while `open` is true. */
export interface SlashMenuState {
  open: boolean
  /** Document position of the `/` character (the start of the slash range). */
  from: number
  /** The text typed after the slash (drives the fuzzy filter). */
  query: string
}

const CLOSED: SlashMenuState = { open: false, from: 0, query: '' }

export const slashMenuKey = new PluginKey<SlashMenuState>('slashMenu')

/**
 * Derive the slash-menu state from an editor state. Returns CLOSED unless the
 * selection is an empty cursor at the end of a paragraph whose text is exactly
 * `/<query>` (slash at block offset 0, query has no whitespace).
 */
function detect(state: EditorState): SlashMenuState {
  const { selection } = state
  if (!selection.empty) return CLOSED

  const $cursor = selection.$head
  const parent = $cursor.parent
  // Only plain paragraphs trigger the menu (not headings, code, list items...).
  if (parent.type !== schema.nodes['paragraph']) return CLOSED
  // The cursor must be at the very END of the block's text content.
  if ($cursor.parentOffset !== parent.content.size) return CLOSED

  const text = parent.textContent
  if (text.length === 0 || text[0] !== '/') return CLOSED

  const query = text.slice(1)
  // A space (or any whitespace) ends the slash command - close the menu.
  if (/\s/.test(query)) return CLOSED

  // `from` is the document position of the slash: block start = cursor - text.
  const from = $cursor.pos - text.length
  return { open: true, from, query }
}

/**
 * The slash menu plugin. Recomputes its state on every transaction and swallows
 * navigation keys while open so the menu component (window listener) handles
 * them exclusively.
 */
export function slashMenuPlugin(): Plugin<SlashMenuState> {
  return new Plugin<SlashMenuState>({
    key: slashMenuKey,
    state: {
      init: (_config, state) => detect(state),
      // Recompute from the new editor state after each transaction. Detection
      // is a pure function of doc + selection, so deriving here keeps the menu
      // perfectly in sync with edits, undo/redo, and cursor moves.
      apply: (_tr, _value, _old, newState) => detect(newState),
    },
    props: {
      // While the menu is open, ProseMirror must not act on the keys the menu
      // owns (Arrow up/down to move, Enter to insert, Escape to close). We
      // return true to consume them; the React component's window listener does
      // the actual work. Every other key (including typing to filter and
      // Backspace to narrow/close) falls through to normal editing.
      handleKeyDown(view, event) {
        const s = slashMenuKey.getState(view.state)
        if (!s || !s.open) return false
        return (
          event.key === 'ArrowUp' ||
          event.key === 'ArrowDown' ||
          event.key === 'Enter' ||
          event.key === 'Escape'
        )
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Imperative helpers
// ---------------------------------------------------------------------------

type Dispatch = (tr: Transaction) => void

/**
 * Build the table-insert transaction fragment: a starter 2x2 GFM table with a
 * header row and a body row (one paragraph per cell so the cursor can land).
 */
function makeStarterTable() {
  const cellContent = schema.nodes['paragraph']!.create()
  const header = schema.nodes['table_header']!.create(null, cellContent)
  const cell = schema.nodes['table_cell']!.create(null, cellContent)
  const headerRow = schema.nodes['table_row']!.create(null, [header, header])
  const bodyRow = schema.nodes['table_row']!.create(null, [cell, cell])
  return schema.nodes['table']!.create(null, [headerRow, bodyRow])
}

/** Starter mermaid source inserted by the Diagram item. */
const STARTER_MERMAID = 'graph TD;\n  A[Start] --> B[End];'

/**
 * Perform the slash item's action.
 *
 * Removes the `/query` text (from the tracked `from` to the cursor), then
 * inserts / converts to the chosen block - all in ONE transaction built from
 * `state.tr`, so the caller dispatches a single, mappable change. Standard
 * block types reuse the canonical ProseMirror commands (setBlockType /
 * wrapInList / wrapIn) so there is no duplicated command logic; table /
 * math_block / diagram / task_list / image are bespoke node insertions.
 *
 * `image` does NOT insert a node here: it just removes the slash text so the
 * host can open the existing Image dialog (handled in EditorView).
 *
 * Returns true when the item was handled (a transaction was dispatched), false
 * for an unknown id (no dispatch).
 *
 * Works on a bare EditorState so it is unit-testable without a view; EditorView
 * passes `view.state` + `view.dispatch`.
 */
export function insertBlock(
  state: EditorState,
  itemId: string,
  dispatch: Dispatch,
): boolean {
  // Unknown ids are rejected before mutating anything.
  if (!SLASH_ITEMS.some((i) => i.id === itemId)) return false

  const s = detect(state)
  const cursor = state.selection.from
  const removeFrom = s.open ? s.from : cursor

  // Single transaction: first delete the `/query` text, then collapse the
  // cursor to the start of the now-empty paragraph so the block command /
  // node-insert targets the right block.
  const tr = state.tr.delete(removeFrom, cursor)
  const $at = tr.doc.resolve(Math.min(removeFrom, tr.doc.content.size))
  tr.setSelection(TextSelection.near($at))

  // Commands operate on (state, dispatch). We feed them an intermediate state
  // carrying our cleared tr's doc/selection; their dispatch hands us a tr whose
  // steps we re-apply onto our running `tr` so everything lands in one change.
  const runCmd = (
    cmd: (st: EditorState, d?: Dispatch) => boolean,
  ): boolean => {
    const mid = state.apply(tr)
    let ok = false
    cmd(mid, (cmdTr) => {
      for (const step of cmdTr.steps) tr.step(step)
      ok = true
    })
    if (ok) dispatch(tr.scrollIntoView())
    return ok
  }

  switch (itemId) {
    case 'heading1':
      return runCmd(setBlockType(schema.nodes['heading']!, { level: 1 }))
    case 'heading2':
      return runCmd(setBlockType(schema.nodes['heading']!, { level: 2 }))
    case 'heading3':
      return runCmd(setBlockType(schema.nodes['heading']!, { level: 3 }))
    case 'codeBlock':
      return runCmd(setBlockType(schema.nodes['code_block']!))
    case 'bulletList':
      return runCmd(wrapInList(schema.nodes['bullet_list']!))
    case 'orderedList':
      return runCmd(wrapInList(schema.nodes['ordered_list']!))
    case 'blockquote':
      return runCmd(wrapIn(schema.nodes['blockquote']!))
    case 'taskList': {
      // Wrap the (now empty) paragraph in a task_list of a single task_item.
      const para = schema.nodes['paragraph']!.create()
      const item = schema.nodes['task_item']!.create({ checked: false }, para)
      const list = schema.nodes['task_list']!.create(null, item)
      dispatch(tr.replaceSelectionWith(list).scrollIntoView())
      return true
    }
    case 'horizontalRule':
      dispatch(tr.replaceSelectionWith(schema.nodes['horizontal_rule']!.create()).scrollIntoView())
      return true
    case 'mathBlock':
      dispatch(tr.replaceSelectionWith(schema.nodes['math_block']!.create({ latex: '' })).scrollIntoView())
      return true
    case 'diagram':
      dispatch(
        tr
          .replaceSelectionWith(
            schema.nodes['code_block']!.create({ language: 'mermaid' }, schema.text(STARTER_MERMAID)),
          )
          .scrollIntoView(),
      )
      return true
    case 'table':
      dispatch(tr.replaceSelectionWith(makeStarterTable()).scrollIntoView())
      return true
    case 'image':
      // Dialog-driven: only the slash text is removed; the host opens the
      // Image dialog after this returns.
      dispatch(tr.scrollIntoView())
      return true
    default:
      return false
  }
}
