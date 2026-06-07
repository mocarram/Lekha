import { useDocumentsStore } from '@renderer/store/documentsStore'

interface TabBarProps {
  /** Activate the tab with this id. */
  onSelect: (id: string) => void
  /** Close the tab with this id (caller handles the dirty-save guard). */
  onClose: (id: string) => void
  /** Create a new blank document tab. */
  onNew: () => void
}

/**
 * TabBar renders the open-document tab strip above the editor.
 *
 * It is purely presentational: it reads the open tabs from documentsStore and
 * forwards user intent (select / close / new) to the parent via callbacks, so
 * App owns the editor-integration logic (loading content, the save guard).
 *
 * The strip is hidden when zero or one document is open (matching WYSIWYG's
 * "show tabs when multiple documents" behaviour) to avoid wasting vertical
 * space in the common single-file case.
 */
export function TabBar({ onSelect, onClose, onNew }: TabBarProps) {
  const documents = useDocumentsStore((s) => s.documents)
  const activeId = useDocumentsStore((s) => s.activeId)

  if (documents.length <= 1) return null

  return (
    <div className="tab-bar no-drag" role="tablist" aria-label="Open documents">
      <div className="tab-bar__tabs">
        {documents.map((doc) => {
          const isActive = doc.id === activeId
          return (
            <div
              key={doc.id}
              role="tab"
              aria-selected={isActive}
              className={`tab${isActive ? ' tab--active' : ''}${doc.isDirty ? ' tab--dirty' : ''}`}
              title={doc.path ?? doc.title}
              onClick={() => onSelect(doc.id)}
              onAuxClick={(e) => {
                // Middle-click closes the tab (standard tab UX).
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(doc.id)
                }
              }}
            >
              <span className="tab__title">{doc.title}</span>
              <button
                type="button"
                className="tab__close"
                aria-label={`Close ${doc.title}`}
                title="Close"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(doc.id)
                }}
              >
                {/* The dirty dot occupies the close slot until hovered, when
                    the × is revealed (CSS-driven). */}
                <span className="tab__dirty-dot" aria-hidden="true" />
                <span className="tab__close-x" aria-hidden="true">
                  ×
                </span>
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="tab-bar__new"
        aria-label="New document"
        title="New document"
        onClick={onNew}
      >
        +
      </button>
    </div>
  )
}
