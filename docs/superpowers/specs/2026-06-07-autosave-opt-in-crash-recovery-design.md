# Autosave opt-in + crash recovery - design

Date: 2026-06-07
Status: Approved design (pending spec review)

## Problem

Lekha ships autosave **on by default** (`autoSave: true`), firing 1.5s after you
stop typing and on window blur, writing directly to the open file. Three issues
with this:

1. **Silent overwrite of files.** Opening a file to read it, accidentally
   typing/deleting, and autosave persisting that change to disk without notice.
2. **No explicit save moment.** Autosave blurs when a change becomes permanent,
   removing the deliberate "I am committing this now" Cmd-S moment.
3. **Default is too aggressive.** It is silently active rather than an opt-in
   choice.

Turning autosave off fixes those three, but reintroduces a fourth risk:
**data loss** from forgetting to save, or from an app/OS crash. So the design
pairs an opt-in autosave with an always-on, invisible crash-recovery net that
**never touches the user's real file**.

## Design principles

- **Two independent mechanisms.** Autosave writes to the *real file* on a timer
  (opt-in). Crash recovery writes unsaved buffers to a *safe backup location* in
  app data (always on). The separation is what makes recovery safe: it can never
  cause the silent overwrite that motivated this change.
- **Reuse existing patterns.** The menu toggle mirrors the existing `setTheme`
  main->renderer IPC pattern; the recovery banner mirrors the existing
  `.external-notice` banner; backups use the existing `writeFileAtomic` helper.
- **Cheap by construction.** Backups are small markdown snapshots, debounced,
  atomic writes to app data. No watchers, no measurable perf cost.

---

## Feature 1 - Autosave becomes opt-in

### 1.1 Default flips off

- `src/renderer/store/editorStore.ts` - INITIAL_STATE `autoSave: true -> false`.
- `src/main/settings.ts` - `DEFAULT_SETTINGS.autoSave: true -> false`.

Existing users keep whatever they have persisted; only fresh installs / unset
settings get the new default. Cmd-S becomes the primary save path.

### 1.2 One setting, two synced controls

Single source of truth stays `Settings.autoSave` (persisted in main, mirrored in
`editorStore.autoSave`). Two controls bind to it:

- **`File ▸ Auto Save`** - a checkable menu item, check mark driven by the
  persisted setting.
- **Preferences checkbox** - unchanged location.

### 1.3 Menu toggle (mirrors the `setTheme` pattern)

- **New IPC channel** `setAutoSave: 'app:setAutoSave'` in
  `src/shared/ipc-channels.ts` (main->renderer, value-carrying, like `setTheme`).
- **`src/main/menu.ts`**: add a checkable item to the File submenu:
  ```ts
  { label: 'Auto Save', type: 'checkbox', checked: autoSaveCurrent,
    click: () => { setAutoSave(!autoSaveCurrent) } }
  ```
  `buildMenuTemplate` gains an `autoSave: boolean` input (alongside the existing
  theme menu state) and a `setAutoSave: (value: boolean) => void` callback,
  mirroring `themeMenu`/`setTheme`.
- **`src/main/index.ts`**:
  - `applyMenu(...)` gains the current `autoSave` value so the check mark renders
    from settings (the same way it already passes `currentTheme`).
  - A `setAutoSave` callback: `BrowserWindow.getFocusedWindow()?.webContents
    .send(IPC.setAutoSave, value)`.
  - The `onSettingsChanged` callback already rebuilds the menu on every
    `setSettings`; extend it to pass `updated.autoSave` to `applyMenu` so the
    check mark stays current after either control toggles.
- **`src/preload/index.ts` + `api.d.ts`**: add `onSetAutoSave(cb: (value:
  boolean) => void): () => void`, mirroring `onSetTheme`.

### 1.4 Shared `applyAutoSave` path (DRY)

Both the menu subscription and the Preferences checkbox route through one helper
so behavior is identical:

```ts
function applyAutoSave(next: boolean): void {
  useEditorStore.getState().setAutoSave(next)
  void window.lekha.setSettings({ autoSave: next }) // -> onSettingsChanged -> menu rebuild
  if (next) {
    const { isDirty, path } = useEditorStore.getState()
    if (isDirty && path !== null) void fileOps.save() // immediate flush on enable
  }
}
```

- **Renderer subscription** in `App.tsx` (next to the `onSetTheme` effect):
  ```ts
  const unsub = window.lekha.onSetAutoSave((next) => applyAutoSave(next))
  ```
