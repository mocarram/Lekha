/**
 * commandBus.ts - the web stand-in for the desktop native menu.
 *
 * On the desktop, application commands (Open, Save, Command Palette, Bold, ...)
 * originate in the OS menu and reach the renderer via window.lekha.onCommand.
 * The browser has no native menu, so the web keyboard bridge (keymap.ts) and
 * any in-page menu dispatch through this bus instead; the adapter's onCommand
 * simply subscribes to it, so the renderer's useCommands dispatcher is unaware
 * it is not talking to a real menu.
 */
import type { AppCommand } from '@shared/commands'

const listeners = new Set<(cmd: AppCommand) => void>()

export function onCommand(cb: (cmd: AppCommand) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function dispatchCommand(cmd: AppCommand): void {
  for (const cb of listeners) cb(cmd)
}
