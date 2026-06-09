interface EmptyStateProps {
  /** Create a new blank document. */
  onNew: () => void
  /** Open a file via the OS picker. */
  onOpen: () => void
  /** Open a folder as the workspace. */
  onOpenFolder: () => void
}

/**
 * EmptyState fills the editor card when no document is open (every tab closed).
 *
 * It is purely presentational: it offers the three entry points (new file, open
 * file, open folder) and forwards them to the parent, which routes them through
 * the command layer. App renders it over the editor surface only while
 * documentsStore has zero documents, so opening/creating anything dismisses it.
 */
export function EmptyState({ onNew, onOpen, onOpenFolder }: EmptyStateProps) {
  return (
    <div className="editor-empty" role="region" aria-label="No document open">
      <div className="editor-empty__inner">
        <h2 className="editor-empty__title">No document open</h2>
        <p className="editor-empty__hint">
          Create a new file or open an existing one to start writing.
        </p>
        <div className="editor-empty__actions">
          <button type="button" className="editor-empty__btn no-drag" onClick={onNew}>
            New file <kbd className="editor-empty__kbd">⌘N</kbd>
          </button>
          <button type="button" className="editor-empty__btn no-drag" onClick={onOpen}>
            Open file <kbd className="editor-empty__kbd">⌘O</kbd>
          </button>
          <button type="button" className="editor-empty__btn no-drag" onClick={onOpenFolder}>
            Open folder…
          </button>
        </div>
      </div>
    </div>
  )
}
