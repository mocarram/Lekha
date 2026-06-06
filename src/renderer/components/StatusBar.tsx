import { useEditorStore } from '@renderer/store/editorStore'

interface StatusBarProps {
  /**
   * Called when the user clicks the mode toggle button.
   * The parent (App) toggles the editor mode and syncs the store.
   */
  onToggleSource: () => void
}

/**
 * StatusBar renders at the bottom of the app window.
 *
 * Displays word count, character count, and a button to toggle between
 * WYSIWYG and Source editing modes. Reads from useEditorStore so it stays
 * in sync with the rest of the app without any prop drilling.
 */
export function StatusBar({ onToggleSource }: StatusBarProps) {
  const wordCount = useEditorStore((s) => s.wordCount)
  const charCount = useEditorStore((s) => s.charCount)
  const selWords = useEditorStore((s) => s.selWords)
  const selChars = useEditorStore((s) => s.selChars)
  const mode = useEditorStore((s) => s.mode)

  // When there is a non-empty selection, show the SELECTED word/char count
  // (prefixed with "Selected:") instead of the whole-document counts.
  const hasSelection = selWords > 0
  const words = hasSelection ? selWords : wordCount
  const chars = hasSelection ? selChars : charCount

  return (
    <div className="status-bar">
      <div className="status-bar__counts">
        {hasSelection && (
          <span className="status-bar__sel-label">Selected:</span>
        )}
        <span className="status-bar__stat">{words} words</span>
        <span className="status-bar__sep" aria-hidden="true">·</span>
        <span className="status-bar__stat">{chars} chars</span>
      </div>

      <button
        type="button"
        className="status-bar__mode-btn no-drag"
        onClick={onToggleSource}
      >
        {mode === 'wysiwyg' ? 'WYSIWYG' : 'Source'}
      </button>
    </div>
  )
}
