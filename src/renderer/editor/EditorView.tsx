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
import { editorCommandMap } from './editorCommands'
import { schema } from './schema'
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
import type { AppCommand } from '@shared/commands'

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
}

// Build the command map once per module (schema is a singleton)
const cmdMap = editorCommandMap(schema)

interface EditorViewProps {
  /** Initial Markdown content. */
  markdown: string
  /** Called on every doc-changing transaction with the new document. */
  onChange?: (doc: Node) => void
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
  function EditorView({ markdown, onChange, className }, ref) {
    const mountRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<ProseMirrorView | null>(null)

    // Ref-to-latest-callback: keeps onChange current without recreating the view
    const onChangeRef = useRef(onChange)
    useEffect(() => {
      onChangeRef.current = onChange
    })

    // Create the view once on mount; destroy on unmount
    useEffect(() => {
      if (!mountRef.current) return

      const view = new ProseMirrorView(mountRef.current, {
        state: createEditorState(markdown),
        nodeViews: {
          task_item: taskItemNodeView,
          math_inline: mathInlineNodeView,
          math_block: mathBlockNodeView,
          code_block: codeBlockNodeView,
        },
        dispatchTransaction(tr) {
          const newState = view.state.apply(tr)
          view.updateState(newState)
          if (tr.docChanged) {
            onChangeRef.current?.(newState.doc)
          }
        },
      })

      viewRef.current = view

      return () => {
        view.destroy()
        viewRef.current = null
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
      }),
      [],
    )

    return <div ref={mountRef} className={className} />
  },
)
