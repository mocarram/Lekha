# Lazy File Tree (Phase 2 - Filesystem Watcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When files/folders are added, removed, or renamed in the open folder - even by another app - the lazy sidebar tree updates live, without polling and without hurting performance.

**Architecture:** A `@parcel/watcher` subscription in the MAIN process (FSEvents on macOS) watches the open root per window. Batched events map to their parent directories, deduped and debounced (~250ms), and are pushed to the owning window via a `folderChanged` IPC event. The renderer re-reads only the directories that are currently LOADED (via the existing `loadChildren`/`setChildren` merge-preserving patch); collapsed/unloaded dirs are ignored until expanded. The renderer is the source of truth for "which folder is open," so it tells main what to watch via a `watchFolder(dir | null)` IPC whenever `rootFolder` changes; main starts/replaces/stops the per-window subscription and tears it down on window close.

**Tech Stack:** Electron 41 + electron-vite + React + Zustand; `@parcel/watcher` (native, N-API prebuilds); Vitest (unit) + Playwright-Electron (e2e). Node 22 required.

**Spec:** `docs/superpowers/specs/2026-06-19-live-folder-tree-design.md` (Phase 2 section). **Builds on Phase 1** (branch `feat/lazy-tree`; this branch `feat/lazy-tree-watcher` is based on it).

---

## Environment note (read first)

Shell default `node` is **v14** (nvm); this project needs **node 22**. Every `npm`/build/test **and `git commit`** (husky hooks run node) MUST be prefixed with:

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
```

Test runner is `npm test` (vitest run); filter with `npm test -- <name>`. e2e is `npm run test:e2e` (its `pretest:e2e` runs `npm run build` first). There is **no** `verify` script - run `npm run typecheck && npm run lint && npm test && npm run build` individually. Work on branch **`feat/lazy-tree-watcher`**. **Do not push.** Commit per task. Conventional-commit: lowercase subject, body lines <100 chars, NO `Co-Authored-By`. Project has `exactOptionalPropertyTypes: true` - never write `children: undefined` in fixtures; omit the key.

## Design decisions (locked)

1. **Renderer drives watch state.** The renderer calls `watchFolder(rootFolder)` whenever its open root changes (open, switch, restore, close→null). Main maps the IPC sender to its `BrowserWindow` and starts/replaces/stops that window's single recursive subscription. This is robust across every way a root changes (dialog, by-path, session restore) and handles multi-window naturally. Main calls `assertPathAllowed(dir)` before subscribing (never watch an unallowed path).
2. **`@parcel/watcher` goes in `dependencies`** (NOT devDependencies) so electron-vite's `externalizeDepsPlugin` keeps it external and it resolves from `node_modules` at runtime. Its prebuilt binaries are **N-API**, ABI-stable across Node/Electron, so no rebuild is needed for Electron 41 (`npmRebuild: false` stays). For the packaged app, `asarUnpack` ships the `.node` outside the asar (validated at release time; not exercised by e2e, which launches from source).
3. **Ignore at the watcher:** globs `['**/node_modules/**', '**/.git/**', '**/.*']` so dotfiles/`.git`/`node_modules` never flood events - matching the tree's own filters. The pure event→dirs helper also defensively filters these.
4. **Re-read only LOADED dirs.** A changed dir that is collapsed/unloaded is ignored (it reads fresh on expand). A change to a file directly in root re-reads the root. `mergePreserveLoaded` keeps expanded descendants intact. expandedPaths/selection/scroll are preserved (already keyed by path).
5. **macOS-only**, single recursive subscription per open root per window, 250ms debounce + dir dedupe, torn down on folder switch/close and window close.

## File structure

- `package.json` - add `@parcel/watcher` to `dependencies`.
- `electron-builder.yml` - `asarUnpack` for `@parcel/watcher`.
- `src/main/watcherEvents.ts` - **new**: pure `changedDirsFromEvents(events)` (event→deduped parent dirs + ignore filter). Unit-tested.
- `src/main/folderWatcher.ts` - **new**: per-window subscribe / debounce+dedupe / emit / teardown. Unit-tested with a mocked `@parcel/watcher`.
- `src/shared/ipc-channels.ts` - add `watchFolder` + `folderChanged` channels.
- `src/preload/index.ts` + `src/preload/api.d.ts` - `watchFolder(dir)` invoke + `onFolderChanged(cb)` listener.
- `src/main/ipc/files.ts` - register the `watchFolder` IPC handler (resolve sender window, assertPathAllowed, call folderWatcher).
- `src/main/window.ts` - tear down the watcher in the window `'closed'` handler.
- `src/renderer/hooks/useFolderWatcher.ts` - **new**: calls `watchFolder` on root change; on `folderChanged`, re-reads loaded changed dirs. Mounted in `src/renderer/App.tsx`.
- Tests: `tests/unit/main/watcherEvents.test.ts`, `tests/unit/main/folderWatcher.test.ts`, `tests/unit/hooks/useFolderWatcher.test.ts` (all new), `tests/e2e/watcherLive.spec.ts` (new).

---

## Task 1: Add `@parcel/watcher` dependency + packaging config

**Files:** `package.json`, `electron-builder.yml`

- [ ] **Step 1: Install `@parcel/watcher` as a runtime dependency**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm install @parcel/watcher@^2.5.1
```

