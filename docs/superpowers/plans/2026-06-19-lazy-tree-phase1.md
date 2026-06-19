# Lazy File Tree (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load a directory's children on expand instead of building the whole recursive tree up front, so opening a large folder is instant and in-app file ops patch only the affected directory.

**Architecture:** The main process gains a single-level lister (`listDirChildren`) that returns one directory level with sub-directories left unloaded (`children === undefined`); `buildFileTree` stays recursive for folder search. The renderer adds immutable tree-patch helpers and a `setChildren` store action, loads a directory's children on first expand, retires the whole-tree `refreshTree` in favor of targeted `loadChildren`, and reveals the active file on session restore by loading its ancestor directories top-down.

**Tech Stack:** Electron + React + TypeScript + Zustand, Vitest (unit), Playwright-Electron (e2e). Node 22 required.

**Spec:** `docs/superpowers/specs/2026-06-19-live-folder-tree-design.md` (Phase 1 section).

---

## Environment note (read first)

The shell default `node` is **v14** (nvm). This project requires **node 22**. Every `npm`, build, test, **and `git commit`** command (husky hooks run node) MUST be prefixed with:

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
```

Work happens on branch **`feat/lazy-tree`** (already checked out; the protected-branch guard hook permits commits here). **Do not push.** Commit per task. Conventional-commit messages: lowercase subject, body lines under 100 chars, no `Co-Authored-By`.

## Data model (no type change needed)

`FileNode` in `src/shared/types.ts` already has an optional `children`:

```typescript
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}
```

Lazy-tree convention for a **directory** node:

- `children === undefined` → **unloaded** (not yet read; renders no rows; load on first expand).
- `children === []` → **loaded, empty**.
- `children === [...]` → **loaded** with entries.

Files never have `children`. No type edit is required.

## File structure

- `src/main/fs-helpers.ts` — add `listDirChildren` (single level); refactor `buildFileTree` to reuse it (still recursive, used by search).
- `src/main/ipc/files.ts` — `readDir` handler calls `listDirChildren` instead of `buildFileTree`.
- `src/renderer/store/treeOps.ts` — **new**: pure, unit-tested tree helpers (`parentDir`, `mergePreserveLoaded`, `setNodeChildren`, `loadedDirPaths`).
- `src/renderer/store/workspaceStore.ts` — add `setChildren(path, children)` action.
- `src/renderer/hooks/useFileOps.ts` — add `loadChildren` + `revealPath`; convert in-app ops off `refreshTree`; remove `refreshTree`.
- `src/renderer/components/FileTree.tsx` — `onLoadChildren` prop; load on first expand.
- `src/renderer/App.tsx` — pass `onLoadChildren={fileOps.loadChildren}` to `<FileTree>`.
- `src/renderer/hooks/useStartup.ts` — reveal the active tab's ancestors after restore.
- Tests: `tests/unit/main/fsHelpers.test.ts`, `tests/unit/store/treeOps.test.ts` (new), `tests/unit/hooks/useFileOps.test.ts`, `tests/unit/components/fileTree.test.tsx`, `tests/unit/hooks/useStartupRecovery.test.tsx`, `tests/unit/hooks/useCommands.test.ts` (mock), `tests/e2e/lazyTree.spec.ts` (new).

## Design decisions (deliberate deviations from a naive reading of the spec)

1. **`buildFileTree` stays recursive.** Folder search (`src/main/ipc/search.ts:119,147`) enumerates every file via `buildFileTree`. The lazy sidebar uses a **separate** `listDirChildren`. This is non-negotiable — making `buildFileTree` single-level would silently break search.
2. **`refreshTree` is removed, not kept.** All 7 callers switch to targeted `loadChildren(affectedDir)`. A whole-tree re-read via the now-single-level `readDir` would _collapse_ every loaded subtree, so the old method cannot survive lazy loading. `loadChildren` + `mergePreserveLoaded` is the replacement.
3. **No visible loading spinner.** Single-level local-FS reads are sub-frame; a spinner would only flicker. Omitted on purpose (YAGNI). The spec's "loading affordance if the read is slow" does not apply to local reads.
4. **`expandedPaths` is not persisted.** The app already does not persist it (each launch starts collapsed except the auto-revealed active file). Lazy loading preserves that exact behavior via `revealPath`. Persisting expansion is out of scope.
5. **Renaming an expanded folder collapses it** (its loaded children are dropped because the path changed). Acceptable edge for Phase 1; the common case (renaming files) is unaffected.

---

## Task 1: Single-level directory listing (main process)

**Files:**

- Modify: `src/main/fs-helpers.ts` (the `buildFileTree` block, lines ~10-77)
- Modify: `src/main/ipc/files.ts:11` (import) and `:110-113` (handler)
- Test: `tests/unit/main/fsHelpers.test.ts` (add a `listDirChildren` describe block)

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/main/fsHelpers.test.ts` (after the existing `describe('buildFileTree', ...)` block). Match the existing test style — they create a temp dir per test. Reuse the same `tmpDir` setup pattern already in that file (look at how `buildFileTree` tests build `tmpDir`; mirror it exactly).

