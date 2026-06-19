import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipc-channels'

type SubscribeCb = (err: Error | null, events: { type: string; path: string }[]) => void

// vi.mock is hoisted above all module-level code, so the mock fns it closes
// over must be hoisted with it. vi.hoisted keeps the state (and the captured
// callback) accessible to the tests below without a temporal-dead-zone crash.
const mock = vi.hoisted(() => {
  const unsubscribe = vi.fn(() => Promise.resolve())
  const state: { cb: SubscribeCb | null } = { cb: null }
  const subscribe = vi.fn((_dir: string, cb: SubscribeCb, _opts: unknown) => {
    state.cb = cb
    return Promise.resolve({ unsubscribe })
  })
  return { unsubscribe, subscribe, state }
})
const { subscribe, unsubscribe } = mock
vi.mock('@parcel/watcher', () => ({ default: { subscribe: mock.subscribe } }))

import { watchFolder, unwatchFolder } from '@main/folderWatcher'

function makeWin() {
  const send = vi.fn()
  const win = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send },
  }
  return { win, send }
}

beforeEach(() => {
  vi.useFakeTimers()
  mock.state.cb = null
  subscribe.mockClear()
  unsubscribe.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('folderWatcher', () => {
  it('subscribes with ignore globs and emits debounced, deduped changed dirs', async () => {
    const { win, send } = makeWin()
    await watchFolder(win as never, '/proj')

    expect(subscribe).toHaveBeenCalledTimes(1)
    const opts = subscribe.mock.calls[0]![2] as { ignore: string[] }
    expect(opts.ignore).toContain('**/node_modules/**')

    mock.state.cb!(null, [{ type: 'create', path: '/proj/a.md' }])
    mock.state.cb!(null, [{ type: 'create', path: '/proj/sub/b.md' }])
    expect(send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(250)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(IPC.folderChanged, {
      dirs: expect.arrayContaining(['/proj', '/proj/sub']),
    })
  })

  it('does not send when the batch yields no non-ignored dirs', async () => {
    const { win, send } = makeWin()
    await watchFolder(win as never, '/proj')
    mock.state.cb!(null, [{ type: 'create', path: '/proj/node_modules/x/i.js' }])
    await vi.advanceTimersByTimeAsync(250)
    expect(send).not.toHaveBeenCalled()
  })

  it('replaces the prior subscription when the same window switches folders', async () => {
    const { win } = makeWin()
    await watchFolder(win as never, '/proj')
    await watchFolder(win as never, '/other')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(2)
  })

  it('unwatchFolder tears down the subscription and a pending emit', async () => {
    const { win, send } = makeWin()
    await watchFolder(win as never, '/proj')
    mock.state.cb!(null, [{ type: 'create', path: '/proj/a.md' }])
    await unwatchFolder(win as never)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(250)
    expect(send).not.toHaveBeenCalled()
  })

  it('does not send to a destroyed window', async () => {
    const send = vi.fn()
    const win = { isDestroyed: () => true, webContents: { isDestroyed: () => true, send } }
    await watchFolder(win as never, '/proj')
    mock.state.cb!(null, [{ type: 'create', path: '/proj/a.md' }])
    await vi.advanceTimersByTimeAsync(250)
    expect(send).not.toHaveBeenCalled()
  })
})
