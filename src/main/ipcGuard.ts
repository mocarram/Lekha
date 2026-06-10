/**
 * ipcGuard.ts - sender validation for every IPC registration.
 *
 * Standard Electron hardening: only honor IPC from the app's own TOP frame.
 * The app never loads remote content, denies child windows, and its CSP
 * forbids frames, so no foreign frame should ever exist - this guard is the
 * belt-and-braces layer that keeps that assumption enforced at the IPC
 * boundary rather than assumed.
 *
 * All main-process modules register through `guardedIpc.handle/on` instead of
 * `ipcMain.handle/on` directly; the wrapper rejects (handle) or drops (on)
 * events whose sender frame is not the sending WebContents' main frame.
 */
import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'

/** True when the event came from the sender's top frame (never a subframe). */
export function isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return event.senderFrame !== null && event.senderFrame === event.sender.mainFrame
}

export const guardedIpc = {
  /** ipcMain.handle with a sender check; untrusted senders get a rejection. */
  handle<Args extends unknown[]>(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: Args) => unknown,
  ): void {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isTrustedSender(event)) {
        throw new Error('IPC request rejected: untrusted sender frame')
      }
      return listener(event, ...(args as Args))
    })
  },

  /** ipcMain.on with a sender check; untrusted events are silently dropped. */
  on<Args extends unknown[]>(
    channel: string,
    listener: (event: IpcMainEvent, ...args: Args) => void,
  ): void {
    ipcMain.on(channel, (event, ...args: unknown[]) => {
      if (!isTrustedSender(event)) return
      listener(event, ...(args as Args))
    })
  },
}
