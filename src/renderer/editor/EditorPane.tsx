import {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
  lazy,
  Suspense,
} from 'react'
import type { Node } from 'prosemirror-model'
import { type EditorMode } from '@shared/types'
import {
  EditorView,
  type EditorHandle,
  type LinkInfo,
  type ApplyLinkArgs,
  type ApplyImageArgs,
  type TableCommand,
  type TableState,
} from './EditorView'
import { type SourceHandle } from './SourceView'
import { parseMarkdown } from './parser'
import { serializeMarkdown } from './serializer'
import { useEditorStore } from '@renderer/store/editorStore'
import type { AppCommand } from '@shared/commands'
import type { FindOptions } from './find'

// ---------------------------------------------------------------------------
// Lazy source-mode editor
//
// SourceView pulls in the entire CodeMirror 6 stack (@codemirror/*, @lezer/*),
// which is only needed when the user toggles to raw-markdown source mode. We
// React.lazy it so that whole stack becomes a deferred chunk; toggling to
// source shows a brief fallback while the chunk loads, then mounts CodeMirror.
// ---------------------------------------------------------------------------

const SourceView = lazy(() => import('./SourceView'))

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

  // --- Table editing (WYSIWYG mode only) ---

  /**
   * Run a table-editing command. Returns whether it applied. No-op (false) in
   * source mode or when the cursor is not in a table.
   */
  runTableCommand(cmd: TableCommand): boolean
  /** Return the current table state (in-table flag + client rect). */
  getTableState(): TableState

  // --- Find/replace (WYSIWYG mode only; no-op in source mode) ---

  /** Set the active search query. Returns the number of matches. */
  setFind(query: string, opts: FindOptions): number
  /** Refresh highlights for `query` in place, without scrolling. */
  refreshFind(query: string, opts: FindOptions): number
  /** Advance to the next match (wraps around). */
  findNext(): void
  /** Go to the previous match (wraps around). */
  findPrev(): void
  /** Jump to a specific match by index (clamped). No-op when no matches. */
  gotoMatch(index: number): void
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

  // --- Link / image dialogs (WYSIWYG mode only) ---

  /** Return the link mark covering the cursor/selection, or null. */
  getLinkAt(): LinkInfo | null
  /** Return the currently selected text (empty string when collapsed). */
  getSelectionText(): string
  /** Return the whole document as plain text. */
  getPlainText(): string
  /** Insert plain text at the selection. */
  insertText(text: string): void
  /** Insert/update a link from the dialog. */
  applyLink(args: ApplyLinkArgs): void
  /** Remove the link at the cursor. */
  removeLink(): void
  /** Insert an image node from the dialog. */
  insertImage(args: ApplyImageArgs): void
}

interface EditorPaneProps {
  /** Initial markdown content. */
  initialMarkdown: string
  /**
   * Called whenever content changes in either mode.
   * Receives the new markdown string so the app can track dirty state.
   */
  onChange?: (markdown: string, doc?: Node) => void
  /** Called when the user clicks a link in the WYSIWYG editor. */
  onLinkClick?: (info: LinkInfo) => void
  /**
   * Called when the user clicks an image node in the WYSIWYG editor.
   * Receives the image src and alt text so the host can open a lightbox.
   */
  onImageClick?: (src: string, alt: string) => void
  /** Forwarded to EditorView: fired on selection change with table state. */
  onTableStateChange?: (state: TableState) => void
  /** Forwarded to EditorView: fired when the slash menu's Image item is chosen. */
  onInsertImage?: () => void
  /** CSS class name applied to the wrapper div. */
  className?: string
}

