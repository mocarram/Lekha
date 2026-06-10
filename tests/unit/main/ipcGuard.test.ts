// @vitest-environment node
/**
 * ipcGuard: every IPC registration goes through guardedIpc, which only honors
 * events whose senderFrame is the sending WebContents' MAIN frame. We mock
 * 'electron' to capture the wrapped listeners and invoke them with fake events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const handleListeners = new Map<string, (...args: unknown[]) => unknown>()
const onListeners = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handleListeners.set(channel, fn)
    },
    on: (channel: string, fn: (...args: unknown[]) => unknown) => {
      onListeners.set(channel, fn)
    },
  },
}))

import { guardedIpc, isTrustedSender } from '@main/ipcGuard'

const FRAME = {}
const trusted = { senderFrame: FRAME, sender: { mainFrame: FRAME } }
const subframe = { senderFrame: {}, sender: { mainFrame: FRAME } }
const destroyed = { senderFrame: null, sender: { mainFrame: FRAME } }

beforeEach(() => {
  handleListeners.clear()
  onListeners.clear()
})

describe('isTrustedSender', () => {
  it('accepts only the main frame', () => {
    expect(isTrustedSender(trusted as never)).toBe(true)
    expect(isTrustedSender(subframe as never)).toBe(false)
    expect(isTrustedSender(destroyed as never)).toBe(false)
  })
})

describe('guardedIpc.handle', () => {
  it('forwards trusted events and rejects subframes/destroyed frames', async () => {
    const impl = vi.fn(() => 'ok')
    guardedIpc.handle('test:channel', impl)
    const wrapped = handleListeners.get('test:channel')!

    expect(wrapped(trusted, 1, 2)).toBe('ok')
    expect(impl).toHaveBeenCalledWith(trusted, 1, 2)

    expect(() => wrapped(subframe)).toThrow(/untrusted sender/)
    expect(() => wrapped(destroyed)).toThrow(/untrusted sender/)
    expect(impl).toHaveBeenCalledTimes(1)
  })
})

describe('guardedIpc.on', () => {
  it('forwards trusted events and silently drops untrusted ones', () => {
    const impl = vi.fn()
    guardedIpc.on('test:event', impl)
    const wrapped = onListeners.get('test:event')!

    wrapped(trusted, 'payload')
    expect(impl).toHaveBeenCalledWith(trusted, 'payload')

    wrapped(subframe, 'payload')
    wrapped(destroyed, 'payload')
    expect(impl).toHaveBeenCalledTimes(1)
  })
})
