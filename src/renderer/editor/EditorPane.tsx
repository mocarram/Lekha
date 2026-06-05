import {
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react'
import type { Node } from 'prosemirror-model'
import { type EditorMode } from '@shared/types'
import { EditorView, type EditorHandle } from './EditorView'
import { SourceView, type SourceHandle } from './SourceView'
import { parseMarkdown } from './parser'
import { serializeMarkdown } from './serializer'
import type { AppCommand } from '@shared/commands'
import type { FindOptions } from './find'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Imperative handle exposed via React ref. */
export interface EditorPaneHandle {
  /** Toggle between 'wysiwyg' and 'source' modes, handing off content.
   *  Returns the NEW mode so callers can sync the store without a stale read. */
  toggleMode(): EditorMode
  /** Return the current active mode. */
  getMode(): EditorMode
  /** Return the current markdown content from whichever editor is active. */
  getMarkdown(): string
  /** Replace the document content (in wysiwyg mode: parse; in source mode: replace text). */
  setMarkdown(md: string): void
  /** Focus the currently active editor. */
  focus(): void
  /**
   * Scroll the WYSIWYG editor to the given document position and focus.
   * No-op when in source mode (position semantics don't map to CodeMirror).
   */
  scrollToPos(pos: number): void
  /**
   * Run an AppCommand against the active editor.
   * In WYSIWYG mode: delegates to EditorHandle.runCommand which looks up the
   * command in editorCommandMap.
   * In source mode: returns false for formatting commands (CodeMirror handles
   * its own undo/redo via keymap; no duplication needed).
   */
  runCommand(cmd: AppCommand): boolean

  // --- Find/replace (WYSIWYG mode only; no-op in source mode) ---

  /** Set the active search query. Returns the number of matches. */
  setFind(query: string, opts: FindOptions): number
  /** Advance to the next match (wraps around). */
  findNext(): void
  /** Go to the previous match (wraps around). */
  findPrev(): void
  /** Replace the current match, then advance to next. */
  replaceCurrent(replacement: string): void
  /**
   * Replace all matches of `query` with `replacement`.
   * Returns the number of replacements made.
   */
  replaceAll(query: string, replacement: string, opts: FindOptions): number
  /** Clear the active query and all highlights. */
  clearFind(): void
  /**
   * Return information about the current match state.
   * `current` is 1-based (0 when there are no matches).
   */
  getMatchInfo(): { current: number; count: number }
}

interface EditorPaneProps {
  /** Initial markdown content. */
  initialMarkdown: string
  /**
   * Called whenever content changes in either mode.
   * Receives the new markdown string so the app can track dirty state.
   */
  onChange?: (markdown: string) => void
  /** CSS class name applied to the wrapper div. */
  className?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Orchestrates WYSIWYG (ProseMirror) and source (CodeMirror) editor modes.
 *
 * Content hand-off on toggle:
 *   - wysiwyg -> source: serialize the ProseMirror doc to markdown via
 *     serializeMarkdown, feed the string to SourceView as `value`.
 *   - source -> wysiwyg: take the raw markdown string from SourceView,
 *     call EditorView.setMarkdown() which parses it via parseMarkdown.
 *
 * The `markdown` state variable is the single bridge value updated from
 * whichever editor is currently active. Both editors are rendered as needed;
 * only one is visible at a time (we conditionally render, not hide).
 */
export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
  function EditorPane({ initialMarkdown, onChange, className }, ref) {
    const [mode, setMode] = useState<EditorMode>('wysiwyg')

    // Canonical markdown snapshot - the bridge between the two editors.
    // Initialized by serializing the parsed initial markdown so it is always
    // in canonical form (same output as what EditorView.getMarkdown returns).
    const [markdown, setMarkdownState] = useState<string>(() =>
      serializeMarkdown(parseMarkdown(initialMarkdown)),
    )

    const wysiwygRef = useRef<EditorHandle | null>(null)
    const sourceRef = useRef<SourceHandle | null>(null)

    // Ref-to-latest-callback: keeps onChange current without re-running effects
    const onChangeRef = useRef(onChange)
    // Update the ref on every render so it always points to the latest prop
    onChangeRef.current = onChange

    // Called when the ProseMirror doc changes; receives a ProseMirror Node
    const handleWysiwygChange = useCallback((doc: Node) => {
      const md = serializeMarkdown(doc)
      setMarkdownState(md)
      onChangeRef.current?.(md)
    }, [])

    // Called when the CodeMirror doc changes; receives raw markdown text
    const handleSourceChange = useCallback((value: string) => {
      setMarkdownState(value)
      onChangeRef.current?.(value)
    }, [])

    const toggleMode = useCallback((): EditorMode => {
      // Compute the next mode eagerly so we can return it synchronously.
      // The setMode call uses the same value - no stale-closure risk.
      const nextMode: EditorMode = mode === 'wysiwyg' ? 'source' : 'wysiwyg'
      if (nextMode === 'source') {
        // Capture latest PM content before unmounting. We read synchronously
        // so SourceView mounts with the current text.
        const current = wysiwygRef.current?.getMarkdown()
        if (current !== undefined) {
          setMarkdownState(current)
        }
      } else {
        // Capture latest CM text before unmounting. After state settles,
        // push it into the already-existing (or freshly mounted) EditorView.
        const current = sourceRef.current?.getValue()
        if (current !== undefined) {
          setMarkdownState(current)
          // EditorView is remounted when mode changes; it picks up `markdown`
          // state as its `markdown` prop. No setTimeout needed because
          // EditorView accepts `markdown` prop on mount.
        }
      }
      setMode(nextMode)
      return nextMode
    }, [mode])

    // Expose the imperative handle
    useImperativeHandle(
      ref,
      () => ({
        toggleMode,
        getMode() {
          return mode
        },
        getMarkdown() {
          if (mode === 'wysiwyg') {
            return wysiwygRef.current?.getMarkdown() ?? markdown
          }
          return sourceRef.current?.getValue() ?? markdown
        },
        setMarkdown(md: string) {
          setMarkdownState(md)
          if (mode === 'wysiwyg') {
            wysiwygRef.current?.setMarkdown(md)
          }
          // In source mode, the value prop update will flow into SourceView
        },
        focus() {
          if (mode === 'wysiwyg') {
            wysiwygRef.current?.focus()
          } else {
            sourceRef.current?.focus()
          }
        },
        scrollToPos(pos: number) {
          // Only meaningful in WYSIWYG mode; source mode uses a different
          // position space (CodeMirror character offsets), so we no-op there.
          if (mode === 'wysiwyg') {
            wysiwygRef.current?.scrollToPos(pos)
          }
        },
        runCommand(cmd: AppCommand): boolean {
          // In source mode, formatting commands are no-ops - CodeMirror handles
          // its own undo/redo via its internal keymap. Return false so the
          // caller knows the command was not handled.
          if (mode !== 'wysiwyg') return false
          return wysiwygRef.current?.runCommand(cmd) ?? false
        },

        setFind(query: string, opts: FindOptions): number {
          if (mode !== 'wysiwyg') return 0
          return wysiwygRef.current?.setFind(query, opts) ?? 0
        },
        findNext() {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.findNext()
        },
        findPrev() {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.findPrev()
        },
        replaceCurrent(replacement: string) {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.replaceCurrent(replacement)
        },
        replaceAll(query: string, replacement: string, opts: FindOptions): number {
          if (mode !== 'wysiwyg') return 0
          return wysiwygRef.current?.replaceAll(query, replacement, opts) ?? 0
        },
        clearFind() {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.clearFind()
        },
        getMatchInfo(): { current: number; count: number } {
          if (mode !== 'wysiwyg') return { current: 0, count: 0 }
          return wysiwygRef.current?.getMatchInfo() ?? { current: 0, count: 0 }
        },
      }),
      [mode, markdown, toggleMode],
    )

    return (
      <div className={className}>
        {mode === 'wysiwyg' ? (
          <EditorView
            ref={wysiwygRef}
            markdown={markdown}
            onChange={handleWysiwygChange}
          />
        ) : (
          <SourceView
            ref={sourceRef}
            value={markdown}
            onChange={handleSourceChange}
          />
        )}
      </div>
    )
  },
)
