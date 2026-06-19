# Live folder tree (lazy load + filesystem watcher) - design

**Date:** 2026-06-19
**Status:** Approved (design); building Phase 1.

## Goal

When a folder is open, files/folders added, removed, or renamed in it **outside
Lekha** should appear in the sidebar live, without hurting performance - and
opening a large folder should be instant. Today the tree is a full recursive
snapshot built on open (`buildFileTree` in `src/main/fs-helpers.ts`), with no
watcher, so external changes never show up and huge folders read eagerly.

## Decisions (locked)

- **Watcher engine:** `@parcel/watcher` (the native watcher VS Code uses) - robust
  batched create/update/delete events; a native dependency.
- **Focus-refresh (A) is dropped.** The half-built `feat/tree-refresh-on-focus`
  is abandoned (stashed, not merged); the watcher supersedes it. The separate
  active-_document_ external-change check (`verifyActiveDoc`) is unrelated and
  stays.
- **Delivery:** two phases, two PRs into `staging`, one shared spec.
  - **Phase 1 - lazy tree** (ships on its own: instant open for large folders).
  - **Phase 2 - watcher** (live updates, built on the lazy tree).
- **macOS-only** target (FSEvents; no Linux inotify-limit concerns).

---

## Phase 1 - Lazy file tree

Load a directory's children on expand instead of building the whole recursive
tree up front.

### Data model

- `FileNode` for a directory: `isDirectory: true`, `children` is **`undefined`
  when unloaded**, an **array (possibly empty) when loaded**. Files have no
  `children`. (Confirm whether the field is optional today; adjust the type if
  needed.)

### Main process

- Replace recursive `buildFileTree(dir)` with a **single-level listing**: read
  only `dir`'s immediate entries, mark sub-directories `isDirectory: true` with
  `children` left unloaded. Reuse existing filters (dotfiles, `node_modules`,
  openable extensions) and the dirs-first, case-insensitive sort.
- `IPC.readDir(dir)` returns one level. The same handler serves both the initial
  root read and per-directory expansion (the renderer calls it with the subdir
  path). Path policy (`assertPathAllowed`) already covers subdirs under an
  allowed root.
- **Behavior note to verify:** if the current recursive build hides directories
  that contain no openable descendants, lazy loading cannot replicate that
  without recursing - so the lazy tree will show all non-ignored directories
  (the VS Code behavior). Confirm current behavior and accept the change.

### Renderer

- `workspaceStore`: add `setChildren(path, children)` (walks the tree, replaces
  that node's children immutably) and treat `children === undefined` as
  unloaded.
- `FileTree.tsx`: on first expand of an unloaded directory, call `readDir(dir)`
  via a new `fileOps.loadChildren(dir)`, store the result, and render. Show a
  brief loading affordance if the read is slow. Loaded children are cached
  (collapse/re-expand does not re-read). `expandedPaths`, active selection, and
  scroll position are preserved (already keyed by path).
- **In-app file ops** (create/rename/delete/move/duplicate) switch from the
  whole-tree `refreshTree` to re-reading only the **affected directory's**
  children (incremental patch via `setChildren`).
- **Session restore:** after the root loads, load children top-down for each
  restored expanded path and for the active file's ancestors, so the active file
  is revealed. Bounded by the number of expanded paths.

### Tests (Phase 1)

- Unit: single-level listing (filters + sort); `setChildren` patches the right
  node immutably; load-children path.
- e2e: open folder shows only root entries; expanding a subfolder loads its
  children; an in-app create inside a subfolder refreshes just that subfolder.

---

## Phase 2 - Filesystem watcher (`@parcel/watcher`)

Live updates while the window is focused or not.

### Main process - `src/main/folderWatcher.ts` (new)

- On folder open, `subscribe(root, cb, { ignore: ['**/node_modules/**',
'**/.git/**', '**/.*'] })`. The callback receives batched events.
- **Debounce ~250ms + dedupe** the set of changed **parent directories**, then
  emit `IPC.folderChanged({ dirs: string[] })` to the owning window.
- Subscribe to the open root only (respect `pathPolicy` allowed roots); a single
  recursive subscription per root. Unsubscribe on folder close, folder switch,
  and window close. Multi-window: each window watches its own open folder.
- Extract the debounce/dedupe/ignore decision into a small **pure, unit-tested
  helper** (which dirs to emit for a batch of events).

### Renderer

- Listen for `folderChanged`. For each changed dir that is **currently loaded**,
  re-read its children (reuse `loadChildren`/`setChildren`) and patch in place.
  Changed dirs that are collapsed/unloaded are ignored (they read fresh on
  expand). A root-level change re-reads the root.
- Preserve `expandedPaths`, selection, and scroll across patches.

### Packaging

- `@parcel/watcher` is a native module: add it to `electron-builder.yml`
  `asarUnpack`, and ensure arm64 + x64 prebuilds ship. Once code-signing is
  enabled (Apple Developer Program), the native `.node` will also need signing.

### Tests (Phase 2)

- Unit: the debounce/dedupe/ignore helper.
- e2e: add a file while the window is focused (no focus event) -> appears live
  (debounced); remove -> disappears; add under an expanded subdir -> appears; add
  under a collapsed/unloaded subdir -> no change until expand.

---

## Performance safeguards

Lazy tree never reads beyond one level per expand · one native recursive
subscription per root · `node_modules`/`.git`/dotfiles ignored at the watcher so
no event floods · 250ms debounce + dir dedupe · only **loaded** dirs re-read ·
incremental per-dir patch, never whole-tree · watcher torn down on close.

## Files touched

- `src/main/fs-helpers.ts` - recursive build -> single-level listing.
- `src/main/ipc/files.ts` - `readDir` one level; wire watcher on folder open/close.
- `src/main/folderWatcher.ts` (new, Phase 2) - subscribe/debounce/emit.
- `src/preload/*` - `onFolderChanged` event channel (Phase 2).
- `src/renderer/store/workspaceStore.ts` - `setChildren`, unloaded/loaded state.
- `src/renderer/components/FileTree.tsx` - load-on-expand + loading state.
- `src/renderer/hooks/useFileOps.ts` - `loadChildren`; incremental refresh after
  in-app ops.
- `electron-builder.yml` - `asarUnpack` for `@parcel/watcher` (Phase 2).

## Out of scope

- Linux/Windows watcher specifics (macOS-only for now).
- A configurable `files.watcherExclude` setting (hardcoded ignores suffice).
- Drag-reorder or other tree UX changes.