- **`Preferences.tsx`**: `handleAutoSave` calls the same `applyAutoSave` logic
  (it currently does the store-set + persist inline; consolidate so the
  immediate-flush-on-enable applies there too).

Placement of `applyAutoSave`: it needs `fileOps.save`. It will live where
`fileOps` is available (App-level), exported/passed so Preferences can reuse it,
or duplicated as a thin wrapper that calls a shared core. Implementation plan
decides the exact wiring; the contract is "one behavior, two triggers."

### 1.5 Behavior summary

- **OFF (new default):** writes only on explicit Cmd-S / Save As / the
  close-prompt's "Save".
- **ON (opt-in):** today's behavior (1.5s debounce + flush on blur) plus an
  immediate flush at the moment it is enabled (if the current doc is dirty and
  has a path).

### 1.6 Multi-window note

`autoSave` is an app-global setting. The menu `setAutoSave` send targets the
focused window; that window persists via `setSettings`, and the menu rebuild
reflects the new value globally. Other open windows pick up the new value on
their next settings read / next change. Immediate-flush-on-enable applies to the
focused window's current doc. (Broadcasting to all windows is a possible
enhancement but out of scope; the global setting remains correct.)

---

## Feature 2 - Crash recovery (always on, invisible)

### 2.1 Backup store (main)

New `src/main/backups.ts`, writing to
`join(app.getPath('userData'), 'backups')`:

- File per backup: `<backupId>.json` containing:
  ```ts
  interface BackupRecord {
    backupId: string
    path: string | null   // original file path, null for Untitled
    title: string
    content: string        // the unsaved markdown buffer
    eol: Eol
    savedAt: number        // ms epoch, stamped in main at write time
  }
  ```
- Functions:
  - `writeBackup(record: BackupRecord): Promise<void>` - ensure dir exists,
    `writeFileAtomic(<dir>/<backupId>.json, JSON.stringify(record))`.
  - `deleteBackup(backupId: string): Promise<void>` - unlink, ignore ENOENT.
  - `listBackups(): Promise<BackupRecord[]>` - readdir `*.json`, parse each,
    skip unparseable/corrupt files (best-effort, never throw).
- **IPC channels** (`src/shared/ipc-channels.ts`): `backupWrite: 'backup:write'`,
  `backupDelete: 'backup:delete'`, `backupList: 'backup:list'`. Wired in
  `src/main/ipc/files.ts` via `safeHandle`. Exposed in preload + `api.d.ts`:
  `writeBackup(record)`, `deleteBackup(backupId)`, `listBackups()`.

`savedAt` is stamped in the main process (`Date.now()`), not the renderer, to
keep the renderer call payload minimal and the timestamp authoritative.

### 2.2 Tab model additions

`src/renderer/store/documentsStore.ts` - `DocumentTab` gains:

- `backupId: string | null` - assigned via `crypto.randomUUID()` when the tab
  first becomes dirty (null while clean / never edited). Reused for the life of
  the tab's dirty session; cleared when the backup is cleared.
- `recovered: boolean` - true for tabs restored from a backup after a crash;
  drives the inline banner. Defaults false in `openDocument`/`newDocument`.

### 2.3 Backup triggers (renderer) - independent of the autosave setting

New hook `src/renderer/hooks/useCrashBackup.ts` (sibling of `useAutoSave`), but
**always active**:

- **Debounced (~5s idle) write** of the active doc's live buffer while dirty.
  Resets on each change. Reads markdown from the editor (same source as
  `persist`).
