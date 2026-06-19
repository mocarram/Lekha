import { realpathSync } from 'node:fs'
import type { BrowserWindow } from 'electron'
import watcher from '@parcel/watcher'
import { IPC } from '@shared/ipc-channels'
import { changedDirsFromEvents, remapToWatchedRoot } from './watcherEvents'

/** Coalesce bursts of FS events into one refresh per window. */
const DEBOUNCE_MS = 250

/** Directories never worth watching (matches the tree's filters). */
const IGNORE_GLOBS = ['**/node_modules/**', '**/.git/**', '**/.*']

interface WatchState {
  subscription: { unsubscribe: () => Promise<void> } | null
  timer: ReturnType<typeof setTimeout> | null
  pending: Set<string>
}

/**
 * Per-window watch state. A WeakMap so a closed window's JS state can be GC'd.
 * INVARIANT: the window's 'closed' handler MUST call unwatchFolder(win) - the
 * native @parcel/watcher subscription is not released by GC alone.
 */
const watches = new WeakMap<BrowserWindow, WatchState>()

function flush(win: BrowserWindow, state: WatchState): void {
  state.timer = null
  const dirs = [...state.pending]
  state.pending.clear()
  if (dirs.length === 0) return
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(IPC.folderChanged, { dirs })
}

/**
 * Watch `dir` recursively for `win`, replacing any prior subscription for that
 * window. FS events are mapped to changed parent directories, deduped, and
 * pushed to the window (debounced) as IPC.folderChanged { dirs }.
 */
export async function watchFolder(win: BrowserWindow, dir: string): Promise<void> {
  await unwatchFolder(win)
  const state: WatchState = { subscription: null, timer: null, pending: new Set() }
  watches.set(win, state)

  // @parcel/watcher (FSEvents) reports symlink-resolved paths, but the tree
  // keys nodes by the unresolved `dir` it was opened with. Resolve the real
  // root once so we can remap each reported dir back into `dir`'s namespace.
  let realRoot = dir
  try {
    realRoot = realpathSync(dir)
  } catch {
    // dir may not exist yet; subscribe will fail below and we bail. Use dir as-is.
  }

  let subscription: { unsubscribe: () => Promise<void> }
  try {
    subscription = await watcher.subscribe(
      dir,
      (err, events) => {
        if (err) {
          console.error('[folderWatcher] watcher callback error:', err)
          return
        }
        for (const d of changedDirsFromEvents(events)) {
          state.pending.add(remapToWatchedRoot(d, realRoot, dir))
        }
        if (state.pending.size === 0) return
        if (state.timer === null) {
          state.timer = setTimeout(() => flush(win, state), DEBOUNCE_MS)
        }
      },
      { ignore: IGNORE_GLOBS },
    )
  } catch (err) {
    console.error('[folderWatcher] subscribe failed:', err)
    watches.delete(win)
    return
  }

  if (watches.get(win) !== state) {
    await subscription.unsubscribe().catch(() => {})
    return
  }
  state.subscription = subscription
}

/** Stop watching for `win` and cancel any pending emit. */
export async function unwatchFolder(win: BrowserWindow): Promise<void> {
  const state = watches.get(win)
  if (!state) return
  watches.delete(win)
  if (state.timer !== null) {
    clearTimeout(state.timer)
    state.timer = null
  }
  state.pending.clear()
  if (state.subscription) {
    await state.subscription.unsubscribe().catch(() => {})
    state.subscription = null
  }
}