This adds `@parcel/watcher` to `dependencies` and pulls the platform prebuild (`@parcel/watcher-darwin-arm64` / `-x64`) as optional deps.

- [ ] **Step 2: Confirm it loads under node 22 AND that electron-vite externalizes it**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
node -e "const w=require('@parcel/watcher'); console.log('subscribe is', typeof w.subscribe)"
```

Expected: `subscribe is function`. Then confirm `electron.vite.config.*` (read it) uses `externalizeDepsPlugin` for the main build (it should - that's the electron-vite default). If it has an explicit `external`/`exclude` list, ensure `@parcel/watcher` is treated as external (not bundled). Note in your report what you found.

- [ ] **Step 3: Add `asarUnpack` to `electron-builder.yml`**

Replace the comment block:

```yaml
# No native modules to unpack - Lekha has no .node binaries
# asarUnpack left empty intentionally
```

with:

```yaml
# @parcel/watcher ships native .node prebuilds; they must live outside the asar.
asarUnpack:
  - '**/node_modules/@parcel/watcher*/**'
```

Leave `npmRebuild: false` as-is (N-API prebuilds need no rebuild).

- [ ] **Step 4: Verify build still works**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run build
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add package.json package-lock.json electron-builder.yml
git commit -m "build(tree): add @parcel/watcher dependency and asarUnpack"
```

---

## Task 2: Pure event→dirs helper (`watcherEvents.ts`)

**Files:** Create `src/main/watcherEvents.ts`; Test `tests/unit/main/watcherEvents.test.ts`.