export type { TableCommand, TableState }

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
  function EditorPane(
    { initialMarkdown, onChange, onLinkClick, onImageClick, onTableStateChange, onInsertImage, className },
    ref,
  ) {
    const [mode, setMode] = useState<EditorMode>('wysiwyg')

    // Read focus/typewriter mode from the store.
    // These drive the container class (focus-mode) and data attribute (data-typewriter).
    const focusMode = useEditorStore((s) => s.focusMode)
    const typewriterMode = useEditorStore((s) => s.typewriterMode)
    const equationNumbering = useEditorStore((s) => s.equationNumbering)

    // Canonical markdown snapshot - the bridge between the two editors.
    // Initialized by serializing the parsed initial markdown so it is always
    // in canonical form (same output as what EditorView.getMarkdown returns).
    const [markdown, setMarkdownState] = useState<string>(() =>
      serializeMarkdown(parseMarkdown(initialMarkdown)),
    )

    const wysiwygRef = useRef<EditorHandle | null>(null)
    const sourceRef = useRef<SourceHandle | null>(null)

    // The scroll container (`.editor-pane`). It persists across a mode toggle,
    // but swapping its child (EditorView <-> SourceView) momentarily collapses
    // the content height, so the browser resets scrollTop to 0. We capture the
    // scroll fraction before the swap and restore it (and focus) after the new
    // view mounts - see toggleMode + the restore effect below.
    const containerRef = useRef<HTMLDivElement>(null)
    const pendingScrollRestore = useRef<number | null>(null)

    // Ref-to-latest-callback: keeps onChange current without re-running effects
    const onChangeRef = useRef(onChange)
    // Update the ref on every render so it always points to the latest prop
    onChangeRef.current = onChange

    // Ref mirror of the bridge `markdown` value, updated on every render. The
    // imperative handle reads this instead of closing over `markdown`, so the
    // handle no longer has to be rebuilt on every keystroke (see below).
    const markdownRef = useRef(markdown)
    markdownRef.current = markdown

    // Debounce handle + the latest live doc for the trailing serialize.
    const wysiwygDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const latestDocRef = useRef<Node | null>(null)

    // Serialize the latest live doc and push it to the bridge state + onChange.
    // serializeMarkdown is O(document), so we avoid running it on EVERY keystroke.
    const flushWysiwygChange = useCallback((): void => {
      const doc = latestDocRef.current
      if (doc === null) return
      const md = serializeMarkdown(doc)
      setMarkdownState(md)
      onChangeRef.current?.(md, doc)
    }, [])

    // Called when the ProseMirror doc changes; receives a ProseMirror Node.
    //
    // serializeMarkdown(doc) is a full O(document) walk, so running it on every
    // keystroke is wasteful (the live doc is the source of truth - getMarkdown()
    // serializes on demand from it). We use a leading+trailing debounce:
    //   - the FIRST change of a burst flushes immediately, so the dirty flag,
    //     title-bar state and crash-backup re-arm fire without latency;
    //   - subsequent rapid changes are coalesced into one trailing flush ~150ms
    //     after typing pauses (matching the outline/word-count debounce).
    // We pass the live `doc` up alongside the serialized markdown so the parent
    // can derive outline/word-count WITHOUT re-parsing the markdown string.
    const handleWysiwygChange = useCallback((doc: Node) => {
      // PM nodes are immutable, so stashing the latest doc for the trailing
      // flush is safe even though more edits may arrive before the timer fires.
      latestDocRef.current = doc
      if (wysiwygDebounce.current === null) {
        // Leading edge: flush now so change notifications are not delayed.
        flushWysiwygChange()
        wysiwygDebounce.current = setTimeout(() => {
          wysiwygDebounce.current = null
        }, 150)
      } else {
        // Within the burst window: re-arm the trailing flush.
        clearTimeout(wysiwygDebounce.current)
        wysiwygDebounce.current = setTimeout(() => {
          wysiwygDebounce.current = null
          flushWysiwygChange()
        }, 150)
      }
    }, [flushWysiwygChange])

    // Flush any pending serialize on unmount so the final edit is not lost.
    useEffect(() => {
      return () => {
        if (wysiwygDebounce.current !== null) {
          clearTimeout(wysiwygDebounce.current)
          wysiwygDebounce.current = null
          flushWysiwygChange()
        }
      }
    }, [flushWysiwygChange])

    // Called when the CodeMirror doc changes; receives raw markdown text. No PM
    // doc is available in source mode, so the parent re-parses the string.
    const handleSourceChange = useCallback((value: string) => {
      setMarkdownState(value)
      onChangeRef.current?.(value)
    }, [])

    const toggleMode = useCallback((): EditorMode => {
      // Compute the next mode eagerly so we can return it synchronously.
      // The setMode call uses the same value - no stale-closure risk.
      const nextMode: EditorMode = mode === 'wysiwyg' ? 'source' : 'wysiwyg'

      // Capture the current scroll fraction so the restore effect can put the
      // reader back where they were after the view remounts (otherwise the swap
      // collapses content height and scrollTop snaps to 0).
      const el = containerRef.current
      if (el) {
        const max = el.scrollHeight - el.clientHeight
        pendingScrollRestore.current = max > 0 ? el.scrollTop / max : 0
      }

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

    // After a mode toggle remounts the editor, restore the scroll position and
    // focus the new view so the writer stays where they were and can keep
    // typing. Runs only when toggleMode armed a pending restore (never on first
    // mount). rAF + a short retry handles the lazily-loaded SourceView chunk,
    // whose content height is not ready until it mounts.
    useEffect(() => {
      if (pendingScrollRestore.current === null) return
      const fraction = pendingScrollRestore.current
      pendingScrollRestore.current = null
      let frames = 0
      const restore = (): void => {
        const el = containerRef.current
        if (!el) return
        const ready = mode === 'wysiwyg' ? wysiwygRef.current : sourceRef.current
        const max = el.scrollHeight - el.clientHeight
        // Wait for the new view to mount + lay out (height ready) before
        // restoring; bail out after ~0.5s so we never spin forever.
        if ((!ready || max <= 0) && frames < 30) {
          frames++
          requestAnimationFrame(restore)
          return
        }
        el.scrollTop = fraction * Math.max(0, max)
        // Keep editing flowing: focus the freshly mounted view.
        if (mode === 'wysiwyg') wysiwygRef.current?.focus()
        else sourceRef.current?.focus()
      }
      requestAnimationFrame(restore)
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
            return wysiwygRef.current?.getMarkdown() ?? markdownRef.current
          }
          return sourceRef.current?.getValue() ?? markdownRef.current
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

        runTableCommand(cmd: TableCommand): boolean {
          if (mode !== 'wysiwyg') return false
          return wysiwygRef.current?.runTableCommand(cmd) ?? false
        },
        getTableState(): TableState {
          if (mode !== 'wysiwyg') return { inTable: false }
          return wysiwygRef.current?.getTableState() ?? { inTable: false }
        },

        setFind(query: string, opts: FindOptions): number {
          if (mode !== 'wysiwyg') return 0
          return wysiwygRef.current?.setFind(query, opts) ?? 0
        },
        refreshFind(query: string, opts: FindOptions): number {
          if (mode !== 'wysiwyg') return 0
          return wysiwygRef.current?.refreshFind(query, opts) ?? 0
        },
        findNext() {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.findNext()
        },
        findPrev() {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.findPrev()
        },
        gotoMatch(index: number) {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.gotoMatch(index)
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

        getLinkAt(): LinkInfo | null {
          if (mode !== 'wysiwyg') return null
          return wysiwygRef.current?.getLinkAt() ?? null
        },
        getSelectionText(): string {
          if (mode !== 'wysiwyg') return ''
          return wysiwygRef.current?.getSelectionText() ?? ''
        },
        getPlainText(): string {
          return wysiwygRef.current?.getPlainText() ?? ''
        },
        insertText(text: string): void {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.insertText(text)
        },
        applyLink(args: ApplyLinkArgs): void {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.applyLink(args)
        },
        removeLink(): void {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.removeLink()
        },
        insertImage(args: ApplyImageArgs): void {
          if (mode !== 'wysiwyg') return
          wysiwygRef.current?.insertImage(args)
        },
      }),
      // `markdown` is intentionally NOT a dependency: the handle reads the latest
      // bridge value through markdownRef, so it no longer has to be rebuilt on
      // every keystroke. No consumer depends on the handle's identity (only
      // editorRef.current is used). Rebuild only when mode/toggleMode change.
      [mode, toggleMode],
    )

    // Compose the container class. `focus-mode` enables the dimming rules and
    // `equation-numbering` enables the CSS counter that numbers block math.
    // Both are pure CSS gates - they never touch the document or its markdown.
    const containerClass = [
      className,
      focusMode ? 'focus-mode' : '',
      equationNumbering ? 'equation-numbering' : '',
    ]
      .filter(Boolean)
      .join(' ')

    return (
      // data-typewriter="on" is the sentinel read by the typewriter plugin's
      // view.update() to decide whether to center the caret on each update.
      // We set it on the same element that carries focus-mode so the typewriter
      // plugin's closest('[data-typewriter="on"]') finds the scroll container.
      <div
        ref={containerRef}
        className={containerClass}
        data-typewriter={typewriterMode ? 'on' : undefined}
      >
        {mode === 'wysiwyg' ? (
          <EditorView
            ref={wysiwygRef}
            markdown={markdown}
            onChange={handleWysiwygChange}
            {...(onLinkClick ? { onLinkClick } : {})}
            {...(onImageClick ? { onImageClick } : {})}
            {...(onTableStateChange ? { onTableStateChange } : {})}
            {...(onInsertImage ? { onInsertImage } : {})}
          />
        ) : (
          // Brief fallback while the CodeMirror chunk loads on first toggle.
          <Suspense fallback={<div className="source-loading">Loading source view...</div>}>
            <SourceView
              ref={sourceRef}
              value={markdown}
              onChange={handleSourceChange}
            />
          </Suspense>
        )}
      </div>
    )
  },
)
