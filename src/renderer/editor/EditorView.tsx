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
}

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
      }),
      [],
    )

    return <div ref={mountRef} className={className} />
  },
)