A watcher batch is an array of `{ type: 'create' | 'update' | 'delete', path: string }`. The sidebar only cares about which **parent directories** changed. This pure helper maps a batch to a deduped list of parent dirs, dropping anything under an ignored segment (defensive belt-and-suspenders against the watcher's own `ignore`).

- [ ] **Step 1: Write the failing tests** - create `tests/unit/main/watcherEvents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { changedDirsFromEvents, type WatcherEvent } from '@main/watcherEvents'

describe('changedDirsFromEvents', () => {
  it('maps each event to its parent directory, deduped', () => {
    const events: WatcherEvent[] = [
      { type: 'create', path: '/proj/a.md' },
      { type: 'delete', path: '/proj/b.md' }, // same parent as a.md
      { type: 'create', path: '/proj/sub/c.md' },
    ]
    expect(changedDirsFromEvents(events).sort()).toEqual(['/proj', '/proj/sub'])
  })

  it('drops events under node_modules, .git, and dotfiles/dotdirs', () => {
    const events: WatcherEvent[] = [
      { type: 'create', path: '/proj/node_modules/x/index.js' },
      { type: 'create', path: '/proj/.git/HEAD' },
      { type: 'update', path: '/proj/.hidden.md' },
      { type: 'create', path: '/proj/.cache/data' },
      { type: 'create', path: '/proj/keep.md' },
    ]
    expect(changedDirsFromEvents(events)).toEqual(['/proj'])
  })

  it('returns an empty array for an empty batch', () => {
    expect(changedDirsFromEvents([])).toEqual([])
  })

  it('treats a changed directory entry as a change to its parent', () => {
    // A new directory /proj/newdir -> its parent /proj must re-read to show it.
    expect(changedDirsFromEvents([{ type: 'create', path: '/proj/newdir' }])).toEqual(['/proj'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm test -- watcherEvents
```

Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement `src/main/watcherEvents.ts`**

```typescript
import { dirname } from 'node:path'

export interface WatcherEvent {
  type: 'create' | 'update' | 'delete'
  path: string
}

/** A path segment that should never produce a tree refresh. */
function isIgnoredPath(p: string): boolean {
  // Split into segments; ignore anything inside node_modules / .git, or any
  // dotfile/dotdir segment (matches the tree's own filters so we never flood).
  const segments = p.split('/')
  return segments.some(
    (seg) => seg === 'node_modules' || seg === '.git' || (seg.startsWith('.') && seg.length > 1),
  )
}

/**
 * Maps a batch of watcher events to the unique set of PARENT directories that
 * changed, dropping events under ignored paths. Pure and deterministic - the
 * renderer re-reads each returned dir if it is currently loaded.
 */
export function changedDirsFromEvents(events: WatcherEvent[]): string[] {
  const dirs = new Set<string>()
  for (const event of events) {
    if (isIgnoredPath(event.path)) continue
    dirs.add(dirname(event.path))
  }
  return [...dirs]
}
```

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm test -- watcherEvents
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/main/watcherEvents.ts tests/unit/main/watcherEvents.test.ts
git commit -m "feat(tree): pure watcher event-to-dirs helper"
```

---

## Task 3: `folderWatcher.ts` - per-window subscribe / debounce / emit / teardown

**Files:** Create `src/main/folderWatcher.ts`; Test `tests/unit/main/folderWatcher.test.ts`.

This module owns the `@parcel/watcher` subscriptions, keyed by `BrowserWindow`. It accumulates changed dirs across batches, debounces 250ms, and pushes `IPC.folderChanged` to the owning window's `webContents`. It imports `changedDirsFromEvents` from Task 2 and the `IPC` channel constant.

**Public API:**

- `watchFolder(win: BrowserWindow, dir: string): Promise<void>` - tears down any existing subscription for `win`, subscribes to `dir` with the ignore globs, wires the debounced emitter.
- `unwatchFolder(win: BrowserWindow): Promise<void>` - tears down `win`'s subscription + clears its timer.

**Important for testability:** the module must accept `@parcel/watcher` via a default import that tests can mock with `vi.mock('@parcel/watcher', ...)`. Use `import watcher from '@parcel/watcher'` then `watcher.subscribe(...)`. Use a 250ms `DEBOUNCE_MS` constant. Guard all sends with `win.isDestroyed()` / `win.webContents.isDestroyed()`.

- [ ] **Step 1: Write the failing tests** - create `tests/unit/main/folderWatcher.test.ts`. Mock `@parcel/watcher` and `BrowserWindow`; use fake timers.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IPC } from '@shared/ipc-channels'

// Capture the subscribe callback so tests can drive events manually.
let subscribeCb: ((err: Error | null, events: { type: string; path: string }[]) => void) | null =
  null
const unsubscribe = vi.fn(() => Promise.resolve())
const subscribe = vi.fn((_dir: string, cb: typeof subscribeCb, _opts: unknown) => {
  subscribeCb = cb
  return Promise.resolve({ unsubscribe })
})
vi.mock('@parcel/watcher', () => ({ default: { subscribe } }))

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
  subscribeCb = null
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

    // Two batches within the debounce window -> one coalesced emit.
    subscribeCb!(null, [{ type: 'create', path: '/proj/a.md' }])
    subscribeCb!(null, [{ type: 'create', path: '/proj/sub/b.md' }])
    expect(send).not.toHaveBeenCalled() // still within debounce

    await vi.advanceTimersByTimeAsync(250)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(IPC.folderChanged, {
      dirs: expect.arrayContaining(['/proj', '/proj/sub']),
    })
  })

  it('does not send when the batch yields no non-ignored dirs', async () => {
    const { win, send } = makeWin()
    await watchFolder(win as never, '/proj')
    subscribeCb!(null, [{ type: 'create', path: '/proj/node_modules/x/i.js' }])
    await vi.advanceTimersByTimeAsync(250)
    expect(send).not.toHaveBeenCalled()
  })

  it('replaces the prior subscription when the same window switches folders', async () => {
    const { win } = makeWin()
    await watchFolder(win as never, '/proj')
    await watchFolder(win as never, '/other')
    expect(unsubscribe).toHaveBeenCalledTimes(1) // old one torn down
    expect(subscribe).toHaveBeenCalledTimes(2)
  })

  it('unwatchFolder tears down the subscription and a pending emit', async () => {
    const { win, send } = makeWin()
    await watchFolder(win as never, '/proj')
    subscribeCb!(null, [{ type: 'create', path: '/proj/a.md' }])
    await unwatchFolder(win as never)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(250)
    expect(send).not.toHaveBeenCalled() // pending emit was cancelled
  })

  it('does not send to a destroyed window', async () => {
    const send = vi.fn()
    const win = { isDestroyed: () => true, webContents: { isDestroyed: () => true, send } }
    await watchFolder(win as never, '/proj')
    subscribeCb!(null, [{ type: 'create', path: '/proj/a.md' }])
    await vi.advanceTimersByTimeAsync(250)
    expect(send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm test -- folderWatcher
```

Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement `src/main/folderWatcher.ts`**

```typescript
import type { BrowserWindow } from 'electron'
import watcher from '@parcel/watcher'
import { IPC } from '@shared/ipc-channels'
import { changedDirsFromEvents, type WatcherEvent } from './watcherEvents'

/** Coalesce bursts of FS events into one refresh per window. */
const DEBOUNCE_MS = 250

/** Directories never worth watching (matches the tree's filters). */
const IGNORE_GLOBS = ['**/node_modules/**', '**/.git/**', '**/.*']

interface WatchState {
  subscription: { unsubscribe: () => Promise<void> } | null
  timer: ReturnType<typeof setTimeout> | null
  pending: Set<string>
}

const watches = new Map<BrowserWindow, WatchState>()

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

  let subscription: { unsubscribe: () => Promise<void> }
  try {
    subscription = await watcher.subscribe(
      dir,
      (err, events) => {
        if (err) return // transient watcher error; next event will recover
        for (const d of changedDirsFromEvents(events as WatcherEvent[])) state.pending.add(d)
        if (state.pending.size === 0) return
        if (state.timer === null) {
          state.timer = setTimeout(() => flush(win, state), DEBOUNCE_MS)
        }
      },
      { ignore: IGNORE_GLOBS },
    )
  } catch {
    // Subscription failed (path gone, limits). Leave the window unwatched.
    watches.delete(win)
    return
  }

  // A concurrent unwatch/replace may have superseded us while awaiting.
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
```

> Note the await-race guard: `subscribe` is async, so a `watchFolder('/other')` or `unwatchFolder` can land while the first `subscribe` is in flight. The `watches.get(win) !== state` check after the await ensures a superseded subscription is immediately unsubscribed and never wired up. Verify your test for "replaces prior subscription" still passes given this ordering (the second `watchFolder` first awaits `unwatchFolder`, which finds no subscription yet if the first await hasn't resolved - acceptable; the e2e covers the real timing).

- [ ] **Step 4: Run to verify pass**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm test -- folderWatcher
npm run typecheck
npm run lint
```

Expected: PASS. If the "replaces prior subscription" test is order-sensitive under the await-race guard, adjust the test to `await` the first `watchFolder` fully before the second (the mock resolves synchronously via `Promise.resolve`, so `await watchFolder(...)` completes the subscribe before the next call).

- [ ] **Step 5: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/main/folderWatcher.ts tests/unit/main/folderWatcher.test.ts
git commit -m "feat(tree): per-window folder watcher with debounced dir emits"
```

---

## Task 4: IPC channels + preload (`watchFolder` invoke, `folderChanged` event)

**Files:** `src/shared/ipc-channels.ts`, `src/preload/index.ts`, `src/preload/api.d.ts`. Test: covered by Task 5/6 + typecheck.

- [ ] **Step 1: Add the channels** - in `src/shared/ipc-channels.ts`, add two entries to the `IPC` object (place near the other `fs:` channels and the main→renderer `app:` channels respectively):

```typescript
  /** Renderer -> main: start/replace/stop watching the open folder (null = stop). */
  watchFolder: 'fs:watchFolder',
  /** Main -> renderer: directories changed on disk in the watched root. */
  folderChanged: 'fs:folderChanged',
```

> Read the file first; match its existing formatting and the `AppCommand`-style comment convention.

- [ ] **Step 2: Add the preload bridge** - in `src/preload/index.ts`:

Add an invoke method (near `readDir`):

```typescript
  watchFolder(dir: string | null): Promise<void> {
    return ipcRenderer.invoke(IPC.watchFolder, dir) as Promise<void>
  },
```

Add a listener (near `onCommand`), mirroring its unsubscribe pattern:

```typescript
  onFolderChanged(cb: (payload: { dirs: string[] }) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: { dirs: string[] }) =>
      cb(payload)
    ipcRenderer.on(IPC.folderChanged, listener)
    return () => ipcRenderer.removeListener(IPC.folderChanged, listener)
  },
```

- [ ] **Step 3: Add the types** - in `src/preload/api.d.ts`, add to the API interface:

```typescript
  /**
   * Tell the main process which folder this window has open so it can watch it
   * for live changes. Pass null to stop watching (folder closed).
   */
  watchFolder(dir: string | null): Promise<void>
  /**
   * Subscribe to folder-change notifications from the watcher. The callback
   * receives the directories that changed on disk. Returns an unsubscribe fn.
   */
  onFolderChanged(cb: (payload: { dirs: string[] }) => void): () => void
```

- [ ] **Step 4: Typecheck**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/shared/ipc-channels.ts src/preload/index.ts src/preload/api.d.ts
git commit -m "feat(tree): watchFolder/folderChanged IPC channels and preload"
```

---

## Task 5: Main wiring - handle `watchFolder`, tear down on window close

**Files:** `src/main/ipc/files.ts` (register the handler), `src/main/window.ts` (close teardown). Test: `tests/unit/main/folderWatcher.test.ts` already covers folderWatcher; this task is integration wiring verified by typecheck + e2e.

**Context:** Read `src/main/ipc/dialog.ts` to see the `guardedIpc.handle(IPC.x, async (event) => { const win = senderWindow(event); ... })` pattern and where `senderWindow` is imported from. Read `src/main/ipc/files.ts` to see how `safeHandle`/`assertPathAllowed` are imported and used. Read `src/main/window.ts:317-381` `createWindow` and its `win.on('closed', ...)` handler.

- [ ] **Step 1: Register the `watchFolder` handler** - in `src/main/ipc/files.ts`, add a handler that resolves the sender window, validates the path, and calls the watcher. Use the same `event`-providing handle and `senderWindow` helper that `dialog.ts` uses (import them the same way). Add imports for `watchFolder`, `unwatchFolder` from `@main/folderWatcher`:

```typescript
guardedIpc.handle(IPC.watchFolder, async (event, dir) => {
  const win = senderWindow(event)
  if (!win) return
  if (dir === null || dir === undefined) {
    await unwatchFolder(win)
    return
  }
  // Only watch a path the renderer is already permitted to read.
  assertPathAllowed(String(dir))
  await watchFolder(win, String(dir))
})
```

> Match the exact registrar (`guardedIpc.handle` vs `safeHandle`) and `senderWindow` import that `dialog.ts` uses. If `files.ts` doesn't currently import `senderWindow`/`guardedIpc`, add the imports from the same modules `dialog.ts` imports them from.

- [ ] **Step 2: Tear down the watcher on window close** - in `src/main/window.ts` `createWindow`, the `win.on('closed', ...)` handler currently does `registry.remove(win); onClosed?.(win)`. Add a watcher teardown (fire-and-forget; the window is already gone). Import `unwatchFolder` from `./folderWatcher`:

```typescript
win.on('closed', () => {
  void unwatchFolder(win)
  registry.remove(win)
  onClosed?.(win)
})
```

- [ ] **Step 3: Typecheck + lint + full unit suite**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run typecheck
npm run lint
npm test
```

Expected: PASS (no unit regressions).

- [ ] **Step 4: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/main/ipc/files.ts src/main/window.ts
git commit -m "feat(tree): wire watchFolder IPC and window-close teardown"
```

---

## Task 6: Renderer `useFolderWatcher` hook + App mount

**Files:** Create `src/renderer/hooks/useFolderWatcher.ts`; modify `src/renderer/App.tsx`. Test: `tests/unit/hooks/useFolderWatcher.test.ts` (new).

**Context:** Read how `App.tsx` mounts other effect-only hooks (e.g. `useAutoSave`, the `onCommand` effect) and how it accesses `fileOps` (the `useFileOps` return) and the workspace store. The hook does two things: (a) when `rootFolder` changes, tell main to watch it; (b) when `folderChanged` arrives, re-read each changed dir that is currently loaded.

- [ ] **Step 1: Write the failing tests** - create `tests/unit/hooks/useFolderWatcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFolderWatcher } from '../../../src/renderer/hooks/useFolderWatcher'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import type { FileNode } from '../../../src/shared/types'

let folderChangedCb: ((payload: { dirs: string[] }) => void) | null = null

function makeLekha() {
  return {
    watchFolder: vi.fn(() => Promise.resolve()),
    onFolderChanged: vi.fn((cb: (p: { dirs: string[] }) => void) => {
      folderChangedCb = cb
      return () => {
        folderChangedCb = null
      }
    }),
  }
}

beforeEach(() => {
  folderChangedCb = null
  useWorkspaceStore.setState({ rootFolder: null, fileTree: [] })
})

describe('useFolderWatcher', () => {
  it('tells main to watch the open root when it changes', async () => {
    const lekha = makeLekha()
    vi.stubGlobal('lekha', lekha)
    const loadChildren = vi.fn(() => Promise.resolve())

    renderHook(() => useFolderWatcher({ loadChildren }))
    expect(lekha.watchFolder).toHaveBeenCalledWith(null) // no folder yet

    await act(async () => {
      useWorkspaceStore.getState().setRootFolder('/proj')
    })
    expect(lekha.watchFolder).toHaveBeenCalledWith('/proj')
  })

  it('re-reads a changed dir only when it is currently loaded', async () => {
    const lekha = makeLekha()
    vi.stubGlobal('lekha', lekha)
    const loadChildren = vi.fn(() => Promise.resolve())
    // root loaded; /proj/sub loaded; /proj/other NOT loaded (children omitted)
    const tree: FileNode[] = [
      { name: 'sub', path: '/proj/sub', isDirectory: true, children: [] },
      { name: 'other', path: '/proj/other', isDirectory: true },
    ]
    useWorkspaceStore.setState({ rootFolder: '/proj', fileTree: tree })

    renderHook(() => useFolderWatcher({ loadChildren }))

    await act(async () => {
      folderChangedCb!({ dirs: ['/proj/sub', '/proj/other', '/proj'] })
    })

    // loaded dirs (root + sub) re-read; unloaded 'other' skipped.
    expect(loadChildren).toHaveBeenCalledWith('/proj/sub')
    expect(loadChildren).toHaveBeenCalledWith('/proj')
    expect(loadChildren).not.toHaveBeenCalledWith('/proj/other')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm test -- useFolderWatcher
```

Expected: FAIL - hook does not exist.

- [ ] **Step 3: Implement `src/renderer/hooks/useFolderWatcher.ts`**

```typescript
import { useEffect } from 'react'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { loadedDirPaths } from '@renderer/store/treeOps'

interface UseFolderWatcherDeps {
  /** Re-read one directory and patch it into the tree (from useFileOps). */
  loadChildren: (dir: string) => Promise<void>
}

/**
 * Keeps the main-process filesystem watcher pointed at this window's open root,
 * and applies live changes: when the watcher reports changed directories, each
 * one that is currently LOADED (or the root) is re-read in place. Collapsed /
 * unloaded directories are ignored - they read fresh when expanded.
 */
export function useFolderWatcher({ loadChildren }: UseFolderWatcherDeps): void {
  const rootFolder = useWorkspaceStore((s) => s.rootFolder)

  // (a) Point the watcher at the current root (null = stop) whenever it changes.
  useEffect(() => {
    void window.lekha.watchFolder(rootFolder)
  }, [rootFolder])

  // (b) Apply change notifications to loaded directories.
  useEffect(() => {
    const unsubscribe = window.lekha.onFolderChanged(({ dirs }) => {
      const state = useWorkspaceStore.getState()
      const root = state.rootFolder
      if (root === null) return
      const loaded = new Set(loadedDirPaths(state.fileTree))
      for (const dir of dirs) {
        if (dir === root || loaded.has(dir)) {
          void loadChildren(dir)
        }
      }
    })
    return unsubscribe
  }, [loadChildren])
}
```

> Match the project's path alias (`@renderer/...`). If the store hook is imported elsewhere as `useWorkspaceStore`, reuse that. `loadChildren` is stable (a `useCallback` in `useFileOps`), so the effect won't churn.

- [ ] **Step 4: Mount it in `App.tsx`** - call the hook once where other hooks are used, passing `fileOps.loadChildren`:

```tsx
useFolderWatcher({ loadChildren: fileOps.loadChildren })
```

> Place it near the existing `useAutoSave(...)` / other hook calls. Add the import.

- [ ] **Step 5: Run tests + typecheck + lint**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm test -- useFolderWatcher
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/renderer/hooks/useFolderWatcher.ts src/renderer/App.tsx tests/unit/hooks/useFolderWatcher.test.ts
git commit -m "feat(tree): renderer hook applies live folder-change events"
```

---

## Task 7: e2e - live updates against the built app

**Files:** Create `tests/e2e/watcherLive.spec.ts`.

**Context:** Read `tests/e2e/lazyTree.spec.ts` for the launch boilerplate, fixture helper, and selectors (`.file-tree__name`, `.file-tree__row--dir`, anchored regexes). The watcher writes to the open folder ON DISK during the test (`fs.writeFileSync` / `fs.rmSync`) and asserts the tree updates live (no click). Use generous timeouts (debounce + FSEvents latency): assert with `{ timeout: 5_000 }`.

- [ ] **Step 1: Write the e2e spec** - create `tests/e2e/watcherLive.spec.ts`:

```typescript
/**
 * Live folder watcher - end-to-end. With a folder open, files/folders created
 * or removed ON DISK (by this test, simulating an external app) appear/vanish
 * in the sidebar live, debounced, without any user action. Changes under a
 * collapsed/unloaded directory do not appear until it is expanded.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

let app: ElectronApplication
let win: Page
let docsDir: string

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-watch-'))
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-watch-docs-'))
  fs.mkdirSync(path.join(docsDir, 'sub'), { recursive: true })
  fs.mkdirSync(path.join(docsDir, 'cold'), { recursive: true }) // stays collapsed
  fs.writeFileSync(path.join(docsDir, 'root.md'), '# Root\n', 'utf8')
  fs.writeFileSync(path.join(docsDir, 'sub', 'nested.md'), '# Nested\n', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ lastFolder: docsDir }),
    'utf8',
  )

  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'production', LEKHA_DISABLE_QUIT_GUARD: '1' },
    timeout: 30_000,
  })
  win = await app.firstWindow()
  await win.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })
  await expect(win.locator('.file-tree__name', { hasText: /^root\.md$/ })).toBeVisible({
    timeout: 10_000,
  })
})

test.afterAll(async () => {
  await app.close()
})

test('a file created on disk at the root appears live', async () => {
  fs.writeFileSync(path.join(docsDir, 'external.md'), '# External\n', 'utf8')
  await expect(win.locator('.file-tree__name', { hasText: /^external\.md$/ })).toBeVisible({
    timeout: 5_000,
  })
})

test('a file removed on disk disappears live', async () => {
  fs.rmSync(path.join(docsDir, 'external.md'))
  await expect(win.locator('.file-tree__name', { hasText: /^external\.md$/ })).toHaveCount(0, {
    timeout: 5_000,
  })
})

test('a file created in an expanded subfolder appears live', async () => {
  await win.locator('.file-tree__name', { hasText: /^sub$/ }).click()
  await expect(win.locator('.file-tree__name', { hasText: /^nested\.md$/ })).toBeVisible({
    timeout: 10_000,
  })
  fs.writeFileSync(path.join(docsDir, 'sub', 'live.md'), '# Live\n', 'utf8')
  await expect(win.locator('.file-tree__name', { hasText: /^live\.md$/ })).toBeVisible({
    timeout: 5_000,
  })
})

test('a file created under a collapsed folder does NOT appear until expand', async () => {
  // 'cold' is never expanded -> unloaded -> change is ignored.
  fs.writeFileSync(path.join(docsDir, 'cold', 'hidden.md'), '# Hidden\n', 'utf8')
  // give the watcher time to (not) act
  await win.waitForTimeout(1_000)
  await expect(win.locator('.file-tree__name', { hasText: /^hidden\.md$/ })).toHaveCount(0)
  // expanding 'cold' loads it fresh and reveals the file
  await win.locator('.file-tree__name', { hasText: /^cold$/ }).click()
  await expect(win.locator('.file-tree__name', { hasText: /^hidden\.md$/ })).toBeVisible({
    timeout: 10_000,
  })
})
```

> `win.waitForTimeout` is acceptable ONLY for the negative "did not appear" assertion (proving absence after the watcher had time to act). All positive assertions use retrying `toBeVisible`/`toHaveCount` with timeouts.

- [ ] **Step 2: Build + run the e2e (3x for flake check)**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:e2e -- watcherLive
```

Expected: 4 tests PASS. Run it 3 times; the watcher e2e is the most timing-sensitive in the suite, so if any run flakes, increase the positive-assertion timeouts (FSEvents can lag a beat) before settling. If it is fundamentally flaky after reasonable timeout tuning, STOP and report - do not commit a flaky test.

- [ ] **Step 3: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add tests/e2e/watcherLive.spec.ts
git commit -m "test(tree): e2e live watcher create/remove/expanded/collapsed"
```

---

## Final verification

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e
```

All must pass. Then the comprehensive pre-push review pipeline (controller runs this) and `superpowers:finishing-a-development-branch`.

## Self-review checklist

- **Spec coverage:** new `folderWatcher.ts` with subscribe + ignore globs + 250ms debounce + dir dedupe ✅ (T3); pure unit-tested helper ✅ (T2); IPC `folderChanged` to owning window ✅ (T3/T4); renderer re-reads only loaded dirs, root re-read on root change, collapsed ignored ✅ (T6); preserve expandedPaths/selection/scroll (via `setChildren`/`mergePreserveLoaded`, unchanged) ✅; unsubscribe on switch/close/window-close ✅ (T3/T5); multi-window each watches its own folder ✅ (per-window keyed map, T3/T5); asarUnpack + prebuilds ✅ (T1); e2e create/remove/expanded/collapsed ✅ (T7).
- **Placeholders:** none - all code concrete. Integration handlers (`watchFolder` registration, `App.tsx` mount) carry "read first + match pattern" instructions with exact code.
- **Type consistency:** `changedDirsFromEvents(events): string[]`, `WatcherEvent`, `watchFolder(win, dir)`/`unwatchFolder(win)`, IPC `watchFolder`/`folderChanged`, preload `watchFolder(dir|null)`/`onFolderChanged(cb)`, hook `useFolderWatcher({ loadChildren })` - names consistent across tasks. Payload shape `{ dirs: string[] }` consistent main↔preload↔renderer.
