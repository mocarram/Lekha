/**
 * useFocusTrap - accessibility hook that confines keyboard focus to a modal container.
 *
 * When `active` is true the hook:
 *   1. Moves focus to the first focusable element inside the container (or the
 *      container itself) if focus is not already inside.
 *   2. Intercepts Tab and Shift+Tab on the container so focus cannot escape:
 *      - Tab from the last focusable element wraps to the first.
 *      - Shift+Tab from the first focusable element wraps to the last.
 *   3. Cleans up its listener when `active` becomes false or the component unmounts.
 *
 * The hook is additive - it does NOT replace existing role/aria/Esc/initial-focus
 * behaviour on the consuming components.
 *
 * Only Tab is intercepted; all other keys (including typing in inputs) are
 * completely unaffected.
 */
import { type RefObject, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Focusable-element selector
// ---------------------------------------------------------------------------

/**
 * CSS selector that matches all element types that are normally focusable in a
 * browser. Each variant explicitly excludes tabindex="-1" (elements removed from
 * the tab order) and disabled elements. The `[tabindex]` branch catches custom
 * interactive elements and containers that set tabIndex=0.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Return all focusable descendants of `container` in DOM order.
 * Exported as a pure helper so it can be tested independently.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Trap keyboard focus inside `ref.current` while `active` is true.
 *
 * @param ref    - A ref attached to the dialog/modal container element.
 * @param active - Whether the trap is currently engaged (pass the modal `open` state).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return

    const container = ref.current
    if (!container) return

    // Remember what had focus before the modal opened so we can return focus
    // there when it closes (WCAG 2.4.3 Focus Order). Captured before we move
    // focus into the container below.
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move focus into the container if it is not already inside.
    if (!container.contains(document.activeElement)) {
      const first = getFocusableElements(container)[0] ?? container
      first.focus()
    }

    /**
     * Keydown handler attached to the container.
     * Only intercepts Tab and Shift+Tab; all other keys bubble normally.
     */
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return

      const focusable = getFocusableElements(container!)
      if (focusable.length === 0) return

      // Safe: length is > 0, so both indices are valid.
      const first = focusable[0] as HTMLElement
      const last = focusable[focusable.length - 1] as HTMLElement

      if (e.shiftKey) {
        // Shift+Tab from the first element: wrap to the last.
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        // Tab from the last element: wrap to the first.
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // Return focus to the opener when the modal closes. Only do so when focus
      // is "loose" - i.e. nothing meaningful holds it: either it is gone (body /
      // null, which happens when the modal element unmounts) or still inside the
      // closing container. If the user/app already moved focus to some other
      // real element, we must NOT steal it back.
      const current = document.activeElement
      const focusIsLoose =
        current === null || current === document.body || container.contains(current)
      if (
        focusIsLoose &&
        previouslyFocused &&
        previouslyFocused.isConnected &&
        typeof previouslyFocused.focus === 'function'
      ) {
        previouslyFocused.focus()
      }
    }
  }, [ref, active])
}
