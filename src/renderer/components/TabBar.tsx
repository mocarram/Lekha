import type { KeyboardEvent } from 'react'
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
 * The strip is hidden only when zero documents are open; a single open document
 * still shows its tab, so the shell's persistent browser-style tab strip is
 * always present whenever there is something to edit.
 */
export function TabBar({ onSelect, onClose, onNew }: TabBarProps) {
  const documents = useDocumentsStore((s) => s.documents)
  const activeId = useDocumentsStore((s) => s.activeId)

  if (documents.length === 0) return null

  // Roving-tabindex keyboard navigation for the tab strip (WAI-ARIA tabs
  // pattern). Left/Right (and Home/End) move focus between tabs and activate
  // them; Enter/Space activate the focused tab; the active tab is the single
  // Tab-stop into the strip.
  const onTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ']
    if (!keys.includes(e.key)) return
    const tabEls = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    )
    const curIdx = tabEls.indexOf(document.activeElement as HTMLElement)
    if (curIdx === -1) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(documents[curIdx]!.id)
      return
    }
    let next = curIdx
    if (e.key === 'ArrowRight') next = (curIdx + 1) % tabEls.length
    else if (e.key === 'ArrowLeft') next = (curIdx - 1 + tabEls.length) % tabEls.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabEls.length - 1
    e.preventDefault()
    tabEls[next]!.focus()
    onSelect(documents[next]!.id)
  }

  return (
    <div
      // No `no-drag` here: the strip itself is a window drag region (set in
      // global.css). The interactive children (tabs, close x, +) opt out with
      // -webkit-app-region:no-drag individually, so the empty strip space drags
      // the window while clicks on tabs/buttons still work.
      className="tab-bar"
      role="tablist"
      aria-label="Open documents"
      onKeyDown={onTablistKeyDown}
    >
      <div className="tab-bar__tabs">
        {documents.map((doc) => {
          const isActive = doc.id === activeId
          return (
            <div
              key={doc.id}
              role="tab"
              aria-selected={isActive}
              // Roving tabindex: only the active tab is in the Tab order; arrow
              // keys move focus among the rest.
              tabIndex={isActive ? 0 : -1}
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
        // Prevent the button from grabbing focus on mousedown so the new
        // document's editor keeps the caret (newFile focuses the editor).
        onMouseDown={(e) => e.preventDefault()}
        onClick={onNew}
      >
        +
      </button>
    </div>
  )
}
