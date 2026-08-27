/**
 * keymap.ts - browser keyboard shortcuts -> AppCommand, dispatched through the
 * command bus.
 *
 * In-editor formatting shortcuts (Cmd+B, Cmd+I, headings, lists, undo/redo ...)
 * are already bound by the ProseMirror keymap when the editor is focused, so we
 * deliberately do NOT rebind those here - only the application-level commands
 * the desktop app routes through its native menu. A handful (Cmd+O, Cmd+S,
 * Cmd+P, Cmd+F, Cmd+plus/minus) shadow a browser default; for those we
 * preventDefault so Lekha wins.
 */
import type { AppCommand } from '@shared/commands'
import { dispatchCommand } from './commandBus'

const isMac = /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent)

/** Resolve a keydown to an AppCommand, or null if we don't handle it. */
function resolve(e: KeyboardEvent): AppCommand | null {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (!mod) return null
  const key = e.key.toLowerCase()
  const shift = e.shiftKey
  const alt = e.altKey

  switch (key) {
    case 'o':
      return shift ? 'openFolder' : 'open'
    case 's':
      return shift ? 'saveAs' : 'save'
    case 'n':
      return 'new'
    case 'k':
      return 'commandPalette'
    case 'p':
      return shift ? 'commandPalette' : 'quickOpen'
    case 'f':
      return shift ? 'replace' : 'find'
    case 'e':
      return 'toggleSource'
    case '\\':
      return 'toggleSidebar'
    case ',':
      return 'preferences'
    case 'w':
      return 'closeTab'
    case '=':
    case '+':
      return 'zoomIn'
    case '-':
      return 'zoomOut'
    case '0':
      return 'zoomReset'
    case 'arrowright':
      return alt ? 'nextTab' : null
    case 'arrowleft':
      return alt ? 'previousTab' : null
    default:
      return null
  }
}

export function installKeymap(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      const cmd = resolve(e)
      if (!cmd) return
      e.preventDefault()
      dispatchCommand(cmd)
    },
    // Capture so we beat the editor/browser for the app-level combos we own.
    { capture: true },
  )
}
