import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import { useDocumentsStore } from '@renderer/store/documentsStore'
import { WINDOW_COLOR_SWATCHES } from '@shared/windowColor'

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
  /** Copy the tab's document to the clipboard as Markdown. */
  onCopyAsMarkdown: (id: string) => void
  /** Copy the tab's document to the clipboard as rich HTML. */
  onCopyAsHtml: (id: string) => void
  /** Reveal the tab's file in the OS file manager. */
  onReveal: (path: string) => void
  /** Create a new blank document tab. */
  onNew: () => void
  /** This window's marker color (`#rrggbb`) or null - drives the active swatch. */
  windowColor: string | null
  /** Set (hex) or clear (null) this window's marker color. */
  onSetWindowColor: (hex: string | null) => void
}

/** Right-click context-menu state: the targeted tab + click coordinates. */
interface TabMenuState {
  id: string
  path: string | null
  isPinned: boolean
  x: number
  y: number
}

/** Small push-pin glyph shown in a pinned tab's close slot (12x12). */
function PinIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.5 1.5a1 1 0 0 1 1.7-.7l4 4a1 1 0 0 1-.7 1.7h-.8l-2.6 2.6.4 2.6a1 1 0 0 1-1.7.9L7.5 10.3l-4.1 4.1a.75.75 0 0 1-1.1-1.1l4.1-4.1-2.3-2.3a1 1 0 0 1 .9-1.7l2.6.4L10.3 3v-.8a1 1 0 0 1-.8-.7Z" />
    </svg>
  )
}

/**
 * Custom MIME type carried by a tab drag. Distinguishes tab-reorder drags from
 * OS file drags (the editor/sidebar drop zones check for 'Files') and blocks
 * foreign drags from triggering reorders.
 */
const TAB_DRAG_TYPE = 'application/x-lekha-tab'

/** Edge band (px) inside which dragging auto-scrolls the strip. */
const DRAG_SCROLL_EDGE = 28