```typescript
import { listDirChildren } from '@main/fs-helpers'
// ^ add `listDirChildren` to the existing import from '@main/fs-helpers' at the top.

describe('listDirChildren', () => {
  it('returns only the immediate level; sub-directories are left unloaded', async () => {
    // tmpDir/
    //   a.md
    //   sub/        (contains nested.md)
    await mkdir(join(tmpDir, 'sub'), { recursive: true })
    await writeFile(join(tmpDir, 'a.md'), '# a', 'utf8')
    await writeFile(join(tmpDir, 'sub', 'nested.md'), '# n', 'utf8')

    const level = await listDirChildren(tmpDir)

    const sub = level.find((n) => n.name === 'sub')
    expect(sub).toBeDefined()
    expect(sub!.isDirectory).toBe(true)
    // Unloaded: children is NOT populated (no recursion).
    expect(sub!.children).toBeUndefined()
    // a.md is present as a file.
    expect(level.find((n) => n.name === 'a.md')?.isDirectory).toBe(false)
  })

  it('excludes dotfiles, dotdirs, node_modules and non-openable files', async () => {
    await mkdir(join(tmpDir, 'node_modules'), { recursive: true })
    await mkdir(join(tmpDir, '.git'), { recursive: true })
    await writeFile(join(tmpDir, '.hidden.md'), 'x', 'utf8')
    await writeFile(join(tmpDir, 'image.png'), 'x', 'utf8')
    await writeFile(join(tmpDir, 'keep.md'), 'x', 'utf8')

    const level = await listDirChildren(tmpDir)
    const names = level.map((n) => n.name)

    expect(names).toContain('keep.md')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('.git')
    expect(names).not.toContain('.hidden.md')
    expect(names).not.toContain('image.png')
  })

  it('sorts directories first, then files, each case-insensitive', async () => {
    await mkdir(join(tmpDir, 'Zeta'), { recursive: true })
    await mkdir(join(tmpDir, 'alpha'), { recursive: true })
    await writeFile(join(tmpDir, 'Beta.md'), 'x', 'utf8')
    await writeFile(join(tmpDir, 'apple.md'), 'x', 'utf8')

    const level = await listDirChildren(tmpDir)

    expect(level.map((n) => n.name)).toEqual(['alpha', 'Zeta', 'apple.md', 'Beta.md'])
  })
})
```

> If the existing file imports `mkdir`/`writeFile`/`join` differently (e.g. from `node:fs/promises` and `node:path`), reuse its existing imports rather than adding duplicates.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- fsHelpers
```

Expected: FAIL — `listDirChildren` is not exported.

- [ ] **Step 3: Implement `listDirChildren` and refactor `buildFileTree`**

In `src/main/fs-helpers.ts`, replace the current `buildFileTree` block (the `isDotEntry` helper through the end of `buildFileTree`, lines ~10-77) with:

```typescript
/** Returns true for dotfiles / dotdirs (names starting with "."). */
function isDotEntry(name: string): boolean {
  return name.startsWith('.')
}

const byName = (a: FileNode, b: FileNode) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase())

/**
 * Lists ONE directory level: immediate openable files and sub-directories.
 * Dotfiles, dotdirs, and node_modules are excluded; only files in the shared
 * openable set (md/markdown/mdown/mkd/mdx/txt/text) are included.
 * Sub-directories are returned with `children` LEFT UNDEFINED (unloaded) - the
 * sidebar loads them lazily on expand. Sort order: directories first (alpha,
 * case-insensitive), then files.
 */
export async function listDirChildren(dir: string): Promise<FileNode[]> {
  const entries = await readdir(dir, { withFileTypes: true })

  const dirs: FileNode[] = []
  const files: FileNode[] = []

  for (const entry of entries) {
    if (isDotEntry(entry.name) || entry.name === 'node_modules') continue

    const absPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      dirs.push({ name: entry.name, path: absPath, isDirectory: true })
    } else if (entry.isFile() && OPENABLE_EXT_SET.has(extname(entry.name).toLowerCase())) {
      files.push({ name: entry.name, path: absPath, isDirectory: false })
    }
  }

  dirs.sort(byName)
  files.sort(byName)

  return [...dirs, ...files]
}

/**
 * Recursively builds the full tree of openable files and directories. Used by
 * folder-wide search to enumerate every file up front. The lazy sidebar tree
 * uses listDirChildren instead and loads levels on demand.
 * Sort order: directories first (alpha, case-insensitive), then files.
 */
export async function buildFileTree(dir: string): Promise<FileNode[]> {
  const level = await listDirChildren(dir)
  for (const node of level) {
    if (node.isDirectory) {
      node.children = await buildFileTree(node.path)
    }
  }
  return level
}
```

> Keep the existing imports (`readdir`, `join`, `extname`, `OPENABLE_EXT_SET`, `FileNode`) — they're already at the top of the file.

- [ ] **Step 4: Wire the IPC handler to the single-level lister**

In `src/main/ipc/files.ts`:

- Line 11: add `listDirChildren` to the import from `@main/fs-helpers` (keep `buildFileTree` if it's still imported there; if `buildFileTree` is no longer referenced in this file after the change, remove it from the import to satisfy lint).
- Replace the handler at lines 110-113:

```typescript
safeHandle(IPC.readDir, async (dir) => {
  assertPathAllowed(String(dir))
  return listDirChildren(String(dir))
})
```

- [ ] **Step 5: Run the full main-process suite**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- fsHelpers searchFolder
npm run typecheck
```

Expected: PASS. The existing `buildFileTree` tests still pass (it stays recursive); the new `listDirChildren` tests pass; `searchFolder` (which uses `buildFileTree`) still passes.

