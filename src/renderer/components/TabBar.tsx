import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import { useDocumentsStore } from '@renderer/store/documentsStore'

interface TabBarProps {
  /** Activate the tab with this id. */
  onSelect: (id: string) => void
  /** Close the tab with this id (caller handles the dirty-save guard). */
  onClose: (id: string) => void
  /** Close every tab except this one. */
  onCloseOthers: (id: string) => void
  /** Close every tab to the right of this one. */
  onCloseRight: (id: string) => void
  /** Close every clean (saved) tab. */
  onCloseSaved: () => void
  /** Close every tab. */
  onCloseAll: () => void
  /** Copy the tab's absolute file path to the clipboard. */
  onCopyPath: (path: string) => void
  /** Reveal the tab's file in the OS file manager. */
  onReveal: (path: string) => void
  /** Create a new blank document tab. */
  onNew: () => void
}

/** Right-click context-menu state: the targeted tab + click coordinates. */
interface TabMenuState {
  id: string
  path: string | null
  x: number
  y: number
}

/**
 * TabBar renders the open-document tab strip above the editor.
 *
 * It is purely presentational: it reads the open tabs from documentsStore and
 * forwards user intent (select / close / new) to the parent via callbacks, so
 * App owns the editor-integration logic (loading content, the save guard).
 *
 * The strip is always present (persistent shell chrome): with no documents open
 * it still shows the empty strip + the "+" button, so the layout never shifts
 * and creating a file is always one click away.
 */
export function TabBar({
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseSaved,
  onCloseAll,
  onCopyPath,
  onReveal,
  onNew,
}: TabBarProps) {
  const documents = useDocumentsStore((s) => s.documents)
  const activeId = useDocumentsStore((s) => s.activeId)

  const tabsRef = useRef<HTMLDivElement>(null)

  // Right-click tab menu (Close / Close Others / ... / Reveal). One menu at a
  // time, dismissed by Escape, outside pointer-down, or running an action.
  const [menu, setMenu] = useState<TabMenuState | null>(null)
  useEffect(() => {
    if (menu === null) return undefined
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    const onDown = (e: MouseEvent) => {
      const el = document.querySelector('.tab-menu')
      if (el && !el.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [menu])

  /** Run a menu action and dismiss the menu. */
  const menuAction = (fn: () => void) => () => {
    setMenu(null)
    fn()
  }

  // Which edges hide more tabs: drives the fade overlays that hint "there is
  // more to scroll" in each direction. Updated from scroll/resize/tab-count
  // changes; state only changes when an edge flag actually flips, so steady
  // scrolling does not re-render the strip per scroll event.
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const updateOverflow = (): void => {
    const el = tabsRef.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }

  // Keep the ACTIVE tab visible: with enough tabs the strip scrolls, and a tab
  // activated any way other than a direct click (Cmd+Shift+]/[, open from
  // search/recents, close-adjacent) may sit outside the viewport. 'nearest'
  // scrolls the minimum distance and is a no-op when already visible.
  // Opening/closing tabs also changes what overflows, so refresh the fades.
  useEffect(() => {
    if (activeId !== null) {
      const el = tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    updateOverflow()
  }, [activeId, documents.length])

  // The strip's width changes with the window and the sidebar drag; both can
  // reveal/hide overflow without a scroll event.
  useEffect(() => {
    const el = tabsRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(el)
    return () => { ro.disconnect() }
  }, [])

  // VS Code-style wheel handling: a mouse wheel only produces vertical deltas,
  // so translate the dominant-vertical wheel into horizontal strip scrolling.
  // Trackpads pan horizontally natively (deltaX dominant) - leave those alone.
  const onTabsWheel = (e: WheelEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return // nothing to scroll
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY
    }
  }

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
      // global.css). The scroll wrapper and the + button opt out as whole
      // stationary blocks - NEVER the individual tabs: per-tab no-drag rects
      // shift with the strip's scrollLeft and leak outside it, punching holes
      // in other drag regions (electron#40610).
      className="tab-bar"
      role="tablist"
      aria-label="Open documents"
      onKeyDown={onTablistKeyDown}
    >
      {/* Non-scrolling wrapper: hosts the edge-fade overlays (CSS ::before/
          ::after) so they stay pinned over the strip's edges while the inner
          container scrolls. The fade on a side appears only while more tabs
          are hidden in that direction. */}
      <div
        className={
          'tab-bar__scroll' +
          (overflow.left ? ' tab-bar__scroll--more-left' : '') +
          (overflow.right ? ' tab-bar__scroll--more-right' : '')
        }
      >
        <div className="tab-bar__tabs" ref={tabsRef} onWheel={onTabsWheel} onScroll={updateOverflow}>
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
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ id: doc.id, path: doc.path, x: e.clientX, y: e.clientY })
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
      </div>
      {/* Guaranteed window-drag space: with enough tabs the strip's leftover
          background (the usual drag region) shrinks to nothing, leaving no way
          to move the window from the tab bar. This zone never shrinks, so a
          grabbable area always sits between the tabs and the + button; the
          tabs scroll within the remaining width. */}
      <div className="tab-bar__drag-zone" aria-hidden="true" />
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

      {/* Right-click tab menu. Reuses the file-tree menu styling (same token-
          themed popup look); `tab-menu` scopes the outside-click dismissal and
          carves a no-drag hole so its top rows stay clickable over the strip. */}
      {menu !== null && (
        <div
          className="filetree-menu tab-menu no-drag"
          role="menu"
          style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
        >
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={menuAction(() => onClose(menu.id))}>
            Close
          </button>
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={menuAction(() => onCloseOthers(menu.id))}>
            Close Others
          </button>
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={menuAction(() => onCloseRight(menu.id))}>
            Close to the Right
          </button>
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={menuAction(() => onCloseSaved())}>
            Close Saved
          </button>
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={menuAction(() => onCloseAll())}>
            Close All
          </button>
          {menu.path !== null && (
            <>
              <div className="filetree-menu__sep" role="separator" />
              <button type="button" role="menuitem" className="filetree-menu__item"
                onClick={menuAction(() => { const p = menu.path; if (p !== null) onCopyPath(p) })}>
                Copy Path
              </button>
              <button type="button" role="menuitem" className="filetree-menu__item"
                onClick={menuAction(() => { const p = menu.path; if (p !== null) onReveal(p) })}>
                Reveal in Finder
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