- **Flush on window blur** (immediate, like `useAutoSave`'s blur flush).
- **Flush on tab switch**: `snapshotActive` (in `useFileOps`) already captures
  the outgoing tab's markdown/isDirty; extend it to also write that tab's backup
  when it is dirty, so a tab edited then switched away is captured immediately.
- Covers **Untitled** docs (path null) - the whole point of "all unsaved work".
- A backup write assigns `backupId` (via the store) if the tab does not have one
  yet, and writes `{ backupId, path, title, content, eol }` for that tab.

### 2.4 Backup clearing - clean exit ends with zero backups

- **On successful `persist`** (work is now safely on disk): `deleteBackup(tab
  .backupId)` and clear `backupId` + `recovered` on the tab.
- **On discard**: when the close-guard / tab close discards unsaved changes
  ("Don't Save"), `deleteBackup` for that tab. (The close-guard lives in main
  for the window-close path and in `useFileOps.closeTab` for the in-app tab
  close; both clear the corresponding backup.)

Invariant: a **clean** exit (every dirty doc either saved or explicitly
discarded via the guard) leaves **no** backups. A **crash / kill / power loss**
(no guard ran) leaves backups behind -> detected on next launch.

### 2.5 Recovery on launch

In `src/renderer/hooks/useStartup.ts`, **after** the existing `openTabPaths`
restore loop:

1. `const backups = await window.lekha.listBackups()`.
2. For each backup with a non-null `path`: read the file; if it exists and its
   current content **equals** `backup.content`, the backup is stale ->
   `deleteBackup(backupId)` and skip (no false-positive recovery).
3. For each remaining backup:
   - Dedupe by `path` against already-restored tabs. If a tab for that path was
     already restored from `openTabPaths`, replace its buffer with the backup
     content (the dirty recovered version wins) rather than opening a duplicate.
   - Otherwise open a new tab seeded with `backup.content`, `path`, `title`,
     `eol`.
   - Mark the tab dirty, set `recovered: true`, and set its `backupId` to the
     backup's id (so a later save clears the right backup file).

### 2.6 Recovery banner (mirrors `.external-notice`)

- New per-document state surfaced when the **active** tab has `recovered: true`.
  Render an inline banner (new CSS class `.recovered-notice`, copied from
  `.external-notice` styling with the same dismiss-button structure and
  focus-visible treatment):

  > **Recovered unsaved changes - review and Save.**  [Save]  [×]

- **Save** button: calls `fileOps.save()` (Save As if Untitled), which persists,
  clears the backup, and clears `recovered`.
- **Dismiss (×)**: clears only the `recovered` flag (banner goes away). Content
  stays in the tab, still dirty; the backup remains until the doc is saved or
  discarded. (So dismiss != discard - the user keeps their recovered work.)

---

## Out of scope (YAGNI)

- **afterDelay vs onFocusChange autosave granularity** - a setting most users
  never touch; easy to add later if requested.
- **Conflict-resolution UI** when both the on-disk file and the backup changed
  since the crash. We keep the backup, show the recovery banner, and let the user
  decide via Save / Save As. No three-way merge.
- **Broadcasting autosave-toggle to all windows** - the global setting stays
  correct; non-focused windows sync on their next read/change.

---

## Testing

- **Autosave default**: `settings` default test asserts `autoSave: false`;
  `editorStore` INITIAL_STATE test asserts `false`.
- **applyAutoSave**: enabling while dirty-with-path triggers an immediate save;
  enabling while clean or path-less does not; disabling never saves.
- **Menu**: `buildMenuTemplate` includes a checkable "Auto Save" item whose
  `checked` reflects the passed value (pure template test, like the theme radio).
- **backups.ts** (node env, tmp dir): `writeBackup` then `listBackups`
  round-trips a record; `deleteBackup` removes it; `listBackups` skips a corrupt
  file; ensures the backups dir is created.
- **useCrashBackup**: debounced write while dirty; blur flush; covers Untitled;
  does not write when clean.
- **Clearing**: successful persist deletes the backup and clears `backupId`;
  discard-close deletes the backup.
- **Recovery (useStartup)**: stale backup (content == disk) is deleted, not
  shown; changed backup is restored as a dirty `recovered` tab; dedupe by path
  replaces the restored buffer rather than duplicating; Untitled backup restores
  as a path-less dirty tab.
- **Banner**: renders when active tab `recovered`; Save persists + clears;
  Dismiss clears the flag only (tab stays dirty, backup remains).
- **e2e** (optional, if cheap): toggle autosave off, edit, relaunch with a
  planted backup file, assert the recovery banner appears.

## Files touched (summary)

**Main:** `settings.ts` (default), `menu.ts` (Auto Save item + inputs),
`index.ts` (applyMenu autoSave arg, setAutoSave send, onSettingsChanged),
`backups.ts` (new), `ipc/files.ts` (backup handlers), `ipc-channels.ts`
(setAutoSave + 3 backup channels).

**Preload:** `index.ts` + `api.d.ts` (onSetAutoSave, writeBackup, deleteBackup,
listBackups).

**Renderer:** `editorStore.ts` (default off), `documentsStore.ts` (`backupId`,
`recovered`), `useCrashBackup.ts` (new), `useFileOps.ts` (snapshotActive backup,
persist/close clearing), `useStartup.ts` (recovery), `App.tsx` (onSetAutoSave
subscription, applyAutoSave, recovered banner), `Preferences.tsx`
(handleAutoSave -> shared applyAutoSave), `styles/global.css` (`.recovered-notice`).