- [ ] **Step 6: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/main/fs-helpers.ts src/main/ipc/files.ts tests/unit/main/fsHelpers.test.ts
git commit -m "feat(tree): single-level listDirChildren for lazy sidebar

readDir now returns one directory level with sub-dirs unloaded; buildFileTree
stays recursive for folder search."
```

---

## Task 2: Immutable tree-patch helpers + store `setChildren`

**Files:**

- Create: `src/renderer/store/treeOps.ts`
- Modify: `src/renderer/store/workspaceStore.ts` (add `setChildren` to the actions interface and the store)
- Test: `tests/unit/store/treeOps.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/store/treeOps.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { FileNode } from '../../../src/shared/types'
import {
  parentDir,
  mergePreserveLoaded,
  setNodeChildren,
  loadedDirPaths,
} from '../../../src/renderer/store/treeOps'

describe('parentDir', () => {
  it('returns the containing directory', () => {
    expect(parentDir('/proj/sub/a.md')).toBe('/proj/sub')
    expect(parentDir('/proj/a.md')).toBe('/proj')
  })
})

describe('mergePreserveLoaded', () => {
  it('carries over loaded sub-directory children when re-listing a level', () => {
    const prev: FileNode[] = [
      {
        name: 'sub',
        path: '/p/sub',
        isDirectory: true,
        children: [{ name: 'old.md', path: '/p/sub/old.md', isDirectory: false }],
      },
    ]
    const next: FileNode[] = [
      { name: 'new.md', path: '/p/new.md', isDirectory: false },
      { name: 'sub', path: '/p/sub', isDirectory: true }, // freshly listed: unloaded
    ]
    const merged = mergePreserveLoaded(prev, next)
    const sub = merged.find((n) => n.path === '/p/sub')!
    // sub kept its previously-loaded children rather than reverting to unloaded.
    expect(sub.children).toEqual([{ name: 'old.md', path: '/p/sub/old.md', isDirectory: false }])
    // the new file at this level is present.
    expect(merged.find((n) => n.path === '/p/new.md')).toBeDefined()
  })

  it('returns next unchanged when prev is undefined', () => {
    const next: FileNode[] = [{ name: 'a.md', path: '/p/a.md', isDirectory: false }]
    expect(mergePreserveLoaded(undefined, next)).toBe(next)
  })
})

describe('setNodeChildren', () => {
  const tree: FileNode[] = [
    {
      name: 'sub',
      path: '/p/sub',
      isDirectory: true,
      children: undefined,
    },
    { name: 'a.md', path: '/p/a.md', isDirectory: false },
  ]

  it('sets the children of the target node immutably', () => {
    const kids: FileNode[] = [{ name: 'x.md', path: '/p/sub/x.md', isDirectory: false }]
    const next = setNodeChildren(tree, '/p/sub', kids)
    expect(next).not.toBe(tree)
    expect(next.find((n) => n.path === '/p/sub')!.children).toEqual(kids)
    // original tree untouched.
    expect(tree.find((n) => n.path === '/p/sub')!.children).toBeUndefined()
  })

  it('returns the same tree reference when no node matches', () => {
    const next = setNodeChildren(tree, '/p/does-not-exist', [])
    expect(next).toBe(tree)
  })
})