/** Auto-scroll step per dragover event near an edge. */
const DRAG_SCROLL_STEP = 12

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
  onCopyAsMarkdown,
  onCopyAsHtml,
  onReveal,
  onNew,
  windowColor,
  onSetWindowColor,
}: TabBarProps) {
  const documents = useDocumentsStore((s) => s.documents)
  const activeId = useDocumentsStore((s) => s.activeId)

  const tabsRef = useRef<HTMLDivElement>(null)
  // Hidden native color input, opened by the "Custom…" color-menu item.
  const colorInputRef = useRef<HTMLInputElement>(null)

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

  // Window-color menu (swatches / Custom / None), opened by right-clicking
  // empty tab-bar space. Same one-at-a-time + dismissal behavior as the tab
  // menu, keyed on its own coordinates.
  const [colorMenu, setColorMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (colorMenu === null) return undefined
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setColorMenu(null)
    }
    const onDown = (e: MouseEvent) => {
      const el = document.querySelector('.window-color-menu')
      if (el && !el.contains(e.target as Node)) setColorMenu(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [colorMenu])

  /** Pick a window color (hex or null to clear) and dismiss the menu. */
  const pickColor = (hex: string | null): void => {
    setColorMenu(null)
    onSetWindowColor(hex)
  }

  // Right-click on empty tab-bar space (not a tab - those stopPropagation and
  // open the tab menu) opens the window-color menu.
  const onBarContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setMenu(null)
    setColorMenu({ x: e.clientX, y: e.clientY })
  }

  // ---------------------------------------------------------------------
  // Drag-to-reorder (same-window). HTML5 DnD: the dragged tab id travels in
  // the dataTransfer under TAB_DRAG_TYPE; while dragging, `dropIndex` marks
  // the insertion slot (0..N) and styles an indicator on the tab at/before it.
  // ---------------------------------------------------------------------
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  /**
   * Insertion slot (0..N) for a drag at `clientX`: before the first tab whose
   * midpoint lies past the pointer, or the end slot when the pointer is past
   * every tab. Computed from tab geometry rather than the hovered element so
   * the whole bar is a drop target - the gaps between tabs and the empty area
   * after the last tab (where "drop at the end" naturally lands) included.
   */
  const slotFromPoint = (clientX: number): number => {
    const tabEls = tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')
    if (!tabEls) return documents.length
    for (let i = 0; i < tabEls.length; i++) {
      const box = tabEls[i]!.getBoundingClientRect()
      if (clientX < box.left + box.width / 2) return i
    }
    return documents.length
  }

  /**
   * Pinned tabs group left of the rest and a drag never crosses the boundary
   * (moveDocument clamps the move the same way); clamping the slot here too
   * keeps the indicator honest - it always marks where the tab will land.
   */
  const clampSlot = (slot: number, id: string | null): number => {
    const dragged = documents.find((d) => d.id === id)
    if (!dragged) return slot
    const pinnedCount = documents.filter((d) => d.isPinned).length
    return dragged.isPinned ? Math.min(slot, pinnedCount) : Math.max(slot, pinnedCount)
  }

  const onTabDragStart = (e: React.DragEvent, id: string): void => {
    e.dataTransfer.setData(TAB_DRAG_TYPE, id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  const onBarDragOver = (e: React.DragEvent): void => {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(clampSlot(slotFromPoint(e.clientX), draggingId))
    // Auto-scroll the strip when dragging near its clipped edges, so a tab
    // can be carried to targets that are currently scrolled out of view.
    const strip = tabsRef.current
    if (strip) {
      const box = strip.getBoundingClientRect()
      if (e.clientX < box.left + DRAG_SCROLL_EDGE) strip.scrollLeft -= DRAG_SCROLL_STEP
      else if (e.clientX > box.right - DRAG_SCROLL_EDGE) strip.scrollLeft += DRAG_SCROLL_STEP
    }
  }

  const onBarDrop = (e: React.DragEvent): void => {
    const id = e.dataTransfer.getData(TAB_DRAG_TYPE)
    if (!id) return
    e.preventDefault()
    const slot = clampSlot(slotFromPoint(e.clientX), id)
    const from = documents.findIndex((d) => d.id === id)
    // Dropping into a slot AFTER the dragged tab's own position shifts the
    // target left by one once the tab is removed from its origin.
    const target = from !== -1 && slot > from ? slot - 1 : slot
    useDocumentsStore.getState().moveDocument(id, target)
    setDraggingId(null)
    setDropIndex(null)
  }

  const onTabDragEnd = (): void => {
    setDraggingId(null)
    setDropIndex(null)
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
      // Tab-reorder drops land anywhere on the bar (slotFromPoint maps the
      // pointer to a slot): between tabs, past the last tab, on the drag zone.
      // Foreign drags (OS files) fail the MIME check and fall through.
      onDragOver={onBarDragOver}
      onDrop={onBarDrop}
      // Right-click empty bar space opens the window-color menu (tabs handle
      // their own context menu and stopPropagation).
      onContextMenu={onBarContextMenu}
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
          {documents.map((doc, i) => {
          const isActive = doc.id === activeId
          // Insertion indicator: slot k renders BEFORE tab k; the end slot (N)
          // renders AFTER the last tab.
          const dropBefore = dropIndex === i
          const dropAfter = dropIndex === documents.length && i === documents.length - 1
          return (
            <div
              key={doc.id}
              role="tab"
              aria-selected={isActive}
              // Roving tabindex: only the active tab is in the Tab order; arrow
              // keys move focus among the rest.
              tabIndex={isActive ? 0 : -1}
              className={
                `tab${isActive ? ' tab--active' : ''}${doc.isDirty ? ' tab--dirty' : ''}` +
                `${doc.isPinned ? ' tab--pinned' : ''}` +
                `${doc.id === draggingId ? ' tab--dragging' : ''}` +
                `${dropBefore ? ' tab--drop-before' : ''}${dropAfter ? ' tab--drop-after' : ''}`
              }
              title={doc.path ?? doc.title}
              draggable
              onDragStart={(e) => onTabDragStart(e, doc.id)}
              onDragEnd={onTabDragEnd}
              onClick={() => onSelect(doc.id)}
              onAuxClick={(e) => {
                // Middle-click closes the tab (standard tab UX) - except a
                // pinned one: pins exist to prevent exactly this accident.
                if (e.button === 1 && !doc.isPinned) {
                  e.preventDefault()
                  onClose(doc.id)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                // Don't let the bar's window-color menu also fire for a tab.
                e.stopPropagation()
                setColorMenu(null)
                setMenu({ id: doc.id, path: doc.path, isPinned: doc.isPinned, x: e.clientX, y: e.clientY })
              }}
            >
              <span className="tab__title">{doc.title}</span>
              {doc.isPinned ? (
                // Pinned: the close slot shows the pin glyph instead of the x;
                // clicking it UNPINS (closing needs the context menu). The
                // dirty state stays visible via the italic title.
                <button
                  type="button"
                  className="tab__pin"
                  aria-label={`Unpin ${doc.title}`}
                  title="Unpin"
                  onClick={(e) => {
                    e.stopPropagation()
                    useDocumentsStore.getState().setPinned(doc.id, false)
                  }}
                >
                  <PinIcon />
                </button>
              ) : (
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
              )}
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
            onClick={menuAction(() => useDocumentsStore.getState().setPinned(menu.id, !menu.isPinned))}>
            {menu.isPinned ? 'Unpin Tab' : 'Pin Tab'}
          </button>
          <div className="filetree-menu__sep" role="separator" />
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
          <div className="filetree-menu__sep" role="separator" />
          {/* Copy the tab's whole document (works for any tab, incl. Untitled,
              and for background tabs without switching to them). */}
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={menuAction(() => onCopyAsMarkdown(menu.id))}>
            Copy as Markdown
          </button>
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={menuAction(() => onCopyAsHtml(menu.id))}>
            Copy as HTML
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

      {/* Window-color menu: swatch grid + Custom + None. Reuses the token-themed
          popup; `window-color-menu` scopes its outside-click dismissal and the
          no-drag carve-out so it stays clickable over the strip. */}
      {colorMenu !== null && (
        <div
          className="filetree-menu window-color-menu no-drag"
          role="menu"
          style={{ left: `${colorMenu.x}px`, top: `${colorMenu.y}px` }}
        >
          <div className="window-color-swatches">
            {WINDOW_COLOR_SWATCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitemradio"
                aria-checked={windowColor === s.hex}
                aria-label={s.label}
                title={s.label}
                className={
                  'window-color-swatch' +
                  (windowColor === s.hex ? ' window-color-swatch--active' : '')
                }
                style={{ background: s.hex }}
                onClick={() => { pickColor(s.hex) }}
              />
            ))}
          </div>
          <div className="filetree-menu__sep" role="separator" />
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={() => { setColorMenu(null); colorInputRef.current?.click() }}>
            Custom…
          </button>
          <button type="button" role="menuitem" className="filetree-menu__item"
            onClick={() => { pickColor(null) }}>
            None
          </button>
        </div>
      )}

      {/* Hidden native color picker, opened by "Custom…". value seeds it with
          the current color so reopening starts where the user left off. */}
      <input
        ref={colorInputRef}
        type="color"
        className="window-color-input"
        aria-hidden="true"
        tabIndex={-1}
        value={windowColor ?? '#3b82f6'}
        onChange={(e) => { pickColor(e.target.value) }}
      />
    </div>
  )
}
