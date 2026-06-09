# Folder-wide Find & Replace - Design

**Date:** 2026-06-10
**Branch:** `feat/folder-replace` (off `feat/sidebar-search-polish`)
**Status:** Approved

## Summary

Add replace-across-files to the sidebar folder-search panel: the existing
folder search gains a whole-word toggle and a collapsible Replace row with a
single "Replace All" action that rewrites every match across the open folder's
markdown files, behind a confirmation, while never clobbering unsaved work.

This is distinct from the in-document find/replace (`Cmd+F` / `Cmd+Alt+F`,
`EditorPane.replaceAll`), which stays untouched.

## Decisions (locked)

- **Match options:** plain text + the existing case-sensitive toggle + a new
  **whole-word** toggle. No regex, no preserve-case.
- **Granularity:** a single **Replace All** (across all matched files) behind a
  confirmation. No per-file or per-match replace.
- **Open files:** **skip** any matched file that is open in a tab with unsaved
  changes (report it); for matched files open in a **clean** tab, reload their
  buffer from disk after the replace so the tab is never stale.

## Existing plumbing (reused)

- `fs:searchFolder` IPC (`src/main/ipc/search.ts`) - read-only matches; returns
  `FolderSearchResult[]` (`src/shared/types.ts`).
- `writeFileAtomic` (`src/main/fs-helpers.ts`) - atomic file writes.
- `FolderSearch.tsx` - the sidebar panel (capsule input + `Aa` toggle, query +
  case flag in `workspaceStore`).
- `documentsStore` - open tabs + per-tab `isDirty`.
- Native confirm pattern exists (`dialog:confirmUnsaved`).

## Components

### A. Shared matcher (`src/shared/textSearch.ts`, new)

One pure, dependency-free module used by BOTH search and replace so highlights
and replacements always agree:

- `findMatchRanges(text, query, opts): Array<[start, end]>` - all match offsets.
- `replaceAllInText(text, query, replacement, opts): { text, count }`.
- `opts = { caseSensitive: boolean; wholeWord: boolean }`.

Plain substring matching (NOT regex). `wholeWord` requires a non-word char (or
string edge) on both sides of a match (`\w` = `[A-Za-z0-9_]`). Empty `query`
matches nothing. Fully unit-tested.

### B. Search IPC gains whole-word

- `SearchFolderArgs` + the `fs:searchFolder` handler accept `wholeWord: boolean`.
- The handler's line-matching uses `findMatchRanges` from the shared matcher.
- `FolderSearch`'s inline highlight helper also uses `findMatchRanges` (replacing
  its local substring logic) so highlights match the search semantics.

### C. Replace IPC (`fs:replaceInFolder`, new)

New channel + handler (`src/main/ipc/replace.ts`):

- Args: `{ root, query, replacement, caseSensitive, wholeWord, skipPaths: string[] }`.
- Walks the same markdown file set the search uses (share the file-enumeration
  helper from `search.ts`; extract it if needed). For each file NOT in
  `skipPaths`: read, `replaceAllInText`, and if `count > 0` write via
  `writeFileAtomic`.
- Returns `{ filesChanged: number; replacements: number; changedPaths: string[]; skippedPaths: string[] }`
  (`skippedPaths` echoes the skip set that actually had matches, for the report).
- Never touches `skipPaths`. Read errors on a single file are caught and that
  file skipped (best-effort), not fatal.

### D. Confirm IPC (`dialog:confirmReplace`, new)

A small main-process `dialog.showMessageBox` returning a boolean, called with the
count message. Buttons: **Replace All** / **Cancel**, default Cancel, cancelId
Cancel. (Mirrors the existing `confirmUnsaved` pattern.)

### E. Renderer flow (`FolderSearch.tsx`)

- **Whole-word toggle** (`ab`) beside the `Aa` toggle in the capsule; drives
  `workspaceStore.searchWholeWord` and is passed to `searchFolder`.
- **Collapsible Replace row** under the search capsule: a chevron toggles it; a
  matching capsule Replace input (`workspaceStore.searchReplaceText`) + a
  **Replace All** button.
- **Replace All** handler:
  1. Compute `skipPaths` = open tabs with `isDirty` (from `documentsStore`)
     whose path appears in the current results.
  2. Confirm via `dialog:confirmReplace` with counts ("Replace N matches in M
     files?" + "X open unsaved file(s) will be skipped." when applicable +
     "This cannot be undone.").
  3. On confirm: call `fs:replaceInFolder`.
  4. For each `changedPath` open in a **clean** tab: reload it - active tab via
     `editorRef.setMarkdown(diskContent)`, background tabs by refreshing their
     `documentsStore` markdown snapshot. (A new App-level callback passed into
     `FolderSearch`, mirroring `onOpenResult`.)
  5. Re-run the search to refresh results, and show a status line: "Replaced N
     in M files" (+ "· skipped X unsaved" when applicable).

### F. Store (`workspaceStore`)

Add `searchWholeWord: boolean` (default false) + `searchReplaceText: string`
(default '') alongside the existing `searchQuery` / `searchCaseSensitive`, so
they survive the sidebar being collapsed. The Replace-row expanded state is
local component state (not persisted).

### G. Styling (`global.css`)

- `ab` whole-word toggle: same ghost style as the `Aa` case button.
- Replace row + Replace input capsule: mirror the search capsule; the expand
  chevron is a small ghost button.

## Safety

- Destructive + non-undoable → always behind the confirmation (D).
- `writeFileAtomic` prevents partial writes.
- Unsaved open files are never written (skip + report).
- Clean open tabs are reloaded so the on-disk change and the in-app buffer can't
  diverge (which would otherwise let a later save clobber the replacement).

## Testing

- **Unit (shared matcher):** case sensitivity, whole-word boundaries (incl. edges
  and `_`/digits), replace counts, empty query, no-match.
- **Unit (`replaceInFolder` handler):** temp dir with several files - replaces in
  matching files, honors `skipPaths`, returns correct counts/paths, leaves
  non-matching + skipped files byte-identical, survives a single unreadable file.
- **Unit (skip computation):** dirty open tabs whose paths are in results are
  collected; clean/closed are not.
- **e2e:** type a query, expand Replace, type a replacement, Replace All, accept
  the confirm; assert a file's content changed.

## Out of scope (YAGNI)

Regex, preserve-case, per-file/per-match replace, an undo/history for the bulk
op, and any change to the in-document find/replace.

## Risks

- **Whole-word semantics** for non-ASCII: `\w` is ASCII-only here; acceptable for
  v1 (documented). Plain substring otherwise.
- **Reload wiring for background open tabs** is the fiddliest part; covered by
  routing through `documentsStore` snapshots + the active editor ref.
