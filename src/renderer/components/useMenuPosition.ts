/**
 * Keep a popup menu (opened at a click point) inside the viewport.
 *
 * Context menus are positioned `fixed` at the cursor's clientX/clientY. Near
 * the right or bottom edge that pushes the menu partly off-screen, so we nudge
 * its top-left back so the whole box fits, leaving a small margin. The clamp
 * runs in a layout effect (before paint) once the menu's real size is known,
 * so there is no visible jump.
 */
import { useLayoutEffect, useState, type RefObject } from 'react'

/** Gap kept between the menu and the viewport edge. */
export const MENU_VIEWPORT_MARGIN = 8

/**
 * Clamp a desired top-left so a `w`x`h` box stays within a `vw`x`vh` viewport,
 * keeping `margin` from each edge. Pulls the menu left/up from a far edge; if
 * the menu is larger than the viewport it pins to the top-left margin. Pure.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
  margin = MENU_VIEWPORT_MARGIN,
): { left: number; top: number } {
  const left = Math.max(margin, Math.min(x, vw - w - margin))
  const top = Math.max(margin, Math.min(y, vh - h - margin))
  return { left, top }
}

/**
 * Position a fixed menu at (`x`, `y`), then clamp it into the viewport once its
 * size is measured. Returns the `{ left, top }` to apply as inline style. Pass
 * null for `x`/`y` when the menu is closed (the result is then unused).
 *
 * Takes primitive coordinates rather than a point object on purpose: a fresh
 * `{ x, y }` literal would change identity every render and re-fire the effect
 * in a loop. Primitives keep the dependency stable.
 */
export function useMenuPosition(
  ref: RefObject<HTMLElement | null>,
  x: number | null,
  y: number | null,
): { left: number; top: number } {
  const [pos, setPos] = useState({ left: x ?? 0, top: y ?? 0 })

  useLayoutEffect(() => {
    if (x === null || y === null) return
    const el = ref.current
    if (el === null) {
      setPos({ left: x, top: y })
      return
    }
    const rect = el.getBoundingClientRect()
    setPos(clampMenuPosition(x, y, rect.width, rect.height, window.innerWidth, window.innerHeight))
  }, [ref, x, y])

  return pos
}