describe('loadedDirPaths', () => {
  it('collects loaded directory paths in depth order', () => {
    const tree: FileNode[] = [
      {
        name: 'a',
        path: '/p/a',
        isDirectory: true,
        children: [
          { name: 'b', path: '/p/a/b', isDirectory: true, children: [] },
          { name: 'c', path: '/p/a/c', isDirectory: true, children: undefined },
        ],
      },
    ]
    expect(loadedDirPaths(tree)).toEqual(['/p/a', '/p/a/b'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- treeOps
```

Expected: FAIL — `src/renderer/store/treeOps.ts` does not exist.

- [ ] **Step 3: Implement `treeOps.ts`**

Create `src/renderer/store/treeOps.ts`:

```typescript
import type { FileNode } from '@shared/types'

/** The directory containing `path` (its parent). Absolute POSIX paths. */
export function parentDir(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? path : path.slice(0, i)
}

/**
 * Merge a freshly-listed directory level (`next`) with that directory's
 * previous children (`prev`), carrying over any sub-directory whose children
 * were already LOADED so re-reading a directory does not collapse expanded
 * descendants. New/removed/renamed entries at this level are reflected;
 * previously-unloaded sub-directories stay unloaded.
 */
export function mergePreserveLoaded(prev: FileNode[] | undefined, next: FileNode[]): FileNode[] {
  if (!prev) return next
  const prevByPath = new Map(prev.map((n) => [n.path, n]))
  return next.map((node) => {
    if (!node.isDirectory) return node
    const old = prevByPath.get(node.path)
    if (old && old.isDirectory && old.children !== undefined) {
      return { ...node, children: old.children }
    }
    return node
  })
}

/**
 * Returns a new tree with the directory node at `targetPath` having its
 * children set to `newChildren` (merged via mergePreserveLoaded to keep loaded
 * descendants). Only the nodes on the path from a root entry down to the target
 * are re-created; untouched branches keep their identity. Returns the SAME tree
 * reference when no node matches `targetPath`.
 */
export function setNodeChildren(
  tree: FileNode[],
  targetPath: string,
  newChildren: FileNode[],
): FileNode[] {
  const walk = (nodes: FileNode[]): FileNode[] => {
    let mutated = false
    const mapped = nodes.map((node) => {
      if (node.path === targetPath && node.isDirectory) {
        mutated = true
        return { ...node, children: mergePreserveLoaded(node.children, newChildren) }
      }
      if (node.isDirectory && node.children && node.children.length > 0) {
        const nextChildren = walk(node.children)
        if (nextChildren !== node.children) {
          mutated = true
          return { ...node, children: nextChildren }
        }
      }
      return node
    })
    return mutated ? mapped : nodes
  }
  return walk(tree)
}

/** Collects the paths of all currently-loaded directory nodes, parents first. */
export function loadedDirPaths(tree: FileNode[]): string[] {
  const out: string[] = []
  const walk = (nodes: FileNode[]): void => {
    for (const node of nodes) {
      if (node.isDirectory && node.children !== undefined) {
        out.push(node.path)
        walk(node.children)
      }
    }
  }
  walk(tree)
  return out
}
```

- [ ] **Step 4: Add `setChildren` to the store**

In `src/renderer/store/workspaceStore.ts`:

Add the import near the top:

```typescript
import { mergePreserveLoaded, setNodeChildren } from './treeOps'
```

Add to the `WorkspaceActions` interface (after `setFileTree`):

```typescript
  /**
   * Replace the children of the directory at `path` (merging to preserve
   * already-loaded descendants). When `path` is the open root folder, replaces
   * the top-level tree. No-op when no node matches.
   */
  setChildren(path: string, children: FileNode[]): void
```

Add the action implementation (after the `setFileTree` action in the store object):

```typescript
  setChildren(path, children) {
    set((state) => {
      if (path === state.rootFolder) {
        return { fileTree: mergePreserveLoaded(state.fileTree, children) }
      }
      return { fileTree: setNodeChildren(state.fileTree, path, children) }
    })
  },
```

- [ ] **Step 5: Run tests + typecheck**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- treeOps workspaceStore
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/renderer/store/treeOps.ts src/renderer/store/workspaceStore.ts tests/unit/store/treeOps.test.ts
git commit -m "feat(tree): immutable tree-patch helpers and setChildren action

setChildren patches a single directory's children, preserving loaded
descendants; root path replaces the top-level tree."
```

---

## Task 3: `useFileOps` — `loadChildren` + `revealPath`, retire `refreshTree`

**Files:**

- Modify: `src/renderer/hooks/useFileOps.ts` (interface ~30-196; `refreshTree` def ~985-990; the 7 callers; the returned object ~1220)
- Modify: `tests/unit/hooks/useCommands.test.ts:164` (FileOps mock)
- Modify: `tests/unit/hooks/useStartupRecovery.test.tsx:109` (FileOps mock)
- Modify: `tests/unit/hooks/useFileOps.test.ts` (add tests; adjust comments)

**Context for the implementer:** `refreshTree` currently re-reads the whole root via `window.lekha.readDir(root)` and calls `setFileTree`. Because `readDir` is now single-level (Task 1), that would _collapse every loaded subtree_. Replace it entirely. The 7 current `refreshTree()` callers are: `duplicateCurrent`, `deleteCurrent`, `moveCurrentTo`, `createFileEntry`, `createFolderEntry`, `renameEntry`, `deleteEntry`. You must Read each function body before editing — only `createFileEntry/createFolderEntry/renameEntry/deleteEntry` bodies are reproduced below; read `duplicateCurrent/deleteCurrent/moveCurrentTo` in the file.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/hooks/useFileOps.test.ts`. Use the existing `mountFileOps` / `makeMockLekha` helpers in that file (the `openFolder` test at ~594 shows the pattern; `mountFileOps` at ~987 shows another). The store must have a root open for these.

```typescript
import { loadedDirPaths } from '../../../src/renderer/store/treeOps'

describe('useFileOps - lazy tree', () => {
  it('loadChildren reads a directory and patches that node in the store', async () => {
    const subKids: FileNode[] = [
      { name: 'nested.md', path: '/proj/sub/nested.md', isDirectory: false },
    ]
    const readDir = vi.fn((d: string) =>
      Promise.resolve(d === '/proj/sub' ? subKids : ([] as FileNode[])),
    )
    // Seed a root tree with an unloaded 'sub' directory.
    useWorkspaceStore.setState({
      rootFolder: '/proj',
      fileTree: [{ name: 'sub', path: '/proj/sub', isDirectory: true }],
    })
    const { result } = mountFileOps({ readDir })

    await act(async () => {
      await result.current.loadChildren('/proj/sub')
    })

    expect(readDir).toHaveBeenCalledWith('/proj/sub')
    const sub = useWorkspaceStore.getState().fileTree.find((n) => n.path === '/proj/sub')!
    expect(sub.children).toEqual(subKids)
  })

  it('revealPath loads the ancestor chain of a file top-down', async () => {
    const calls: string[] = []
    const readDir = vi.fn((d: string) => {
      calls.push(d)
      if (d === '/proj/a') {
        return Promise.resolve([{ name: 'b', path: '/proj/a/b', isDirectory: true }] as FileNode[])
      }
      if (d === '/proj/a/b') {
        return Promise.resolve([
          { name: 'deep.md', path: '/proj/a/b/deep.md', isDirectory: false },
        ] as FileNode[])
      }
      return Promise.resolve([] as FileNode[])
    })
    useWorkspaceStore.setState({
      rootFolder: '/proj',
      fileTree: [{ name: 'a', path: '/proj/a', isDirectory: true }],
    })
    const { result } = mountFileOps({ readDir })

    await act(async () => {
      await result.current.revealPath('/proj/a/b/deep.md')
    })

    // Loaded ancestors in order; the file's row is now reachable.
    expect(calls).toEqual(['/proj/a', '/proj/a/b'])
    expect(loadedDirPaths(useWorkspaceStore.getState().fileTree)).toContain('/proj/a/b')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- useFileOps
```

Expected: FAIL — `loadChildren` / `revealPath` are not on the hook.

- [ ] **Step 3: Add `loadChildren` and `revealPath`; remove `refreshTree`**

In `src/renderer/hooks/useFileOps.ts`, **replace** the `refreshTree` definition (lines ~985-990) with:

```typescript
// Re-read one directory and patch only that node's children into the store
// (preserving any already-loaded descendants). No-op when no folder is open.
const loadChildren = useCallback(
  async (dir: string): Promise<void> => {
    const root = workspaceStore.getState().rootFolder
    if (root === null) return
    const children = await window.lekha.readDir(dir)
    workspaceStore.getState().setChildren(dir, children)
  },
  [workspaceStore],
)

// Reveal a file in the tree by loading its ancestor directories top-down, so
// the (auto-expanded) active row has real content under it. Bounded by the
// file's depth. No-op when no folder is open or the file is outside the root.
const revealPath = useCallback(
  async (filePath: string): Promise<void> => {
    const root = workspaceStore.getState().rootFolder
    if (root === null) return
    if (filePath !== root && !filePath.startsWith(root + '/')) return
    const rel = filePath.slice(root.length + 1)
    const segs = rel.split('/')
    segs.pop() // drop the file name; keep ancestor directory segments
    let dir = root
    for (const seg of segs) {
      if (seg === '') continue
      dir = `${dir}/${seg}`
      try {
        await loadChildren(dir)
      } catch {
        return // an ancestor is gone/unreadable; stop revealing
      }
    }
  },
  [loadChildren, workspaceStore],
)
```

- [ ] **Step 4: Convert the 7 `refreshTree()` callers to targeted `loadChildren`**

Add the `parentDir` import at the top of the file (with the other store imports):

```typescript
import { parentDir } from '@renderer/store/treeOps'
```

> Use whatever alias the file already uses for `src/renderer/*` (e.g. `@renderer/...`); match a sibling import in this same file.

Apply each conversion. The reproduced bodies (createFileEntry/createFolderEntry/renameEntry/deleteEntry) show the exact `await refreshTree()` line to replace:

**createFileEntry** — replace `await refreshTree()` with `await loadChildren(target)`:

```typescript
const createFileEntry = useCallback(
  async (dir: string | null): Promise<void> => {
    const target = resolveDir(dir)
    if (target === null) return
    try {
      const path = await window.lekha.createFile(target, 'Untitled.md')
      await loadChildren(target)
      await openPath(path)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  },
  [resolveDir, loadChildren, openPath],
)
```

**createFolderEntry** — replace `await refreshTree()` with `await loadChildren(target)`:

```typescript
const createFolderEntry = useCallback(
  async (dir: string | null): Promise<void> => {
    const target = resolveDir(dir)
    if (target === null) return
    try {
      await window.lekha.createFolder(target, 'Untitled Folder')
      await loadChildren(target)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  },
  [resolveDir, loadChildren],
)
```

**renameEntry** — replace `await refreshTree()` with `await loadChildren(parentDir(oldPath))` and update the deps array:

```typescript
const renameEntry = useCallback(
  async (oldPath: string, newName: string): Promise<void> => {
    try {
      const newPath = await window.lekha.renamePath(oldPath, newName)
      documentsStore.getState().updatePath(oldPath, newPath)
      if (editorStore.getState().path === oldPath) {
        syncActivePath(newPath)
      }
      await loadChildren(parentDir(oldPath))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  },
  [documentsStore, editorStore, syncActivePath, loadChildren],
)
```

**deleteEntry** — replace `await refreshTree()` with `await loadChildren(parentDir(path))` and update deps:

```typescript
const deleteEntry = useCallback(
  async (path: string): Promise<void> => {
    if (!window.confirm('Move this item to the Trash?')) return
    try {
      await window.lekha.deletePath(path)
      const openPathValue = editorStore.getState().path
      if (
        openPathValue !== null &&
        (openPathValue === path || openPathValue.startsWith(path + '/'))
      ) {
        syncActivePath(null)
      }
      await loadChildren(parentDir(path))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  },
  [editorStore, syncActivePath, loadChildren],
)
```

**duplicateCurrent** (read the body first; it duplicates the active file in its own directory). Replace its `await refreshTree()` with:

```typescript
await loadChildren(parentDir(editorStore.getState().path ?? ''))
```

Place this AFTER the duplicate is created and BEFORE opening the copy (mirror the original ordering). Update the deps array: swap `refreshTree` → `loadChildren`. Guard: this op already no-ops when there is no path, so `path` is non-null here; the `?? ''` is only a type guard.

**deleteCurrent** (read the body first; it trashes the active file). Capture the path before it is cleared, then refresh its parent. Replace `await refreshTree()` with:

```typescript
if (deletedPath !== null) await loadChildren(parentDir(deletedPath))
```

where `deletedPath` is the active document path captured at the top of the function (add `const deletedPath = editorStore.getState().path` before the path is reset, if not already captured). Update the deps array: swap `refreshTree` → `loadChildren`.

**moveCurrentTo** (read the body first; it moves the active file to a folder chosen via the native picker — the destination may be OUTSIDE the open root). Capture the old path before the move and the destination directory from the move, then refresh both, each only if under the open root:

```typescript
const root = workspaceStore.getState().rootFolder
const underRoot = (d: string) => root !== null && (d === root || d.startsWith(root + '/'))
if (underRoot(oldParent)) await loadChildren(oldParent)
if (underRoot(destDir)) await loadChildren(destDir)
```

where `oldParent = parentDir(<old active path captured before the move>)` and `destDir` is the chosen target folder (the directory the file was moved into). Update the deps array: swap `refreshTree` → `loadChildren` and add `workspaceStore` if not already present.

- [ ] **Step 5: Update the `FileOps` interface and the returned object**

In the `FileOps` interface (~30-196): **remove** the `refreshTree(): Promise<void>` member (line ~68) and its doc comment, and **add**:

```typescript
  /**
   * Read one directory and patch only that node's children into the workspace
   * tree (lazy load on expand / incremental refresh after an in-app file op).
   * No-op when no folder is open.
   */
  loadChildren(dir: string): Promise<void>
  /**
   * Reveal a file in the sidebar by loading its ancestor directories top-down
   * so the auto-expanded active row has content. No-op when no folder is open
   * or the file is outside the open root.
   */
  revealPath(filePath: string): Promise<void>
```

In the returned object (~1220): remove `refreshTree,` and add `loadChildren,` and `revealPath,`.

- [ ] **Step 6: Update the FileOps mocks in unit tests**

In `tests/unit/hooks/useCommands.test.ts:164`: in the `fileOps` object literal, remove `refreshTree,` and add `loadChildren: vi.fn(() => Promise.resolve()), revealPath: vi.fn(() => Promise.resolve()),`.

In `tests/unit/hooks/useStartupRecovery.test.tsx`: line ~109 has `refreshTree: noop,`. Replace it with `loadChildren: noop, revealPath: noop,` (reuse the existing `noop` helper).

In `tests/unit/hooks/useFileOps.test.ts`: update the comment at line ~1016 from "no root open -> refreshTree no-ops" to "no target dir -> nothing read". The existing assertions (`readDir` called with `/proj` after createFileEntry/renameEntry; not called when no target) still hold because `loadChildren(target)` reads `target` (which is `/proj` or its parent). If any existing test fails because the store had no `rootFolder` set, set `useWorkspaceStore.setState({ rootFolder: '/proj', ... })` in that test's arrange step (loadChildren no-ops without a root).

- [ ] **Step 7: Run the full renderer suite + typecheck**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- useFileOps useCommands useStartupRecovery
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/renderer/hooks/useFileOps.ts tests/unit/hooks/useFileOps.test.ts tests/unit/hooks/useCommands.test.ts tests/unit/hooks/useStartupRecovery.test.tsx
git commit -m "feat(tree): loadChildren/revealPath replace whole-tree refreshTree

In-app file ops now patch only the affected directory; revealPath loads an
active file's ancestors top-down on restore."
```

---

## Task 4: `FileTree` load-on-expand + App wiring

**Files:**

- Modify: `src/renderer/components/FileTree.tsx` (`FileTreeProps` ~226-247; root component; `FileTreeNode` props + `handleClick` ~156-162; the recursive children render ~199-217)
- Modify: `src/renderer/App.tsx` (the `<FileTree ... />` usage)
- Test: `tests/unit/components/fileTree.test.tsx`

**Context for the implementer:** Read `FileTree.tsx` fully first. `expandedPaths` is local component state in the root `FileTree`; `FileTreeNode` receives `onToggleExpand` and computes whether it is `expanded`. You will thread a new optional `onLoadChildren` prop from the root down to each `FileTreeNode`, exactly like the existing `onToggleExpand`/`onContextMenu` props are threaded.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/components/fileTree.test.tsx`:

```typescript
const UNLOADED_DIR: FileNode[] = [
  { name: 'docs', path: '/p/docs', isDirectory: true }, // children undefined = unloaded
]

describe('FileTree - lazy load on expand', () => {
  it('calls onLoadChildren with the dir path on first expand of an unloaded folder', () => {
    const onLoadChildren = vi.fn()
    const { getByText } = render(
      <FileTree
        nodes={UNLOADED_DIR}
        activePath={null}
        onSelect={() => {}}
        onLoadChildren={onLoadChildren}
      />,
    )
    fireEvent.click(getByText('docs'))
    expect(onLoadChildren).toHaveBeenCalledWith('/p/docs')
  })

  it('does not call onLoadChildren when expanding an already-loaded folder', () => {
    const onLoadChildren = vi.fn()
    const { getByText } = render(
      <FileTree
        nodes={NESTED_NODES}
        activePath={null}
        onSelect={() => {}}
        onLoadChildren={onLoadChildren}
      />,
    )
    fireEvent.click(getByText('docs')) // NESTED_NODES.docs has children already
    expect(onLoadChildren).not.toHaveBeenCalled()
  })
})
```

> `NESTED_NODES` and `FileNode`/`vi` are already imported in this file.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- fileTree
```

Expected: FAIL — `onLoadChildren` prop is not handled.

- [ ] **Step 3: Add the `onLoadChildren` prop and wire load-on-expand**

In `FileTreeProps` (~226-247), add:

```typescript
  /**
   * Load a directory's children on first expand (lazy tree). Called with the
   * directory path when an UNLOADED folder is expanded. Optional so read-only
   * call sites and existing tests can omit it.
   */
  onLoadChildren?: (dir: string) => void | Promise<void>
```

In the root `FileTree` component, accept `onLoadChildren` from props and pass it to every `FileTreeNode` it renders (alongside `onToggleExpand`). In the recursive children render (~199-217), add `onLoadChildren={onLoadChildren}` to the `<FileTreeNode .../>` props so it threads down. Add `onLoadChildren?: (dir: string) => void | Promise<void>` to the `FileTreeNode` props type.

In `FileTreeNode`'s `handleClick` (~156-162), trigger the load when expanding an unloaded directory:

```typescript
const handleClick = () => {
  if (node.isDirectory) {
    if (!expanded && node.children === undefined) {
      void onLoadChildren?.(node.path)
    }
    onToggleExpand(node.path)
  } else {
    onSelect(node.path)
  }
}
```

> `expanded` is the boolean the component already computes for this node (whether its path is in the expanded set). If the local variable has a different name, use that one.

- [ ] **Step 4: Wire it from App**

In `src/renderer/App.tsx`, find the `<FileTree ... />` element and add the prop:

```tsx
        onLoadChildren={fileOps.loadChildren}
```

> `fileOps` is the object returned by `useFileOps` already used for the other `<FileTree>` handlers (`onNewFile`, `onRename`, etc.). Match how those are passed.

- [ ] **Step 5: Run tests + typecheck**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- fileTree
npm run typecheck
```

Expected: PASS. All existing FileTree tests (flat render, select, expand-loaded, auto-reveal) still pass.

- [ ] **Step 6: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/renderer/components/FileTree.tsx src/renderer/App.tsx tests/unit/components/fileTree.test.tsx
git commit -m "feat(tree): load directory children on first expand

FileTree fires onLoadChildren for an unloaded folder; App wires it to
fileOps.loadChildren."
```

---

## Task 5: Session-restore reveal of the active file

**Files:**

- Modify: `src/renderer/hooks/useStartup.ts` (after the `restoreTabs` call, ~244-252)
- Test: `tests/unit/hooks/useStartupRecovery.test.tsx`

**Context for the implementer:** Read `useStartup.ts` around lines 220-260 first. The folder is restored at ~226 (`readDir(s.lastFolder)` → `setRootFolder`/`setFileTree`), then tabs are restored via `fileOpsRef.current.restoreTabs(s.openTabPaths, s.activeTabPath, s.pinnedTabPaths)`. After restore, the active file's row must be revealed by loading its ancestor directories (the tree is now lazy, so only the root level is loaded).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/hooks/useStartupRecovery.test.tsx`. Follow the file's existing harness (it builds a `lekha` mock with `readDir`, a `fileOps` mock, and renders the startup hook). Add a test asserting `revealPath` is called with the restored active path:

```typescript
it('reveals the active file in the lazy tree after restore', async () => {
  // settings: a folder is open and an active tab lives inside it.
  const settings = makeSettings({
    lastFolder: '/proj',
    openTabPaths: ['/proj/sub/active.md'],
    activeTabPath: '/proj/sub/active.md',
  })
  const { lekha, fileOps } = setupStartup({ settings })

  // render the startup hook (mirror how other tests in this file mount it)
  await renderStartup({ lekha, fileOps })

  expect(fileOps.revealPath).toHaveBeenCalledWith('/proj/sub/active.md')
})
```

> Adapt `makeSettings`/`setupStartup`/`renderStartup` to the actual helper names in this test file. The essential assertion is `fileOps.revealPath` called with the active tab path. Ensure the `fileOps` mock includes `revealPath: vi.fn(() => Promise.resolve())` (added in Task 3).

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- useStartupRecovery
```

Expected: FAIL — `revealPath` is never called.

- [ ] **Step 3: Call `revealPath` after restore**

In `src/renderer/hooks/useStartup.ts`, immediately AFTER the `restoreTabs` block (the `if (ownsSession && s.openTabPaths.length > 0) { ... }` at ~244-252), add:

```typescript
// Lazy tree: the root level is loaded, but the active file's ancestor
// directories are not. Load them top-down so the auto-revealed active row
// has content. Best-effort; failures are swallowed inside revealPath.
if (ownsSession && s.activeTabPath !== null) {
  await fileOpsRef.current.revealPath(s.activeTabPath)
}
```

> If `s.activeTabPath` is typed as possibly `undefined` rather than `null`, use a truthy check (`if (ownsSession && s.activeTabPath)`).

- [ ] **Step 4: Run tests + typecheck**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run test:unit -- useStartupRecovery
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add src/renderer/hooks/useStartup.ts tests/unit/hooks/useStartupRecovery.test.tsx
git commit -m "feat(tree): reveal the active file on restore via revealPath

Loads the active tab's ancestor directories top-down so its row is visible in
the lazy tree."
```

---

## Task 6: e2e lazy tree behavior

**Files:**

- Create: `tests/e2e/lazyTree.spec.ts`

**Context for the implementer:** Read `tests/e2e/folderWorkflow.spec.ts` first and copy its Playwright-Electron launch boilerplate verbatim (temp `userDataDir`, seed `settings.json`, `electron.launch({...})`, wait for `.ProseMirror`, file-tree selectors `.file-tree__name`). The folder is "opened" by seeding `settings.json` with `lastFolder` before launch.

- [ ] **Step 1: Write the e2e spec**

Create `tests/e2e/lazyTree.spec.ts`:

```typescript
/**
 * Lazy file tree - end-to-end. The sidebar loads only the root level on open;
 * a sub-folder's children appear only when it is expanded; and an active file
 * deep in the tree is revealed (its ancestors auto-loaded) on session restore.
 *
 * The folder is "opened" by seeding settings.json with lastFolder before
 * launch - the same persisted-session path real users hit on relaunch.
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-lazy-'))
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-lazy-docs-'))

  // root.md, sub/nested.md, other/ (empty-ish)
  fs.mkdirSync(path.join(docsDir, 'sub'), { recursive: true })
  fs.mkdirSync(path.join(docsDir, 'other'), { recursive: true })
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
})

test.afterAll(async () => {
  await app.close()
})

test('opening a folder shows only the root level; sub-folder children are not loaded', async () => {
  await expect(win.locator('.file-tree__name', { hasText: 'root.md' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(win.locator('.file-tree__name', { hasText: 'sub' })).toBeVisible()
  await expect(win.locator('.file-tree__name', { hasText: 'other' })).toBeVisible()
  // nested.md lives inside the (collapsed, unloaded) 'sub' folder - not rendered yet.
  await expect(win.locator('.file-tree__name', { hasText: 'nested.md' })).toHaveCount(0)
})

test('expanding a sub-folder loads and shows its children', async () => {
  await win.locator('.file-tree__name', { hasText: 'sub' }).click()
  await expect(win.locator('.file-tree__name', { hasText: 'nested.md' })).toBeVisible({
    timeout: 10_000,
  })
})
```

Add a SECOND describe/block (separate launch) for restore-reveal, OR a separate spec file `tests/e2e/lazyTreeReveal.spec.ts` with its own `beforeAll` that seeds `settings.json` with both `lastFolder` and an active tab inside `sub`:

```typescript
fs.writeFileSync(
  path.join(userDataDir, 'settings.json'),
  JSON.stringify({
    lastFolder: docsDir,
    openTabPaths: [path.join(docsDir, 'sub', 'nested.md')],
    activeTabPath: path.join(docsDir, 'sub', 'nested.md'),
  }),
  'utf8',
)
```

```typescript
test('the active file deep in the tree is revealed on restore', async () => {
  // No click: 'sub' is auto-expanded and its children auto-loaded so the
  // active file's row is visible immediately.
  await expect(win.locator('.file-tree__name', { hasText: 'nested.md' })).toBeVisible({
    timeout: 10_000,
  })
})
```

> Verify the actual settings field names against `src/main/settings.ts` (`openTabPaths`, `activeTabPath`) and adjust if they differ. Confirm the file-tree row/name selectors against `FileTree.tsx` (the existing folderWorkflow spec uses `.file-tree__name`).

- [ ] **Step 2: Run the e2e spec**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run build
npm run test:e2e -- lazyTree
```

> e2e launches the BUILT app, so `npm run build` must run first (or use the project's existing e2e command if it builds automatically — check `package.json` scripts and mirror how other e2e specs are run).
> Expected: PASS — root-only on open, children on expand, active file revealed on restore.

- [ ] **Step 3: Commit**

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
git add tests/e2e/lazyTree.spec.ts
git commit -m "test(tree): e2e lazy load, expand, and restore-reveal"
```

---

## Final verification

After all tasks, run the full gate under node 22:

```bash
export PATH="/Users/mocarram/.nvm/versions/node/v22.17.0/bin:$PATH"
npm run verify
```

(`verify` = `typecheck && lint && test && build`.) Everything must pass. Then hand off via `superpowers:finishing-a-development-branch` (do NOT push — leave the branch for the user's review/PR into `staging`).

## Self-review checklist (run before executing)

- **Spec coverage:** single-level listing ✅ (T1); `readDir` one level ✅ (T1); `setChildren` + unloaded/loaded ✅ (T2); load-on-expand ✅ (T4); in-app ops incremental ✅ (T3); session restore reveal ✅ (T5); unit tests for listing/setChildren/loadChildren ✅ (T1-3); e2e open/expand/refresh ✅ (T6). Behavior note (all non-ignored dirs shown): confirmed — `buildFileTree` already pushes every directory regardless of openable descendants, so lazy listing matches current behavior. No persisted `expandedPaths` (matches current app). Loading affordance intentionally omitted (local reads sub-frame).
- **Placeholders:** none — every code step has concrete code. The three op bodies not reproduced (`duplicateCurrent`/`deleteCurrent`/`moveCurrentTo`) carry an exact transformation rule and a "read first" instruction.
- **Type consistency:** `listDirChildren`/`buildFileTree` return `Promise<FileNode[]>`; `setChildren(path, children)`, `loadChildren(dir)`, `revealPath(filePath)`, `parentDir(path)`, `mergePreserveLoaded`, `setNodeChildren`, `loadedDirPaths` names are used identically across tasks. `FileNode.children?: FileNode[]` unchanged.
