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
  const mode = useEditorStore((s) => s.mode)

  return (
    <div className="status-bar">
      <div className="status-bar__counts">
        <span className="status-bar__stat">{wordCount} words</span>
        <span className="status-bar__sep" aria-hidden="true">·</span>
        <span className="status-bar__stat">{charCount} chars</span>
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
