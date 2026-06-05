import {
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { EditorView as CMEditorView, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import type { ViewUpdate } from '@codemirror/view'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Imperative handle exposed via React ref. */
export interface SourceHandle {
  /** Return the current document text. */
  getValue(): string
  /** Focus the CodeMirror editor. */
  focus(): void
}

interface SourceViewProps {
  /** The markdown text to display/edit. */
  value: string
  /** Called whenever the document changes (user edits, not prop-driven updates). */
  onChange?: (value: string) => void
  /** CSS class name applied to the wrapper div. */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * React wrapper around a CodeMirror 6 EditorView for raw markdown source editing.
 *
 * Loop-avoidance: when the `value` prop changes from outside (e.g. the parent
 * echoing a state update back down), we dispatch a replace-all transaction BUT
 * set a flag (`propDrivenUpdate`) before doing so. The updateListener checks
 * this flag and skips calling `onChange` for that transaction, preventing the
 * update from bouncing back up and causing an infinite loop.
 *
 * We also guard with `prop !== current doc` before dispatching to avoid
 * unnecessary transactions when the prop hasn't actually changed.
 */
export const SourceView = forwardRef<SourceHandle, SourceViewProps>(
  function SourceView({ value, onChange, className }, ref) {
    const mountRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<CMEditorView | null>(null)

    // Ref-to-latest-callback: keeps onChange current without recreating the view
    const onChangeRef = useRef(onChange)
    useEffect(() => {
      onChangeRef.current = onChange
    })

    // Flag: set to true before a prop-driven transaction to skip onChange
    const propDrivenUpdate = useRef(false)

    // Create the CM view once on mount; destroy on unmount
    useEffect(() => {
      if (!mountRef.current) return

      const updateListener = CMEditorView.updateListener.of((update: ViewUpdate) => {
        // Only fire onChange for actual document changes that originated from
        // user interaction, not from prop-driven replace transactions.
        if (update.docChanged && !propDrivenUpdate.current) {
          onChangeRef.current?.(update.state.doc.toString())
        }
        // Always reset the flag after processing an update
        propDrivenUpdate.current = false
      })

      const extensions: Extension[] = [
        markdown(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        updateListener,
      ]

      const view = new CMEditorView({
        state: EditorState.create({ doc: value, extensions }),
        parent: mountRef.current,
      })

      viewRef.current = view

      return () => {
        view.destroy()
        viewRef.current = null
      }
      // Intentionally empty deps: create once at mount. Subsequent value
      // changes are handled by the effect below via dispatch.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Sync prop `value` -> CM doc when value changes externally.
    // Guard: skip if the view doesn't exist yet or if the doc already matches
    // (avoids a no-op dispatch and any chance of a loop).
    useEffect(() => {
      const view = viewRef.current
      if (!view) return

      const current = view.state.doc.toString()
      if (current === value) return

      // Signal to the updateListener that this transaction is prop-driven
      // so it does NOT call onChange (loop guard).
      propDrivenUpdate.current = true
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: value,
        },
      })
    }, [value])

    // Expose the imperative handle
    useImperativeHandle(
      ref,
      () => {
        // Testing seam: __testCmView exposes the underlying CM view so tests
        // can dispatch transactions without a real DOM keyboard event. The
        // double-underscore prefix signals test-only intent. Declared as a
        // non-optional property typed `CMEditorView | undefined` to satisfy
        // exactOptionalPropertyTypes.
        const handle: SourceHandle & { __testCmView: CMEditorView | undefined } = {
          getValue() {
            return viewRef.current?.state.doc.toString() ?? ''
          },
          focus() {
            viewRef.current?.focus()
          },
          get __testCmView(): CMEditorView | undefined {
            return viewRef.current ?? undefined
          },
        }
        return handle
      },
      [],
    )

    return <div ref={mountRef} className={className} />
  },
)
