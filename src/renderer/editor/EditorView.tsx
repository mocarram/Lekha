import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { EditorView as ProseMirrorView } from 'prosemirror-view'
import { type Node } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import { createEditorState } from './createState'
import { serializeMarkdown } from './serializer'
import { taskItemNodeView } from './taskItem'
import { mathInlineNodeView, mathBlockNodeView } from './mathNodeView'
import { codeBlockNodeView } from './codeBlockNodeView'
import { frontMatterNodeView } from './frontMatterNodeView'
import { tocNodeView } from './tocNodeView'
import { editorCommandMap } from './editorCommands'
import { schema } from './schema'
import { imageEditorProps } from './imagePaste'
import { useEditorStore } from '../store/editorStore'
import { countSelection } from './wordCount'
import {
  setFindQuery,
  findNext as _findNext,
  findPrev as _findPrev,
  replaceCurrent as _replaceCurrent,
  clearFind as _clearFind,
  findHighlightKey,
} from './plugins/findHighlight'
import { replaceAllTr } from './find'
import type { FindOptions } from './find'
import {
  getLinkAt as _getLinkAt,
  applyLink as _applyLink,
  removeLink as _removeLink,
  applyImage as _applyImage,
  type LinkInfo,
  type ApplyLinkArgs,
  type ApplyImageArgs,
} from './linkCommands'
import { isInTable, selectedRect } from 'prosemirror-tables'
import { tableCommandMap, type TableCommand } from './tableCommands'
import type { AppCommand } from '@shared/commands'

export type { LinkInfo, ApplyLinkArgs, ApplyImageArgs }
export type { TableCommand }

// ---------------------------------------------------------------------------
// Table-toolbar state
// ---------------------------------------------------------------------------

/**
 * Position/size of the active table in viewport (client) coordinates. The
 * TableToolbar reads this to anchor itself above the table.
 */
export interface TableRect {
  top: number
  left: number
  width: number
  height: number
}

/** Reported on selection change so the host can show/position the toolbar. */
export interface TableState {
  inTable: boolean
  rect?: TableRect
}

/**
 * Compute the current table state for `view`: whether the selection is inside
 * a table and, if so, the table element's bounding rect in client coordinates.
 * Returns `{ inTable: false }` when the cursor is outside any table.
 */
function computeTableState(view: ProseMirrorView): TableState {
  if (!isInTable(view.state)) return { inTable: false }
  // `selectedRect` resolves the enclosing table; `tableStart` is the position
  // just inside it, so `tableStart - 1` is the table node's own position. We
  // read the rendered <table>'s client rect from the DOM at that position.
  const { tableStart } = selectedRect(view.state)
  const dom = view.nodeDOM(tableStart - 1)
  const el = dom instanceof HTMLElement ? dom.closest('table') : null
  if (!el) return { inTable: true }
  const r = el.getBoundingClientRect()
  return {
    inTable: true,
    rect: { top: r.top, left: r.left, width: r.width, height: r.height },
  }
}

/**
 * Scroll the footnote_definition matching `label` into view (best-effort).
 *
 * Finds the first footnote_definition block with the same label, reads its
 * rendered DOM element via the view, and scrolls it into view. No-op if no
 * matching definition exists (e.g. an orphan reference).
 */
