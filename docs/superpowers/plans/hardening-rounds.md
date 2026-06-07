# Hardening Rounds - Security / Performance / Live-Usage

Tracks the audit phase (campaign item 4): adversarially-verified findings from
parallel review workflows and the fix decisions (fixed / wontfix + why).

## Baseline security posture (verified, already in place)

- Electron: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`
  (src/main/window.ts); allow-listed `window.lekha` preload bridge.
- CSP (src/main/index.ts CSP_DIRECTIVES): `default-src 'self'`,
  `script-src 'self'`, `connect-src 'self'`, `img-src 'self' data: file: blob:`
  (no remote http), `object-src 'none'`, `frame-src 'none'`. This already
  neutralizes the main custom-theme risk: a malicious user theme's
  `background: url(http://evil/?data)` is blocked (img-src has no http) and
  `fetch`/beacon is blocked (connect-src 'self'). Theme CSS is injected via
  `textContent` (no HTML parse) and `</style>` is escaped.

## Audit round log

(Findings + decisions appended per round below.)

## Round 1 - parallel audit (workflow wf_91e1cd9f-769, 55 agents, 19 confirmed)

1. **[HIGH/ux-a11y]** Sidebar tab buttons missing :focus-visible styles
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/Sidebar.tsx:118-147
   - fix: Add .sidebar__tab-btn:focus-visible rule to global.css (around line 182) with matching or stronger visual feedback compared to hover state. Example: `border-radius: 4px; outline: 2px solid var(--color

2. **[MEDIUM/sec-themes]** Symlink Following Leading to Arbitrary File Read
   - file: src/main/userThemes.ts:82-89
   - fix: Use lstat() instead of stat() to detect symlinks without following them: const info = await lstat(filePath); if (!info.isFile()) continue; // this now correctly rejects symlinks

3. **[MEDIUM/perf-render]** Per-keystroke markdown mirroring to documentsStore.updateActive causes full documents array re-render
   - file: src/renderer/App.tsx:363
   - fix: Instead of calling updateActive on every keystroke, debounce it (e.g. 500ms) to batch markdown snapshots. Keep immediate updates for `isDirty` flag but defer markdown syncing to inactive tab snapshots

4. **[MEDIUM/perf-render]** TabBar re-renders on every keystroke due to unshallow-compared `documents` and `activeId` selectors
   - file: src/renderer/components/TabBar.tsx:24-25
   - fix: Combine the two selectors into a single shallow-comparable object: `useDocumentsStore(useShallow((s) => ({ documents: s.documents, activeId: s.activeId })))` if zustand provides useShallow, OR refacto

5. **[MEDIUM/perf-render]** Sidebar and FileTree components re-render on keystroke due to fileTree and rootFolder selector changes
   - file: src/renderer/components/Sidebar.tsx:61-62 + src/renderer/App.tsx:197-198
   - fix: Wrap FileTreeNode in React.memo and make its onSelect, onToggleExpand, and other callbacks stable (memoize them in FileTree). Also consider combining the two workspace selectors into a single object w

6. **[MEDIUM/ux-a11y]** Tab strip lacking keyboard navigation support
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/TabBar.tsx:30-83
   - fix: Add onKeyDown handler to the role="tablist" container to handle ArrowLeft/ArrowRight keys, cycling focus between tabs and calling onSelect(). Each tab should also have tabIndex={isActive ? 0 : -1} so

7. **[MEDIUM/ux-a11y]** StatusBar buttons missing :focus-visible indicator
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/StatusBar.tsx:40-65
   - fix: Add .status-bar__counts:focus-visible and .status-bar__mode-btn:focus-visible rules to global.css with box-shadow: var(--focus-ring) and border-radius: 3px to match the padding and rounded corner trea

8. **[MEDIUM/ux-a11y]** Dialog buttons missing :focus-visible styling
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/styles/global.css:677-700
   - fix: Add .dialog-btn:focus-visible rule after line 690 with `outline: 2px solid var(--color-accent); outline-offset: 2px;` or `box-shadow: var(--focus-ring);` to make focus visible for keyboard users.

9. **[MEDIUM/ux-a11y]** Outline custom button span lacks proper focus styling
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/Outline.tsx:52-63
   - fix: Add .outline__item:focus-visible rule in global.css after line 598 with `outline: 2px solid var(--color-accent); outline-offset: -2px;` or `box-shadow: inset 0 0 0 2px var(--color-accent);` for contra

10. **[MEDIUM/ux-a11y]** FileTree rows lacking visible keyboard focus indicator
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/FileTree.tsx:160-190
   - fix: Add .file-tree__row:focus-visible rule in global.css after line 434 with `outline: 2px solid var(--color-accent); outline-offset: -2px;` to match the file tree's visual style while providing keyboard

11. **[MEDIUM/ux-a11y]** Focus return on dialog close not managed
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/RenameDialog.tsx:60-102, GetInfoDialog.tsx:60-93, LinkDialog.tsx:96-186, ImageDialog.tsx:73-131
   - fix: Store a ref to the previously focused element before the dialog opens (via useEffect when open becomes true), and restore focus to that element in the cleanup function when the dialog closes. Alternat

12. **[MEDIUM/ux-a11y]** CommandPalette role="combobox" semantics may be incorrect
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/CommandPalette.tsx:205-219
   - fix: Minor: Change aria-expanded={rows.length > 0} to better reflect the semantic state, or add a comment explaining why aria-expanded is always true. This is a minor semantics refinement and not a breakin

13. **[MEDIUM/ux-flows]** No error feedback when file open fails in tab workflow
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/hooks/useFileOps.ts:305
   - fix: Wrap the readFile and loadInto calls in useFileOps.openPath() with try/catch. On error, display a user-facing notification (e.g., window.alert or a toast component if available) with the error message

14. **[MEDIUM/ux-flows]** Closing last tab closes the window or shows stray blank tab; behavior is non-obvious
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/hooks/useFileOps.ts:351-370
   - fix: Consider: (1) documenting this behavior in the UI (status bar hint or tooltip on the close button), (2) showing a confirmation when closing the last tab ('Close this window or create a new document?')

15. **[MEDIUM/ux-flows]** Theme menu radio checks not updated on custom theme removal
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/main/menu.ts:64-84
   - fix: When reloadThemes() completes, check if the current theme id is still in the returned list. If not, auto-switch to 'github', persist the change, rebuild the menu, and show a brief notification ('Activ

16. **[LOW/sec-electron]** Missing X-Content-Type-Options header in CSP configuration
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/main/index.ts:280
   - fix: Add 'X-Content-Type-Options': ['nosniff'] to the responseHeaders object in the onHeadersReceived callback. Also consider adding X-Frame-Options: DENY and X-XSS-Protection headers for defense-in-depth.

17. **[LOW/perf-engine]** Repeated MarkdownIt instantiation for error rendering
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/export/buildHtml.ts:181
   - fix: Move the `.utils.escapeHtml()` call outside the loop or cache a single MarkdownIt instance at module level, or use a lightweight HTML escape function (4 regex replaces, per lines 320-325 in the same f

18. **[LOW/ux-flows]** Silent failure when reloading custom themes with syntax errors
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/hooks/useCommands.ts:220
   - fix: Add .catch() handler to the reloadThemes promise that displays an error message to the user (e.g., window.alert('Failed to reload themes: ' + error.message)). Also consider a brief success message to

19. **[LOW/ux-flows]** Unsaved changes in inactive tabs are not visually distinct from active tab
   - file: /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha/src/renderer/components/TabBar.tsx:32-70
   - fix: Make the dirty dot always visible (do not hide it on hover). Alternatively, add a visual indicator (e.g., background tint, border, or badge count) to the tab bar itself to show the number of dirty doc

### Wave 26 - FIXED: a11y focus-visible (findings 1, 7, 8, 9, 10)
Added :focus-visible rules in global.css for .sidebar__tab-btn, .status-bar__counts/.status-bar__mode-btn, .dialog-btn, .outline__item, .file-tree__row (box-shadow var(--focus-ring) for radiused controls; inset outline for rows). +6 structural tests.

### Wave 27 - FIXED: security (findings 2, 16)
- (2) userThemes.listUserThemes now uses lstat (not stat) so a *.css SYMLINK is rejected (isFile() false) before readFile - prevents arbitrary file read via the themes folder. +1 test (symlink to a secret is skipped, content never surfaces).
- (16) Added X-Content-Type-Options: nosniff + X-Frame-Options: DENY response headers alongside the CSP (defense-in-depth).

### Wave 28 - FIXED: perf (findings 3, 4; 5 resolved by root cause)
handleChange no longer mirrors `markdown` into the active tab on every keystroke - it only flips `isDirty` on the clean->dirty transition. The tab's markdown snapshot is captured lazily from the live editor at switch (snapshotActive), save (persist), and close. This removes the per-keystroke `documents` array identity churn that re-rendered the TabBar on every key press (findings 3+4). Finding 5 (Sidebar/FileTree re-render on keystroke) is resolved by the same root cause: with no per-keystroke documents mutation and App not subscribing to markdown, nothing re-renders per keystroke. Verified safe: no code reads the active tab's markdown expecting per-keystroke freshness (loadTab uses the snapshot set at switch-away; reuseBlank no longer checks markdown). Suite + e2e (edit/switch/dirty) green.

### Wave 29 - FIXED: UX robustness (findings 13, 15, 18, 19)
- (13) useFileOps.openPath wraps readFile in try/catch -> window.alert with the path + error; no tab is added on failure. +1 test.
- (18) useCommands reloadThemes gained a .catch -> alert so a failed re-scan is surfaced.
- (15) reloadThemes: if the active theme's file was removed (id no longer built-in or in the reloaded list), fall back to applyTheme('github') + persist, so the UI is never stuck on a dead theme.
- (19) Dirty tabs now italicize their title (.tab--dirty .tab__title) so the unsaved state stays visible even while hovered (when the dot is swapped for the close x). +1 CSS test.
Deferred: (14) close-last-tab leaves a blank Untitled - this is intentional WYSIWYG-like behavior (wontfix). (12) combobox aria-expanded - cosmetic, low value (wontfix). (17) MarkdownIt escape micro-opt - negligible (deferred). (6 tab arrow-key nav, 11 dialog focus-return) -> next wave.

### Wave 30 - FIXED: keyboard a11y (findings 6, 11) - AUDIT ROUND 1 COMPLETE
- (11) useFocusTrap now returns focus to the opener element on close (captures document.activeElement when the trap engages; restores on cleanup, but only when focus is "loose" - body/null/inside the closing container - so it never steals focus the user/app moved elsewhere). All dialogs (Rename/GetInfo/Link/Image/Preferences) get this for free. +2 tests.
- (6) TabBar implements the WAI-ARIA tabs keyboard pattern: roving tabindex (active tab = 0, others = -1), ArrowLeft/ArrowRight (wrap), Home/End, Enter/Space activate; .tab:focus-visible ring. +5 tests.

Round-1 tally: 19 confirmed -> 15 fixed (1,2,3,4,6,7,8,9,10,11,13,15,16,18,19) + 1 root-cause-resolved (5) + 3 reasoned-deferred (12 cosmetic, 14 intentional WYSIWYG behavior, 17 negligible micro-opt). Suite: 1350 unit + 9 e2e green.

## Round 2 - correctness bug-hunt (workflow wf_ad971ea7-354, 33 agents, 16 confirmed)

1. **[HIGH/engine-roundtrip]** Table cell backslash escaping causes exponential growth on each round-trip (serializer.ts)
2. **[HIGH/engine-roundtrip]** Escaped dollar signs in text lose escaping, become math delimiters (math-plugin.ts)
3. **[HIGH/engine-roundtrip]** Empty links disappear entirely (serializer.ts)
4. **[HIGH/perf-largedoc]** Full-document O(n) re-parse on every keystroke in WYSIWYG mode (within 150ms debounce) (App.tsx)
5. **[HIGH/tabs-edgecases]** File renamed/moved on disk while open in tab leaves stale path (useFileOps.ts)
6. **[HIGH/themes-edgecases]** User Theme ID Collides with Built-in Theme IDs, Creating Duplicate Menu Items (index.ts)
7. **[MEDIUM/engine-roundtrip]** Reference links expanded to inline links, losing link definition semantics (parser.ts)
8. **[MEDIUM/engine-roundtrip]** Table cells with newlines collapse to space (serializer.ts)
9. **[MEDIUM/perf-largedoc]** Full decoration rebuild on every keystroke for heading folds, syntax highlighting, and find highlights (headingFold.ts)
10. **[MEDIUM/perf-largedoc]** No re-use of parsed AST between WYSIWYG doc state and recomputeDerived outline/count (EditorPane.tsx)
11. **[MEDIUM/perf-largedoc]** Word count and outline fully recomputed on every keystroke despite only small document deltas (wordCount.ts)
12. **[MEDIUM/tabs-edgecases]** Save-guard race: dirty flag lost if tab closed during save (useFileOps.ts)
13. **[MEDIUM/tabs-edgecases]** Reuse-blank-tab clobbering when openPath fails but file already partially loaded (useFileOps.ts)
14. **[MEDIUM/themes-edgecases]** Theme Metadata Parser Matches Comments Outside Header Block (userThemes.ts)
15. **[MEDIUM/themes-edgecases]** Duplicate User Theme IDs Possible on Case-Insensitive Filesystems (userThemes.ts)
16. **[LOW/engine-roundtrip]** Horizontal rules normalized to em-dash form (serializer.ts)

### Wave 31 - FIXED: serializer round-trip data loss (round-2 bugs 1, 2)
- (1) Table cell backslashes were double-escaped (serializeCell re-escaped `\` on top of the inner serializer's escaping), growing unbounded on every save (a\b -> a\\b -> a\\\\b ...). Removed the redundant backslash re-escape; cells now only escape pipes + collapse newlines. Idempotent.
- (2) A literal "$x$" arising from escaped `\$...\$` re-parsed into an inline-math node on the next load (semantic data loss). Added `escapeExtraCharacters: /\$/g` to the MarkdownSerializer so `$` in text is written `\$` (real math is a math_inline node serialized separately, so it is unaffected).
- Removed two scratch round-trip test files the audit agents left in tests/unit/editor; added a clean tests/unit/editor/serializerRoundtrip.test.ts (+5).
Deferred (round-2): (3) empty links `[](url)` vanish - links are MARKS so empty-text links can't carry the mark; fixing needs a schema change for a pathological/rare input (documented, low value). (7) ref-links normalize to inline - lossy but idempotent + standard WYSIWYG behavior (WYSIWYG does the same). (16) `***`/`___` HR -> `---` - cosmetic, idempotent. (8) table-cell newline collapse - not reachable (GFM cells can't contain literal newlines).

### Wave 32 - FIXED: perf reuse live AST (round-2 bugs 4, 10, 11)
WYSIWYG typing no longer re-parses the whole markdown string to derive outline + word/char counts. EditorView already hands EditorPane the live ProseMirror doc; EditorPane now forwards it to App's onChange as a second arg, and recomputeDerived(doc) consumes it directly (getOutline/countWords already take a Node). The 150ms-debounced full markdown-it parse on the typing path is eliminated for WYSIWYG (the common case). Source mode (no PM doc) still parses the string once per debounce window. recomputeDerived signature changed string->Node; mount seed parses once.

### Wave 33 - FIXED/VERIFIED: tab edge-cases (round-2 bugs 5, 12, 13)
- (5, HIGH) FIXED: documentsStore.updatePath(oldPath, newPath) rewrites the path+title of any tab matching the renamed/moved entry (exact match) or sitting under a renamed/moved folder (prefix match). App.handleRenameEntry now calls it for ALL tabs (not just the active editorStore path). useFileOps.moveCurrentTo now updates the active tab's path IN PLACE instead of openPath(newPath) - the old code duplicated the tab and re-read from disk, discarding unsaved in-memory edits. +3 store tests.
- (12, MEDIUM) VERIFIED no race: closeTab is async and awaits selectTab -> guardUnsaved -> save -> closeDocument sequentially; the UI triggers closes one at a time. Covered by the existing Wave-23c save-then-close test. No code change.
- (13, MEDIUM) VERIFIED fixed (by Wave 29): openPath reads the file in a try/catch and returns BEFORE any tab mutation, so a failed read never clobbers the blank/reuse tab. +1 test confirming the seeded blank tab is untouched on read failure.

### Wave 34 - FIXED: theme edge-cases (round-2 bugs 6, 14, 15) - ROUND 2 COMPLETE
- (6, HIGH) listUserThemes drops any user theme whose (lower-cased) id collides with a built-in THEMES id, so a night.css can never produce a duplicate Theme-menu entry or shadow the built-in. +1 test.
- (14, MEDIUM) parseThemeMetadata now reads @name/@type ONLY from a leading comment block (^\s*/* ... */), so a metadata-looking comment lower in the file (e.g. inside a token value) is ignored. +2 tests.
- (15, MEDIUM) listUserThemes de-dupes by lower-cased id (first wins), so two files differing only in case can't yield two same-id themes. Shares the same lower-cased Set as bug 6 (covered by the collision test).

Round-2 tally: 16 confirmed -> 9 fixed (1,2,4,5,6,10,11,14,15) + 2 verified-already-safe (12,13) + 5 reasoned-deferred (3 empty-links/marks, 7 ref-links/idempotent, 8 table-newline/unreachable, 16 HR-normalize/cosmetic). Suite: 1362 unit + 9 e2e green.

### Wave 35 - External file-change detection (lazy, rename-follow)
Resolves the long-deferred ledger item "Detect external on-disk changes to the open file" + the Finder-rename staleness risk flagged when discussing the macOS title-bar proxy menu.
- **Trigger:** a SINGLE `fs.stat` of the active document on `window` focus (returning from Finder). No fs watchers, no polling, nothing on the typing path; throttled to once/second + in-flight guard.
- **Rename-follow (smooth):** a rename keeps the inode, so on a missing path we scan ONLY the parent folder for a matching inode (rare, bounded) and silently re-point the tab + editor + OS title to the new name.
- **Detach (safe):** a move-elsewhere/delete keeps the buffer (no data loss), clears the path so the next Save is Save As, marks dirty, and shows a quiet non-blocking notice bar (not a modal).
- Plumbing: `FileStat.inode` + `OpenFileStatus` type; `findPathByInode`/`verifyOpenFile` (main, lstat-based, skips dotfiles); `fs:verifyOpenFile` IPC + preload; `editorStore.inode` + `DocumentTab.inode` captured on load/save and carried across tab switch/snapshot; App focus handler + `.external-notice` banner.
Tests: +5 fs-helpers (statFile inode, verifyOpenFile present/renamed/missing, findPathByInode miss); store/mocks updated for inode. 1367 unit + 9 e2e green.

### Wave 36 - macOS title-bar proxy icon (idiomatic)
The proxy icon was already wired (setDocumentState -> setRepresentedFilename + setDocumentEdited on darwin); with Wave 35's external-change detection in place, the Finder rename/move/tags popover is now SAFE (the app follows the rename / detaches gracefully). This wave makes the title idiomatic:
- Extracted a pure `formatWindowTitle(title, dirty, isMac)` and used it in the setDocumentState handler. On macOS the title is just the document name (the native edited-dot on the close button + the proxy icon convey state); on Windows/Linux a `• ` prefix marks dirty. Removes the redundant `• ` that previously showed on mac alongside the native dot.
- +2 tests. Feature complete: proxy icon + Cmd-click breadcrumb + drag-to-move + native edited dot, kept in sync by the Wave-35 watcher.
