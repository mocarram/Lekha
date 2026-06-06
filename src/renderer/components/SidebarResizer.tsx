/**
 * SidebarResizer.tsx - Draggable handle for resizing the sidebar.
 *
 * Renders a thin vertical strip on the sidebar's right edge. When the user
 * drags it, it computes a new width from the mouse position and updates the
 * --sidebar-width CSS variable on <html> live. On mouseup the final width is
 * persisted via window.lekha.setSettings({ sidebarWidth }). Double-clicking
 * resets the width to SIDEBAR_DEFAULT_WIDTH.
 *
 * Pure utilities (clampSidebarWidth, constants) live in sidebarResizerUtils.ts
 * so they can be imported in tests without DOM dependencies and without
 * triggering the react-refresh mixed-export warning.
 */
import { useCallback } from 'react'
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
} from './sidebarResizerUtils'

// ---------------------------------------------------------------------------
// Apply helpers (side-effecting - not pure)
// ---------------------------------------------------------------------------

/** Write the clamped width to the --sidebar-width CSS var on <html>. */
function applyCssVar(px: number): void {
  document.documentElement.style.setProperty('--sidebar-width', `${px}px`)
}

/** Persist the width to settings via the IPC bridge (fire-and-forget). */
function persistWidth(px: number): void {
  if (typeof window.lekha === 'undefined') return
  void window.lekha.setSettings({ sidebarWidth: px })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SidebarResizerProps {
  /** Current sidebar width, used as the drag start reference. */
  currentWidth: number
  /** Called with the new clamped width during drag and on double-click reset. */
  onWidthChange: (px: number) => void
}

/**
 * A thin, invisible (until hovered) drag handle placed at the right edge of
 * the sidebar. Mousedown begins a drag; mousemove updates the width live;
 * mouseup commits and persists the width.
 */
export function SidebarResizer({ currentWidth, onWidthChange }: SidebarResizerProps) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()

      // Capture the X position where the drag started and the width at that point.
      const startX = e.clientX
      const startWidth = currentWidth

      function onMouseMove(ev: MouseEvent): void {
        const delta = ev.clientX - startX
        const next = clampSidebarWidth(startWidth + delta)
        applyCssVar(next)
        onWidthChange(next)
      }

      function onMouseUp(ev: MouseEvent): void {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        const delta = ev.clientX - startX
        const final = clampSidebarWidth(startWidth + delta)
        applyCssVar(final)
        onWidthChange(final)
        persistWidth(final)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [currentWidth, onWidthChange],
  )

  const handleDoubleClick = useCallback(() => {
    const reset = SIDEBAR_DEFAULT_WIDTH
    applyCssVar(reset)
    onWidthChange(reset)
    persistWidth(reset)
  }, [onWidthChange])

  return (
    <div
      className="sidebar-resizer"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      aria-hidden="true"
      title="Drag to resize sidebar; double-click to reset"
    />
  )
}