function jumpToFootnoteDefinition(view: ProseMirrorView, label: string): void {
  let defPos = -1
  view.state.doc.descendants((node, pos) => {
    if (defPos !== -1) return false
    if (
      node.type === schema.nodes['footnote_definition'] &&
      node.attrs['label'] === label
    ) {
      defPos = pos
      return false
    }
    return true
  })
  if (defPos === -1) return
  const dom = view.nodeDOM(defPos)
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Imperative handle exposed via React ref. */
export interface EditorHandle {
  /** Return the current ProseMirror document node. */
  getDoc(): Node
  /** Serialize the current doc to Markdown. */
  getMarkdown(): string
  /** Replace the entire document with the given Markdown string. */
  setMarkdown(md: string): void
  /** Focus the editor. */
  focus(): void
  /**
   * Scroll the editor to the given document position and focus.
   * Used by the Outline panel to jump to a heading.
   */
  scrollToPos(pos: number): void
  /**
   * Run an AppCommand against the ProseMirror editor.
   * Looks up the command in editorCommandMap, executes it, and focuses.
   * Returns true if the command was handled, false otherwise (no-op commands
   * such as file ops or find/replace are not in the map and return false).
   */
  runCommand(cmd: AppCommand): boolean

  // --- Table editing ---

  /**
   * Run a table-editing command (insert/delete row or column, delete table, or
   * set column alignment). Returns whether the command applied (false when the
   * cursor is not in a table, or the command was a no-op).
   */
  runTableCommand(cmd: TableCommand): boolean
  /** Return the current table state (in-table flag + client rect), or null. */
  getTableState(): TableState

  // --- Find/replace ---

  /** Set the active search query. Returns the number of matches. */
  setFind(query: string, opts: FindOptions): number
  /** Advance to the next match (wraps around). */
  findNext(): void
  /** Go to the previous match (wraps around). */
  findPrev(): void
  /** Replace the current match with `replacement`, then advance to next. */
  replaceCurrent(replacement: string): void
  /**
   * Replace all matches of the current query with `replacement`.
   * Returns the number of replacements made.
   */
  replaceAll(query: string, replacement: string, opts: FindOptions): number
  /** Clear the active query and all highlights. */
  clearFind(): void
  /**
   * Return information about the current match state.
   * `current` is 1-based (0 when there are no matches).
   * `count` is the total number of matches.
   */
  getMatchInfo(): { current: number; count: number }

  // --- Link / image dialogs ---

  /** Return the link mark covering the cursor/selection, or null. */
  getLinkAt(): LinkInfo | null
  /** Return the currently selected text (empty string when collapsed). */
  getSelectionText(): string
  /** Insert/update a link from the dialog. */
  applyLink(args: ApplyLinkArgs): void
  /** Remove the link at the cursor. */
  removeLink(): void
  /** Insert an image node from the dialog. */
  insertImage(args: ApplyImageArgs): void
}

// Build the command map once per module (schema is a singleton)
const cmdMap = editorCommandMap(schema)

interface EditorViewProps {
  /** Initial Markdown content. */
  markdown: string
  /** Called on every doc-changing transaction with the new document. */
  onChange?: (doc: Node) => void
  /**
   * Called when the user left-clicks a link in the editor. Receives the
   * full link info (href/text/range) so the host can open an edit dialog.
   */
  onLinkClick?: (info: LinkInfo) => void
  /**
   * Called when the user left-clicks an image node in the editor. Receives
   * the image src and alt so the host can open a lightbox/zoom overlay.
   * Returning false from handleClick lets ProseMirror place the cursor.
   */
  onImageClick?: (src: string, alt: string) => void
  /**
   * Called on every selection change with the current table state so the host
   * can show/position the floating TableToolbar.
   */
  onTableStateChange?: (state: TableState) => void
  /** CSS class name applied to the wrapper div. */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * React wrapper around a ProseMirror EditorView.
 *
 * - Creates the view ONCE on mount (empty-dep useEffect) - no re-creation
 *   per render.
 * - Uses a ref-to-latest-callback pattern for `onChange` so the callback
 *   is always current without requiring the view to be rebuilt.
 * - Destroys the view on unmount (no leak).
 */
export const EditorView = forwardRef<EditorHandle, EditorViewProps>(
  function EditorView(
    { markdown, onChange, onLinkClick, onImageClick, onTableStateChange, className },
    ref,
  ) {
    const mountRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<ProseMirrorView | null>(null)

    // Ref-to-latest-callback: keeps onChange current without recreating the view
    const onChangeRef = useRef(onChange)
    const onLinkClickRef = useRef(onLinkClick)
    const onImageClickRef = useRef(onImageClick)
    const onTableStateChangeRef = useRef(onTableStateChange)
    useEffect(() => {
      onChangeRef.current = onChange
      onLinkClickRef.current = onLinkClick
      onImageClickRef.current = onImageClick
      onTableStateChangeRef.current = onTableStateChange
    })

    // Create the view once on mount; destroy on unmount
    useEffect(() => {
      if (!mountRef.current) return

      // Build image paste/drop props once, capturing the store reference.
      // getDocPath reads the store at the moment each image is processed so
      // it always reflects the latest saved path (e.g. if the user saves the
      // doc after pasting but before the async write completes).
      const { handlePaste, handleDrop } = imageEditorProps(
        () => useEditorStore.getState().path,
      )

      const view = new ProseMirrorView(mountRef.current, {
        state: createEditorState(markdown),
        nodeViews: {
          task_item: taskItemNodeView,
          math_inline: mathInlineNodeView,
          math_block: mathBlockNodeView,
          code_block: codeBlockNodeView,
          front_matter: frontMatterNodeView,
          toc: tocNodeView,
        },
        handlePaste,
        handleDrop,
        // Plain left-click on a link opens the edit dialog; left-click on an
        // image node fires onImageClick to open the lightbox. We only react to
        // a primary click with no modifiers so text selection, shift-click, and
        // right-click behave normally. Returning false lets ProseMirror place
        // the cursor as usual (we don't consume the event for either case).
        handleClick(clickView, pos, event) {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return false
          }
          // Check for image node at the clicked position. ProseMirror resolves
          // `pos` to the position just before the node for atom/leaf nodes.
          const node = clickView.state.doc.nodeAt(pos)
          if (node && node.type === schema.nodes['image']) {
            const src = (node.attrs['src'] as string | null) ?? ''
            const alt = (node.attrs['alt'] as string | null) ?? ''
            onImageClickRef.current?.(src, alt)
            return false
          }
          // Footnote reference: clicking the superscript scrolls the matching
          // footnote_definition into view (best-effort jump-to-definition).
          if (node && node.type === schema.nodes['footnote_ref']) {
            jumpToFootnoteDefinition(clickView, node.attrs['label'] as string)
            return false
          }
          // Check for link mark at the clicked position.
          const $pos = clickView.state.doc.resolve(pos)
          const linkMark = schema.marks['link']!.isInSet($pos.marks())
          if (!linkMark) return false
          const info = _getLinkAt(clickView.state, pos)
          if (info) onLinkClickRef.current?.(info)
          return false
        },
        dispatchTransaction(tr) {
          const newState = view.state.apply(tr)
          view.updateState(newState)
          if (tr.docChanged) {
            onChangeRef.current?.(newState.doc)
          }
          // Keep the status-bar selection counter in sync. Recompute whenever
          // the selection or document changed. An empty (collapsed) selection
          // resets the counts to 0 so the status bar falls back to doc counts.
          if (tr.selectionSet || tr.docChanged) {
            const { from, to } = newState.selection
            if (from === to) {
              useEditorStore.getState().setSelectionCounts({ words: 0, chars: 0 })
            } else {
              const text = newState.doc.textBetween(from, to, '\n')
              useEditorStore.getState().setSelectionCounts(countSelection(text))
            }
            // Notify the host of the current table state so the floating
            // TableToolbar can show/hide and reposition on each cursor move.
            onTableStateChangeRef.current?.(computeTableState(view))
          }
        },
      })

      viewRef.current = view

      return () => {
        view.destroy()
        viewRef.current = null
        // Clear the selection counter when the view unmounts (e.g. mode switch)
        // so a stale selection count never lingers in the status bar.
        useEditorStore.getState().setSelectionCounts({ words: 0, chars: 0 })
      }
      // Intentionally empty deps: create once, read markdown via closure only
      // at mount time. Subsequent markdown changes go through setMarkdown().
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Expose the imperative handle
    useImperativeHandle(
      ref,
      () => ({
        getDoc() {
          return viewRef.current!.state.doc
        },
        getMarkdown() {
          return serializeMarkdown(viewRef.current!.state.doc)
        },
        setMarkdown(md: string) {
          viewRef.current!.updateState(createEditorState(md))
        },
        focus() {
          viewRef.current?.focus()
        },
        scrollToPos(pos: number) {
          const view = viewRef.current
          if (!view) return
          const { doc } = view.state
          // Clamp position to valid document range
          const safePos = Math.min(Math.max(pos, 0), doc.content.size)
          const selection = TextSelection.near(doc.resolve(safePos))
          const tr = view.state.tr.setSelection(selection).scrollIntoView()
          view.dispatch(tr)
          view.focus()
        },
        runCommand(cmd: AppCommand): boolean {
          const view = viewRef.current
          if (!view) return false
          const command = cmdMap[cmd]
          if (!command) return false
          const handled = command(view.state, view.dispatch, view)
          if (handled) {
            // Return focus to the editor so subsequent keystrokes work
            view.focus()
          }
          return handled
        },

        runTableCommand(cmd: TableCommand): boolean {
          const view = viewRef.current
          if (!view) return false
          const command = tableCommandMap[cmd]
          const handled = command(view.state, view.dispatch, view)
          if (handled) view.focus()
          return handled
        },
        getTableState(): TableState {
          const view = viewRef.current
          if (!view) return { inTable: false }
          return computeTableState(view)
        },

        setFind(query: string, opts: FindOptions): number {
          const view = viewRef.current
          if (!view) return 0
          return setFindQuery(view, query, opts)
        },
        findNext() {
          const view = viewRef.current
          if (!view) return
          _findNext(view)
        },
        findPrev() {
          const view = viewRef.current
          if (!view) return
          _findPrev(view)
        },
        replaceCurrent(replacement: string) {
          const view = viewRef.current
          if (!view) return
          _replaceCurrent(view, replacement)
        },
        replaceAll(query: string, replacement: string, opts: FindOptions): number {
          const view = viewRef.current
          if (!view) return 0
          const { tr, count } = replaceAllTr(view.state, query, replacement, opts)
          if (count > 0) {
            view.dispatch(tr)
          }
          return count
        },
        clearFind() {
          const view = viewRef.current
          if (!view) return
          _clearFind(view)
        },
        getMatchInfo(): { current: number; count: number } {
          const view = viewRef.current
          if (!view) return { current: 0, count: 0 }
          const pluginState = findHighlightKey.getState(view.state)
          if (!pluginState || pluginState.matches.length === 0) {
            return { current: 0, count: 0 }
          }
          return {
            current: pluginState.current + 1,
            count: pluginState.matches.length,
          }
        },

        getLinkAt(): LinkInfo | null {
          const view = viewRef.current
          if (!view) return null
          return _getLinkAt(view.state)
        },
        getSelectionText(): string {
          const view = viewRef.current
          if (!view) return ''
          const { from, to } = view.state.selection
          if (from === to) return ''
          return view.state.doc.textBetween(from, to)
        },
        applyLink(args: ApplyLinkArgs): void {
          const view = viewRef.current
          if (!view) return
          _applyLink(view.state, view.dispatch, args)
          view.focus()
        },
        removeLink(): void {
          const view = viewRef.current
          if (!view) return
          _removeLink(view.state, view.dispatch)
          view.focus()
        },
        insertImage(args: ApplyImageArgs): void {
          const view = viewRef.current
          if (!view) return
          _applyImage(view.state, view.dispatch, args)
          view.focus()
        },
      }),
      [],
    )

    return <div ref={mountRef} className={className} />
  },
)
