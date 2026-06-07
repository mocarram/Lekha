# WYSIWYG-Parity Campaign - Ledger

Backlog from the parity audit (workflow `wysiwyg-parity-audit`, 13 agents, 94 findings).
Implemented items are checked off and noted under **Progress log**.


## HIGH (21)

- [ ] **[document-mgmt/L]** Detect external on-disk changes to the open file
  - WYSIWYG: When the file you have open is modified or deleted by another program (git checkout, another editor, cloud sync), WYSIWYG notices and prompts to reload (or warns the file was removed), preventing you from silently overwriting external edits on the next save.
  - Lekha: There is no fs.watch anywhere (grep for watch/FSWatcher/chokidar returns only unrelated zustand subscribers). Once a file is loaded via loadInto() the renderer keeps its in-memory copy; autosave (useAutoSave.ts) and save() (useFileOps.ts persist()) blindly writeFileAtomic over whatever is on disk. External modifications are silently clobbered and external deletions are unnoticed.
  - Change: In the main process, watch the currently-open file path with fs.watch (or chokidar) scoped per window; on a change/rename event that did not originate from our own writeFileAtomic, send an IPC to the owning renderer. In the renderer, if the document is clean, reload automatically; if dirty, prompt 'File changed on disk - Reload / Keep mine'. Track our own writes (e.g. an ignore-window after writeFileAtomic) to avoid self-triggering.
  - Files: `files.ts`, `fs-helpers.ts`, `useFileOps.ts`, `App.tsx`, `ipc-channels.ts`
- [ ] **[block-elements/M]** Add a new row when Tab is pressed in the last table cell
  - WYSIWYG: Pressing Tab while in the bottom-right cell of a table appends a new empty row and moves the cursor into its first cell, so you can build a table entirely from the keyboard.
  - Lekha: keymap.ts tabCmd = chainCommands(goToNextCell(1), sinkListItem...). prosemirror-tables' goToNextCell returns false when findNextCell finds no next cell (last cell), so Tab in the last cell does nothing table-related and falls through to list indent (a no-op outside a list). No row is ever added.
  - Change: Wrap goToNextCell(1) in a chained command: if goToNextCell(1) returns false but isInTable(state) is true, call addRowAfter then move the selection into the first cell of the new row. Add this as a new helper in tableCommands.ts and use it in the tabCmd chain in keymap.ts.
  - Files: `keymap.ts`, `tableCommands.ts`
- [ ] **[sidebar-filetree/M]** Persist folder expand/collapse state across tree refreshes
  - WYSIWYG: Folders stay expanded after you create/rename/delete a file or otherwise refresh the tree; the expansion state is a property of the tree, not of the render.
  - Lekha: Each FileTreeNode holds its own `const [expanded, setExpanded] = useState(false)` (FileTree.tsx line 133). Every mutating op in App.tsx (handleNewFile/NewFolder/Rename/Delete) calls `fileOps.refreshTree()` which replaces `fileTree` in the store, remounting all nodes and resetting every folder back to collapsed. So after creating a file inside a deeply nested folder, the whole tree snaps shut and the user loses their place.
  - Change: Lift expansion state out of the node. Keep an `expandedPaths: Set<string>` in FileTree (or workspaceStore keyed by absolute path) and pass `expanded`/`onToggle` down to FileTreeNode instead of local useState. Because nodes are keyed by absolute path, the Set survives a tree refresh and folders that were open stay open.
  - Files: `FileTree.tsx`, `workspaceStore.ts`
- [ ] **[sidebar-filetree/M]** Auto-reveal and scroll the active file into view
  - WYSIWYG: Opening a file (from Open Recent, search, or links) auto-expands its parent folders in the file tree and scrolls the highlighted row into view, so the current document is always locatable in the sidebar.
  - Lekha: The active row only gets an `active` class (FileTree.tsx line 135 `node.path === activePath`). Nothing expands ancestor folders or scrolls to the row. If the active file lives in a collapsed subfolder (the default, since folders start collapsed - line 133), the user sees no indication of where the open file is and must manually drill down.
  - Change: When `activePath` changes, compute its ancestor folder paths and add them to the expandedPaths set from the finding above, then scrollIntoView the active row (ref on the active node, `block:'nearest'`). Ideally also expose a 'Reveal in sidebar' / 'Locate current file' affordance.
  - Files: `FileTree.tsx`
- [ ] **[outline/M]** Highlight the active heading as you scroll the document
  - WYSIWYG: WYSIWYG's outline continuously highlights the heading whose section the viewport is currently in. As you scroll the editor, the highlight moves down the outline automatically, giving a live 'you are here' indicator.
  - Lekha: There is no active-heading tracking at all. Outline.tsx renders rows with only a :hover background (global.css .outline__item:hover); there is no IntersectionObserver, no scroll listener, and no 'active' CSS class anywhere (grep for scroll/IntersectionObserver/active in Outline.tsx and outline.ts returns nothing). The store only holds the flat outline array (editorStore.ts outline) with no notion of which heading is current.
  - Change: Add active-heading tracking: in EditorView, attach a scroll listener (or IntersectionObserver on heading DOM nodes) on the editor scroll container that determines the topmost heading at/above the scroll position and writes its pos into the editor store (e.g. activeHeadingPos). Pass activeHeadingPos into Outline; in OutlineNodeRow add an `outline__item--active` class when node.pos === activeHeadingPos, and add a matching CSS rule (accent background/left-border). Throttle the scroll handler with requestAnimationFrame.
  - Files: `EditorView.tsx`, `editorStore.ts`, `Outline.tsx`, `Sidebar.tsx`, `global.css`
- [ ] **[images/M]** Resolve relative assets/ paths to file:// for display
  - WYSIWYG: After copying a pasted/dropped image into the document's assets/ folder, WYSIWYG writes a relative path (e.g. assets/foo.png) into the Markdown AND immediately displays the image inline, because it resolves the relative path against the document's own directory on disk.
  - Lekha: main/ipc/images.ts:65-70 returns a POSIX-relative path `assets/<filename>` for saved docs, and imagePaste.ts inserts that literal string as the image node's `src`. Nothing in the renderer rewrites relative paths to a file:// URL against the doc directory (grep shows no assets/file:// resolution anywhere in src/renderer except a placeholder string and a comment). The renderer is loaded from the app bundle's own URL, so a `src="assets/foo.png"` resolves against the bundle, not the document folder, and the just-pasted image renders broken. The image only displays correctly for unsaved docs (which get an absolute file:// URL) - the opposite of what a user expects.
  - Change: Add a renderer-side src resolver: when an image node's src is a relative path (not http(s)://, data:, or file://), resolve it to `file://<dirname(docPath)>/<src>` before rendering. Implement via a small image NodeView (registered in EditorView.tsx nodeViews) or a decoration that sets the rendered <img>'s effective src while keeping the stored attr relative for serialization. The NodeView needs access to getDocPath (already available from imageEditorProps wiring). Also apply the same resolution when feeding `src` to ImageZoom in App.tsx.
  - Files: `EditorView.tsx`, `imagePaste.ts`, `App.tsx`
- [ ] **[math-diagrams/M]** Auto-enter edit mode when a math/diagram node is freshly inserted
  - WYSIWYG: When you create a block equation (type `$$` then Enter) or insert inline math, WYSIWYG drops you straight into the LaTeX source editor with the caret ready, so you can type the formula immediately. Same for a new mermaid block created via the menu.
  - Lekha: slashMenu.ts inserts `math_block`/`math_inline` with `{ latex: '' }` and `code_block` mermaid with starter source, but the new node renders in its RENDERED state showing a muted placeholder ("Empty math block" / "$ $"). makeMathNodeView only enters edit mode on a `click` of renderContainer (handleRenderClick) - there is no auto-focus on creation, so the user must hunt for and click the tiny placeholder to start typing.
  - Change: When the slash-menu (or input rule) inserts an empty math node, set a NodeSelection on it and have the NodeView enter edit mode on first mount if its latex is empty. Concretely: in makeMathNodeView, if `node.attrs.latex` is '' on construction, call enterEditMode() in a microtask; and/or detect a NodeSelection targeting this node in update()/via a selectNode() implementation (add `selectNode()` to the returned NodeView that calls enterEditMode). For mermaid, the existing `is-active-block` source reveal already covers it, but math has no equivalent.
  - Files: `mathNodeView.ts`, `slashMenu.ts`
- [ ] **[export-print/M]** Add a real Print command (system print dialog)
  - WYSIWYG: WYSIWYG has File > Print (Cmd/Ctrl+P) that opens the OS print dialog, letting the user pick any installed printer, paper size, page range, copies, or 'Save as PDF' via the native dialog. PDF export is a separate, dedicated command.
  - Lekha: There is no Print command at all. The only PDF path is 'Export to PDF…' which calls webContents.printToPDF() silently into a save dialog (src/main/ipc/export.ts exportPdf handler). No window.print(), no webContents.print(), and grepping finds no print menu item or @media print rules anywhere in the codebase.
  - Change: Add an 'exportPrint' (or 'print') AppCommand in src/shared/commands.ts + registry.ts, a File-menu item with Cmd/Ctrl+P in src/main/menu.ts, and an IPC handler that builds the same export HTML, loads it into the existing offscreen flow (or the live window), and calls webContents.print() with showDialog so the user gets the native print dialog. Reuse the buildExportHtml output already produced for PDF.
  - Files: `commands.ts`, `registry.ts`, `menu.ts`, `export.ts`, `index.ts`, `api.d.ts`, `useCommands.ts`
- [ ] **[themes/M]** Add a "Follow System Appearance" auto theme that switches light/dark with the OS
  - WYSIWYG: WYSIWYG has a built-in "Auto" appearance that follows the OS light/dark setting and live-switches between a chosen light theme and dark theme as macOS/Windows toggles appearance, with no app restart.
  - Lekha: There is no system-following at all. THEMES in src/shared/types.ts is a fixed list of 7 explicit themes; applyTheme() only sets data-theme to whichever id is stored. There is zero use of prefers-color-scheme, matchMedia, or Electron nativeTheme anywhere in src (grep for prefers-color-scheme/nativeTheme/matchMedia returns nothing). A user on auto-dark-mode is stuck on whatever static theme they last picked.
  - Change: Add an 'auto' (or 'system') pseudo-theme. In the renderer, when the stored theme is 'auto', resolve to a light/dark pair (e.g. github / night) via window.matchMedia('(prefers-color-scheme: dark)'), apply that id, and register a change listener so toggling OS appearance live re-applies and re-dispatches lekha-theme-change (so mermaid re-themes). In the main process, set nativeTheme.themeSource accordingly so native chrome matches. Add the 'auto' entry to THEMES so it appears in the Themes menu and Preferences.
  - Files: `index.ts`, `types.ts`, `window.ts`
- [ ] **[themes/M]** Syntax-highlight the source-mode (CodeMirror) markdown instead of rendering it monochrome
  - WYSIWYG: WYSIWYG's source mode colors markdown syntax: headings, bold/italic markers, link/image syntax, inline/fenced code, blockquote markers, list bullets, etc. are visually distinct, matching the active theme.
  - Lekha: SourceView.tsx builds the CodeMirror state with only [markdown(), history(), keymap, updateListener] - no syntaxHighlighting/HighlightStyle extension. github.css section 11 styles .cm-content/.cm-line with a single color: var(--text) and only sets the cursor color. Result: raw markdown in source mode is flat single-color text with no token coloring in ANY theme.
  - Change: Add a CodeMirror HighlightStyle wired to the theme tokens. Define a HighlightStyle.define([...]) mapping @lezer/highlight tags (heading, strong, emphasis, link, monospace/code, quote, list, etc.) to the existing --hljs-*/--text/--link CSS variables (read via getComputedStyle or via fixed-per-theme cm- classes), and add syntaxHighlighting(thatStyle) to the extensions array. Recompute/reconfigure on lekha-theme-change so source colors follow theme switches.
  - Files: `SourceView.tsx`, `github.css`
- [ ] **[document-mgmt/M]** Restore the last open document on launch
  - WYSIWYG: WYSIWYG reopens the document(s) you had open when you last quit. Relaunching brings you straight back to your file with the cursor where you left it, so the app feels continuous across restarts.
  - Lekha: useStartup.ts restores theme, sidebar, recent files and lastFolder, and main/index.ts restores window bounds, but the document itself is never persisted or restored. editorStore.newFile() resets to a blank Untitled doc on every launch (INITIAL_STATE). Settings (shared/types.ts) has recentFiles/lastFolder/windowBounds but no lastDocument field, and openWindowAt() always loads a fresh blank renderer.
  - Change: Add a `lastDocumentPath: string | null` (and optionally per-window) to Settings. Persist the active editor path whenever it changes (extend the useStartup workspace subscriber or add an editorStore subscriber that calls setSettings). On startup in useStartup.ts, after restoring settings, if lastDocumentPath is non-null call fileOps.openPath(path) (silently ignore if the file is gone, mirroring the lastFolder restore). Most-recent recentFiles[0] is the simplest source if you don't want a new field.
  - Files: `useStartup.ts`, `types.ts`, `settings.ts`, `editorStore.ts`
- [ ] **[document-mgmt/M]** Handle macOS Open-With and double-click file open
  - WYSIWYG: Double-clicking a .md file in Finder, or using Open With > WYSIWYG, opens that file in WYSIWYG. On macOS this is delivered via the app 'open-file' event; WYSIWYG opens the file in a window.
  - Lekha: main/index.ts registers no app.on('open-file') handler and never inspects process.argv for a file path (grep confirms neither 'open-file' nor 'process.argv' appears). Launching Lekha by double-clicking a markdown file opens a blank Untitled window instead of the file.
  - Change: In main/index.ts add app.on('open-file', (e, path) => { e.preventDefault(); ... }). Before whenReady, queue paths; after a window exists, route them to a window via the existing IPC.openPath channel (the renderer already handles IPC.openPath at App.tsx:267). On Windows/Linux also parse the file path from process.argv on first launch. Ensure CFBundleDocumentTypes/file associations are declared in the electron-builder config.
  - Files: `index.ts`, `window.ts`
- [ ] **[inline-editing/S]** Add undoInputRule on Backspace to revert auto-formatting
  - WYSIWYG: After an auto-format fires (e.g. typing `# ` makes a heading, `- ` makes a bullet, `1. ` makes an ordered list, `> ` a blockquote), pressing Backspace immediately reverts the transform back to the literal typed characters instead of deleting content. This lets users escape an unwanted markdown trigger.
  - Lekha: keymap.ts has no Backspace binding and createState.ts wires `buildInputRules` but never adds `undoInputRule` from prosemirror-inputrules to any keymap. The inputRules plugin does NOT auto-bind Backspace, so pressing Backspace right after a rule fires just deletes a character; there is no way to get the literal markdown back.
  - Change: Import `undoInputRule` from 'prosemirror-inputrules' and add `Backspace: undoInputRule` (chained ahead of the base Backspace) to the bindings in keymapBindings. Because buildKeymap is registered before keymap(baseKeymap) in createState.ts, the chained undo will run first and fall through to default Backspace when there is no input rule to undo.
  - Files: `keymap.ts`
- [ ] **[inline-editing/S]** Make inline code mark non-inclusive and add caret-exit for trailing marks
  - WYSIWYG: After you type a closing inline-code delimiter (or bold/italic), the caret sits OUTSIDE the mark: typing more text is plain, not code/bold. Pressing the Right arrow past a closing delimiter likewise drops you out of the mark. You are never 'stuck' typing in code once you closed it.
  - Lekha: The `code` mark inherits ProseMirror's default `inclusive: true` (schema.ts only overrides parseDOM/toDOM and never sets `inclusive`). After the `` `x` `` input rule in inputRules.ts fires, markInputRule does removeStoredMark, but because the mark is inclusive, continuing to type at the boundary re-enters code formatting. There is no keymap handling to step the caret out of a trailing mark with ArrowRight.
  - Change: In schema.ts set `inclusive: false` on the `code` mark spec (and consider it for `strikethrough`/`highlight`/`sub`/`sup`/`link`) so the caret naturally leaves the mark at its right edge. Optionally add an ArrowRight handler that, when the caret is at the end of a text node carrying a non-inclusive mark, clears stored marks - but `inclusive:false` alone fixes the common 'stuck in code' complaint.
  - Files: `schema.ts`
- [ ] **[block-elements/S]** Add a hard line break on Shift-Enter
  - WYSIWYG: Pressing Shift+Enter inside a paragraph/heading/list item inserts a soft line break (a trailing-space or backslash break in the markdown, rendered as <br>), letting you wrap text within the same block without starting a new paragraph.
  - Lekha: keymap.ts binds Enter to the splitListItem chain (falling through to baseKeymap). There is NO Shift-Enter binding anywhere (verified pcBaseKeymap/macBaseKeymap only bind Mod-Enter=exitCode). The schema includes a hard_break node and the parser maps softbreak/hardbreak to it, but no command ever inserts one, so Shift+Enter just splits the block like Enter (or does nothing useful). Users cannot create an intra-block line break.
  - Change: In keymapBindings add a 'Shift-Enter' binding chaining exitCode (to escape code blocks) then a command that inserts schema.nodes.hard_break (e.g. chainCommands(exitCode, (state,dispatch)=>{dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView()); return true})). Mirror prosemirror-schema-basic's standard hard-break binding.
  - Files: `keymap.ts`
- [ ] **[find-replace/S]** Seed the find query from the current selection on open
  - WYSIWYG: When you press Cmd/Ctrl+F with text selected (or even the word under the cursor), WYSIWYG pre-fills the find field with that text and selects it, so you can immediately hit Enter to jump to the next occurrence.
  - Lekha: App.tsx onFind/onReplace just call setFindState({ open: true, mode }) and FindReplace keeps its own React state (query) untouched between opens (FindReplace.tsx:38). The find input is focused and select()'d (FindReplace.tsx:50-54) but never populated from the editor selection. The EditorView already exposes getSelectionText() (EditorView.tsx:498-503) but it is not used here.
  - Change: In App.tsx onFind/onReplace, read editorRef.current?.getSelectionText() and pass it down (e.g. add an `initialQuery` prop plus a `seq` key like the link/image dialogs use). In FindReplace, key the component on seq so it remounts, initialize useState(query) from initialQuery, and run setFind on mount so the match count and highlights appear immediately.
  - Files: `App.tsx`, `FindReplace.tsx`
- [ ] **[find-replace/S]** Scroll the current match into view as soon as the query is typed
  - WYSIWYG: As you type in WYSIWYG's find bar, the first match is highlighted AND the document scrolls to it immediately - you don't have to press Enter to see where the match is.
  - Lekha: Typing only calls setFind (FindReplace.tsx:57-64), which dispatches setFindQuery -> recomputes matches and sets current=0 (findHighlight.ts:100-109) but never moves the selection or scrolls. The view only scrolls when findNext/findPrev call _jumpToMatch (findHighlight.ts:222-242), i.e. after pressing Enter. So matches off-screen stay off-screen until the user hits Enter.
  - Change: After setFindQuery finds matches, jump/scroll to the current (index 0) match. Either call _jumpToMatch in setFindQuery when matches exist, or have FindReplace call a scroll helper after setFind. Keep editor focus in the find input (use scrollIntoView without stealing focus / without a full TextSelection if focus theft is a concern, or restore focus to the input afterward).
  - Files: `findHighlight.ts`, `FindReplace.tsx`
- [ ] **[images/S]** Constrain inline image size with max-width
  - WYSIWYG: Inline images are clamped to the content column width (max-width:100%) so a large photo never overflows the editor or pushes layout; images scale down responsively.
  - Lekha: There is no `.ProseMirror img` rule anywhere in global.css (grep for `ProseMirror img` / `img {` returns only the lightbox `.image-zoom-img`). Inline images therefore render at their intrinsic pixel size and a large pasted screenshot overflows the editor column and can introduce horizontal scrolling.
  - Change: Add a `.ProseMirror img { max-width: 100%; height: auto; }` rule (plus a sensible vertical rhythm / cursor) to global.css so inline images scale to the content width like WYSIWYG.
  - Files: `global.css`
- [ ] **[math-diagrams/S]** Add the `$$` keyboard gesture to create a block equation
  - WYSIWYG: Typing `$$` and pressing Enter (or space) on an empty line converts the line into a centered block-equation editor - the canonical, discoverable way to start display math without menus.
  - Lekha: inputRules.ts has only `mathInlineInputRule` (`/\$([^$\n]+)\$$/`) for inline math and explicitly avoids `$$`. There is NO input rule or keymap entry that turns `$$` into a `math_block`; block math is reachable only through the slash menu's 'Math Block' item. The markdown parser (math-plugin.ts) understands `$$` fences on load, but there is no live editing gesture.
  - Change: Add an InputRule in inputRules.ts that matches `^\$\$$` at the start of an empty paragraph and replaces the block with a `math_block` node (latex ''), then enters edit mode (pairs with finding 1). Register it in buildInputRules alongside mathInlineInputRule.
  - Files: `inputRules.ts`
- [ ] **[export-print/S]** Copy as HTML should produce an inline fragment, not a full standalone document
  - WYSIWYG: WYSIWYG's Edit > Copy as HTML (and Copy as HTML Code) writes a clean HTML body fragment to the clipboard so pasting into Word, Gmail, Notion, etc. yields properly styled inline content without a leaked <head>/<style>/<!DOCTYPE> block.
  - Lekha: copyAsHtml calls the SAME buildExportHtml(markdown, {title}) used for file export (src/renderer/hooks/useCommands.ts line ~367-376), which returns a complete <!DOCTYPE html> document with <head>, <title>, a giant inlined <style> blob (github.css + katex.css + hljs.css), and writes that whole thing to the clipboard as text/html. Many rich-text targets paste this poorly or strip styling because the markup isn't a body fragment.
  - Change: For copyAsHtml, call renderMarkdownBody(markdown) (already exported from buildHtml.ts) instead of buildExportHtml, optionally wrapping the body in a single styled <div> with the needed classes, and write that fragment as the html clipboard payload with markdown as the text fallback. The full-document path stays for file export.
  - Files: `useCommands.ts`
- [ ] **[shortcuts-palette/S]** Match WYSIWYG's heading shortcuts (Cmd+1..6 / Cmd+0), not Cmd+Alt+1..6
  - WYSIWYG: Headings are set with Cmd+1 through Cmd+6 (Ctrl+1..6 on Windows/Linux), and paragraph with Cmd+0. These are the single most-used formatting shortcuts and are muscle-memory for WYSIWYG users.
  - Lekha: keymap.ts binds headings to Mod-Alt-1..6 and paragraph to Mod-Alt-0 (lines 74-80); menu.ts and registry.ts advertise the same CmdOrCtrl+Alt+N accelerators. Plain Cmd+1..6 / Cmd+0 do nothing.
  - Change: In keymap.ts change the heading loop and paragraph binding from 'Mod-Alt-${level}'/'Mod-Alt-0' to 'Mod-${level}'/'Mod-0' (optionally keep the Mod-Alt aliases too by adding both keys to the bindings record). Update the accelerators in menu.ts (the [1..6] map at lines 253-261 and the Paragraph item at 261) and the shortcut hints in registry.ts (lines 58-64) to 'CmdOrCtrl+1' .. 'CmdOrCtrl+6' / 'CmdOrCtrl+0' and '⌘1'..'⌘6' / '⌘0'.
  - Files: `keymap.ts`, `menu.ts`, `registry.ts`

## MEDIUM (45)

- [ ] **[block-elements/L]** Auto-format a typed GFM pipe-table row into a real table
  - WYSIWYG: Typing a header row plus the separator line (e.g. `| a | b |` then `|---|---|`) auto-converts the text into a live editable table. WYSIWYG also offers menu/shortcut insert with a size picker.
  - Lekha: inputRules.ts has rules for headings, blockquote, lists, code fences, hr, marks, emoji, math - but NO table input rule. Tables can only be created via the slash menu's fixed 2x2 starter (slashMenu.ts makeStarterTable). Pasting/typing markdown table syntax inline is never recognized as you type.
  - Change: Add an InputRule in inputRules.ts that fires when the separator line (^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?$) is completed on the line below a pipe-delimited header, building a table node with the parsed column count and alignments (reuse makeStarterTable logic generalized to N columns).
  - Files: `inputRules.ts`, `slashMenu.ts`
- [ ] **[sidebar-filetree/L]** Support drag-and-drop to move files/folders within the tree
  - WYSIWYG: You can drag a file or folder onto another folder in the file tree to move it on disk; the tree updates in place.
  - Lekha: There is no drag-and-drop in the file tree (no `draggable`/`onDrop`/`dragStart` anywhere in src/renderer, and no fs:move IPC channel in ipc-channels.ts). Moving a file requires leaving the app for Finder/Explorer (only Reveal in Finder is offered). The only reorganization affordance is rename (which can't change the parent dir - renamePath is documented 'same parent').
  - Change: Add a `fs:movePath`-style IPC handler in main (move source into a target dir via fs.rename, with collision handling), expose it on window.lekha, then make FileTreeNode rows `draggable` with dragstart carrying the source path and drop handlers on directory rows (and the root) that call the move IPC + refreshTree. Reuse the active-file path-update logic already in handleRenameEntry for the open document.
  - Files: `FileTree.tsx`, `files.ts`, `fs-helpers.ts`, `ipc-channels.ts`, `App.tsx`
- [ ] **[find-replace/L]** Add whole-word and regex toggles
  - WYSIWYG: WYSIWYG's find bar has three toggles: case sensitivity (Aa), whole word (W / \b), and regex (.*). Regex find/replace (including capture-group substitution like $1) is a commonly used WYSIWYG feature.
  - Lekha: Only a case-sensitive toggle exists (FindReplace.tsx:146-155, state at :40). findMatches in find.ts:52-90 does a plain indexOf scan with optional toLowerCase - no word-boundary or regex support; FindOptions only has { caseSensitive } (find.ts:36-38).
  - Change: Extend FindOptions to { caseSensitive; wholeWord; regex }. In findMatches, when regex is on build a RegExp (escaping needle otherwise, applying \b...\b for wholeWord) and iterate matchAll per block instead of indexOf; guard against zero-length matches and invalid regex (show an error state in the bar). Add two more toggle buttons mirroring the Aa button and thread the new flags through setFind/replaceAll in FindReplace, EditorPane, EditorView, and findHighlight. For regex replace, support $1/$2 backreferences in replaceCurrent/replaceAllTr.
  - Files: `find.ts`, `findHighlight.ts`, `FindReplace.tsx`, `EditorPane.tsx`, `EditorView.tsx`
- [ ] **[images/L]** Support per-image width control (resize handles / width attribute)
  - WYSIWYG: WYSIWYG lets you set an image's display width - either by dragging resize handles or via the image context menu (e.g. 'Set Image Width' 25/50/100%) - and persists it by emitting an HTML width attribute or `{width=...}` so the size round-trips in the Markdown.
  - Lekha: The image node uses the unmodified prosemirror-markdown spec whose attrs are only {src, alt, title} (confirmed: schema.ts adds no image override; base spec attrs = src/alt/title). The serializer uses defaultMarkdownSerializer.nodes for images, and parser.ts:351 reads only src/title/alt. There is no width attribute, no resize UI, and no NodeView for images, so a user cannot resize an image at all.
  - Change: Override the image NodeSpec in schema.ts to add a `width` attr (parseDOM read from the <img width>/style, toDOM emit it); add an image NodeView with drag-to-resize handles (or at minimum a context-menu width preset); update the serializer to emit width (e.g. `<img src alt width=...>` or `![alt](src){width=...}`) and the parser to read it back.
  - Files: `schema.ts`, `serializer.ts`, `parser.ts`, `EditorView.tsx`
- [ ] **[document-mgmt/L]** Autosave untitled documents to recover unsaved work
  - WYSIWYG: WYSIWYG keeps unsaved/untitled buffers backed by an on-disk draft, so an unexpected quit or crash does not lose typing in a never-saved document; on relaunch the draft is restored.
  - Lekha: useAutoSave.ts explicitly bails when hasPath is false ('never auto-save untitled documents') and the on-blur flush has the same guard. A new document that has never been saved has no backing file and no draft, so a crash or a 'Don't Save' on quit loses all of it. The close guard (window.ts runCloseGuard) only prompts; it does not snapshot content.
  - Change: For untitled buffers, periodically persist the markdown to a draft store (e.g. a drafts file under app.getPath('userData') keyed by window id) instead of skipping autosave entirely. On startup, if an unsaved draft exists, restore it into the editor and mark dirty. Keep the real-file autosave path unchanged.
  - Files: `useAutoSave.ts`, `settings.ts`, `types.ts`, `useStartup.ts`
- [ ] **[inline-editing/M]** Auto-pair markdown delimiters around a selection
  - WYSIWYG: With text selected, typing `*`, `_`, `` ` ``, `(`, `[`, `{`, `"`, or `'` wraps the selection in that pair (e.g. select a word, press `*`, get `*word*`) rather than replacing it. This is the fastest way to emphasize existing text by keyboard.
  - Lekha: There is no auto-pairing logic anywhere in the editor (grep for pair/bracket/surround finds only comments). With a selection, typing a delimiter replaces the selected text with the single character, destroying the selection. Only post-hoc input rules (`*x*` etc.) exist, which require manually typing both delimiters around freshly typed text.
  - Change: Add a `handleTextInput` (or a keymap of the relevant characters) in a small new plugin or in createState.ts: when the selection is non-empty and the typed char is a known opener, dispatch a transaction inserting opener+selection+closer and keep the selection. Wire it as a ProseMirror prop on the view in EditorView.tsx (or as a Plugin in createState.ts).
  - Files: `createState.ts`, `inputRules.ts`
- [ ] **[inline-editing/M]** Auto-linkify a URL typed inline (not just pasted onto a selection)
  - WYSIWYG: Typing a bare URL (e.g. `https://example.com`) followed by a space or Enter automatically converts it into a clickable link. Selection-paste of a URL also links, but plain typed URLs are auto-detected too.
  - Lekha: smartPaste.ts only wraps a URL in a link when it is PASTED over a non-empty selection (handleSmartPaste requires `!empty`). inputRules.ts has rules for emphasis, code, math, emoji, etc., but no rule that detects a typed URL and applies the `link` mark. Typing a URL leaves it as plain text.
  - Change: Add an InputRule in inputRules.ts keyed on a URL-then-terminator pattern (e.g. /(https?:\/\/[^\s]+)(\s)$/) that applies `schema.marks.link` with `href` set to the matched URL over the matched range (re-inserting the trailing space). Reuse the existing single-URL validation from smartPaste.ts (isSingleUrl) for consistency.
  - Files: `inputRules.ts`
- [ ] **[inline-editing/M]** Add a paste-as-plain-text shortcut (Mod-Shift-V)
  - WYSIWYG: Cmd/Ctrl+Shift+V pastes the clipboard as unformatted plain text, stripping any HTML/markdown structure - the standard 'paste and match style' gesture.
  - Lekha: imagePaste.ts wires handlePaste (image -> smart URL -> default), and the default path runs ProseMirror's HTML-aware paste. There is no Mod-Shift-V binding (grep shows none) and no plain-text paste path, so users cannot force an unformatted paste; rich clipboard content always comes in formatted.
  - Change: Add a `Mod-Shift-v` keymap binding (in keymap.ts) or a handler that reads `text/plain` from the clipboard and inserts it as raw text via `view.dispatch(tr.insertText(...))`. Since keymap cannot read the clipboard synchronously, implement it as a `handleKeyDown` flag consulted by handlePaste, or use the clipboard API in a command.
  - Files: `keymap.ts`, `imagePaste.ts`
- [ ] **[inline-editing/M]** Bind Mod-K to insert/edit a link
  - WYSIWYG: Cmd/Ctrl+K opens the link insertion flow: with text selected it wraps the selection in a link, otherwise it lets you type the URL. It is the standard keyboard path to linking.
  - Lekha: Link insertion is dialog-driven via linkCommands.ts and routed through the menu/useCommands (editorCommands.ts comments confirm link is intentionally not in the command map). keymap.ts binds Mod-b/i/`/Shift-x and headings, but there is NO Mod-K binding, so there is no keyboard shortcut to create a link.
  - Change: Add a `Mod-k` binding that triggers the host's existing LinkDialog flow. Since linking is dialog-driven, the cleanest path is to surface a 'link' AppCommand through runCommand or dispatch a custom event the host listens for; wire the binding in keymap.ts to call into the same code path the menu uses.
  - Files: `keymap.ts`, `linkCommands.ts`
- [ ] **[block-elements/M]** Exit a code block by pressing Enter twice on a trailing blank line
  - WYSIWYG: In a code block, pressing Enter on an empty last line (or Enter twice at the end) drops you out of the code block into a new paragraph below. Mod-Enter also exits.
  - Lekha: keymap.ts binds Enter to splitListItem chain, then baseKeymap Enter = chainCommands(newlineInCode, ...). Inside a code_block, newlineInCode always succeeds and inserts a newline, so Enter NEVER exits the block. Only Mod-Enter (baseKeymap exitCode) escapes, which is undiscoverable. There is no double-Enter-to-exit gesture.
  - Change: Add an Enter handler (chained before baseKeymap) that detects a code_block whose cursor is at the end on an empty trailing line and runs exitCode instead of newlineInCode. Bind it in keymap.ts ahead of the list chain.
  - Files: `keymap.ts`
- [ ] **[block-elements/M]** Let Tab/Shift-Tab nest task-list items and keep checkbox state
  - WYSIWYG: Inside a task list, Tab indents the item into a nested sub-list (and Shift-Tab outdents), preserving its checkbox.
  - Lekha: keymap.ts uses sinkListItem(taskItemType)/liftListItem(taskItemType). But the schema's task_list content is '(task_item | list_item)+' and task_item content is 'block+' with no nested task_list allowed as a direct child in a way sinkListItem expects (sinkListItem wraps the item in a parent list of the same type; task_item has no inner list slot defined for nesting). Indenting a task item is likely to fail or produce an invalid structure because task_item lacks a nested-list content model the way list_item (paragraph block_list?) does.
  - Change: Verify task_item/task_list content expressions support nesting (task_item content should permit a trailing task_list, e.g. 'paragraph block*' that can contain task_list; task_list content already allows task_item). Adjust schema.ts so sinkListItem(taskItemType) yields a valid nested task_list, and test Tab indents a checkbox item under the previous one.
  - Files: `schema.ts`, `keymap.ts`
- [ ] **[typography/M]** Match WYSIWYG's loose-list paragraph spacing
  - WYSIWYG: In WYSIWYG, list ITEMS that contain block content (loose lists, or items with multiple paragraphs) keep vertical paragraph spacing, and there is a small gap (~4-6px) between sibling list items. Single-line items are tight, but multi-paragraph items breathe.
  - Lekha: github.css collapses ALL li > p margins to 0 unconditionally (lines 509-511, 'margin: 0'), and li margin is only 0.15em (line 504). This makes every list - including loose lists with multi-paragraph items - render as tightly packed lines with no separation between paragraphs inside an item or between loose items. A user pasting a loose list will see it visually flattened versus WYSIWYG.
  - Change: Keep single-line tightness but restore spacing for multi-paragraph items: only zero the margin when an li has a single child paragraph (e.g. li > p:only-child { margin: 0 }) and let li > p otherwise keep a small bottom margin (~0.5em). Alternatively detect loose lists and add li spacing. The exact mechanism depends on the schema, but the goal is non-zero spacing inside multi-block items.
  - Files: `github.css`
- [ ] **[sidebar-filetree/M]** Make folder-search results jump to the exact matched line, and clickable per-match
  - WYSIWYG: Clicking a specific search result opens the file and navigates to that exact occurrence/line; multiple matches in a file are individually navigable.
  - Lekha: FolderSearch renders one button per match (FolderSearch.tsx lines 136-149) but every match button calls the identical `onOpenResult(file.filePath, query, caseSensitive)` (line 141) - the `match.lineNumber` is shown but never passed through. App wires this to open-then-find which lands on the FIRST match in the document regardless of which line the user clicked. So clicking the 3rd match of a word still jumps to the 1st.
  - Change: Thread `match.lineNumber` (and ideally a match index) into onOpenResult / onOpenSearchResult so the consumer can advance the in-document find to the requested occurrence (e.g. run findNext N-1 times, or scroll to the line) instead of always landing on match #1.
  - Files: `FolderSearch.tsx`, `Sidebar.tsx`, `App.tsx`
- [ ] **[find-replace/M]** Add Find Next / Find Previous accelerators (Cmd+G / F3) usable when the bar is closed
  - WYSIWYG: After a search, WYSIWYG lets you repeat it with the bar closed (F3 / Shift+F3 on Windows, Cmd+G / Cmd+Shift+G on macOS), cycling matches without the find UI grabbing focus.
  - Lekha: The menu only defines Find (CmdOrCtrl+F) and Replace (CmdOrCtrl+Alt+F) (menu.ts:228-229). Enter/Shift+Enter only work while the find input is focused (FindReplace.tsx:108-123). There is no Find Next / Find Previous command, so once the bar is closed (clearFind also wipes the query, findHighlight.ts:212-216) the search cannot be repeated.
  - Change: Add 'Find Next' (CmdOrCtrl+G) and 'Find Previous' (CmdOrCtrl+Shift+G) menu items routed to new useMenuCommands handlers that call editorRef.current.findNext()/findPrev(). To make this work with the bar closed, stop clearing the query on close (only clear decorations when the user explicitly dismisses, or keep query state and just hide the overlay) so the highlight plugin still has matches to cycle.
  - Files: `menu.ts`, `App.tsx`, `FindReplace.tsx`
- [ ] **[images/M]** Expose title field and edit-existing-image flow in the Image dialog
  - WYSIWYG: Selecting an existing image and re-opening the image dialog lets you edit src, alt and the image title/tooltip; the title round-trips as `![alt](src "title")`.
  - Lekha: ImageDialog.tsx accepts an `initial.title` (ImageDialogInitial has title) and the schema/serializer fully support a title, but the dialog renders only URL and Alt inputs - there is no title field, and confirm() only submits {src, alt} (ImageDialog.tsx:59-61), dropping title entirely. App.tsx:529 likewise calls insertImage with only {src, alt}. There is also no path to open the dialog pre-filled from an already-inserted image (clicking an image opens the zoom lightbox instead), so users cannot edit an existing image's src/alt.
  - Change: Add a Title input to ImageDialog (it already imports the title type), include title in the ImageSubmit payload and confirm(), and pass it through in App.tsx insertImage. Additionally provide a way to edit an existing image (e.g. a toolbar/context action or alt-click) that opens ImageDialog seeded from the selected image node's attrs.
  - Files: `ImageDialog.tsx`, `App.tsx`
- [ ] **[math-diagrams/M]** Surface KaTeX parse errors as readable messages, not raw red LaTeX
  - WYSIWYG: On invalid LaTeX, WYSIWYG shows the source in red with KaTeX's specific error message (e.g. "Undefined control sequence: \foo") so you know what to fix.
  - Lekha: renderKatex() calls `renderToString(latex, { throwOnError: false, strict: 'ignore' })`. With throwOnError:false KaTeX emits its own error span (`.katex-error`, styled red in github.css line 986) but renders the *parsed-as-far-as-possible* output with the offending token in red and NO textual reason. The actual error message string from KaTeX is never captured or shown (the try/catch around renderToString can't fire because throwOnError is false). The user sees red glyphs but no explanation.
  - Change: Render with a two-pass approach: keep throwOnError:false for display, but additionally run a check (e.g. catch the ParseError by calling `katex.renderToString(latex, { throwOnError: true })` in a try/catch, or use `katex.__parse`) and when it throws, append the `error.message` as a small `.math-error` caption below/after the rendered output, mirroring the existing `.diagram-error` box for mermaid.
  - Files: `mathNodeView.ts`, `github.css`
- [ ] **[math-diagrams/M]** Provide a visible click-to-edit affordance and keyboard entry into math source
  - WYSIWYG: Hovering/clicking rendered math gives a clear cue it is editable; selecting it and pressing Enter opens the source.
  - Lekha: math-inline/.math-block CSS sets `cursor: pointer` and `user-select: none`, and clicking renderContainer enters edit. But (a) there is no hover highlight to signal editability, and (b) there is no keyboard path: selecting the node as a NodeSelection (e.g. arrow-selecting it) does NOT enter edit mode - the NodeView has no `selectNode()` handler, and handleKeydown only runs once the inner input is already focused. So keyboard-only users cannot open a rendered equation; they must mouse-click it.
  - Change: Add `selectNode()` to the math NodeView that calls enterEditMode() (so arrowing onto the node + it being selected reveals the source), and add an Enter keybinding/handler when a math NodeSelection is active. Add a `:hover` background/outline rule for `span.math-inline`/`div.math-block` to signal clickability.
  - Files: `mathNodeView.ts`, `github.css`
- [ ] **[export-print/M]** Export should honor the active editor theme instead of hardcoding GitHub
  - WYSIWYG: WYSIWYG exports/prints using the currently selected theme's CSS (Night, GitHub, Newsprint, etc.), so the exported HTML/PDF visually matches what the user sees in the editor. Themes can also be picked per-export.
  - Lekha: buildExportHtml always inlines github.css unconditionally (src/renderer/export/buildHtml.ts: `import githubCss from '../styles/themes/github.css?raw'` and cssBlob = [githubCss, katexCss, hljsCss]). The app ships 7 themes (github, night, nord, sepia, solarized-dark, solarized-light, graphite in src/renderer/styles/themes/) but a user editing in Night or Sepia still gets a white GitHub-styled export, which is a visible mismatch.
  - Change: Read the active theme id from the editor store, import all theme CSS via import.meta.glob('../styles/themes/*.css', {query:'?raw'}) (or a static map), and select the matching theme string for cssBlob in buildDocument. Pass the theme id through BuildHtmlOptions from useCommands so HTML/PDF/Copy-as-HTML all use it.
  - Files: `buildHtml.ts`, `useCommands.ts`
- [ ] **[export-print/M]** Expose PDF page options (size, margins, orientation)
  - WYSIWYG: WYSIWYG's PDF export (via the print dialog / export settings) lets the user choose paper size (A4/Letter/etc.), orientation, and margins, and remembers preferences.
  - Lekha: exportPdf hardcodes printToPDF({ printBackground:true, pageSize:'A4', margins:{marginType:'default'} }) (src/main/ipc/export.ts lines ~236-240). No way to pick Letter, Legal, landscape, or custom/zero margins. US users in particular get A4 with no override.
  - Change: Add an options object to the exportPdf IPC payload (pageSize, landscape, marginType) plumbed through preload (src/preload/index.ts + api.d.ts). Either add a small pre-export options dialog or read persisted settings, then pass them into printToPDF. Default to the user's locale paper size (Letter for en-US).
  - Files: `export.ts`, `index.ts`, `api.d.ts`, `useCommands.ts`
- [ ] **[shortcuts-palette/M]** Expose insert-table / math-block / diagram / footnote as commands in the palette and menu
  - WYSIWYG: WYSIWYG's Paragraph and Format menus include Table (Cmd+Option+T), Math Block (Cmd+Option+B), and footnote insertion, and these are reachable via menu/shortcut, not only by typing markdown.
  - Lekha: The slash menu (slashMenu.ts SLASH_ITEMS, lines 57-71) can insert table, mathBlock, diagram, and image, but AppCommand (commands.ts) has no ids for table/math/diagram/footnote, so they are absent from registry.ts (the command palette) and menu.ts. A user who opens Cmd+Shift+P and types 'table' or 'math' finds nothing; these are only reachable by typing '/' in an empty paragraph.
  - Change: Add 'insertTable' | 'insertMathBlock' | 'insertDiagram' (and optionally 'insertFootnote') to the AppCommand union in commands.ts. Wire them through useCommands/EditorView to the same insertBlock paths the slash menu uses (insertBlock in slashMenu.ts already implements table/mathBlock/diagram). Add CommandDef entries in registry.ts (group 'Format' or new 'Insert') and menu items in menu.ts Format submenu so they appear in both the palette and native menu.
  - Files: `commands.ts`, `registry.ts`, `menu.ts`, `slashMenu.ts`
- [ ] **[shortcuts-palette/M]** Add a keyboard shortcut to exit a code block / fenced block (Escape or Cmd+Enter)
  - WYSIWYG: From inside a fenced code block, pressing the down arrow at the last line or Cmd+Enter/Escape moves the caret out into a new paragraph below, so the user is never trapped. WYSIWYG also lets a trailing Enter on an empty last line break out.
  - Lekha: createState.ts wires buildKeymap then baseKeymap (lines 48-49); neither defines an Escape or Mod-Enter handler that exits a code_block, and code_block is a plain textblock with no NodeView keyboard escape (only mathNodeView handles Escape, mathNodeView.ts line 245). Once the caret is in a code block at the end of the document, there is no keyboard way to create a paragraph after it.
  - Change: Add an 'Escape' (and/or 'Mod-Enter') binding in keymap.ts whose command checks if the cursor is in a code_block and, if so, inserts a paragraph after the block and moves the selection there (resolve the block's after-position, insert schema.nodes.paragraph, setSelection). Guard it so it only fires inside code_block, returning false otherwise so Escape still closes the slash menu and other consumers.
  - Files: `keymap.ts`
- [ ] **[shortcuts-palette/M]** Add commands/shortcuts for highlight, superscript, subscript marks
  - WYSIWYG: WYSIWYG supports highlight (==text==), superscript (^text^), and subscript (~text~) and exposes them in the Format menu; highlight also has a configurable shortcut in many builds.
  - Lekha: The schema defines highlight/subscript/superscript marks (schema.ts lines 106-123, 326-331) and inputRules.ts creates them via typed markdown (lines 243-249), but there is no toggle command for any of them: editorCommandMap (editorCommands.ts) only builds bold/italic/strikethrough/inlineCode, and they appear nowhere in commands.ts, registry.ts, or menu.ts. A user can only apply them by typing the raw markers, never via menu, palette, or shortcut.
  - Change: Add toggleMark commands for highlight/superscript/subscript to editorCommandMap (editorCommands.ts, alongside the existing inline marks at lines 119-122), add 'highlight' | 'superscript' | 'subscript' to the AppCommand union (commands.ts), surface them in registry.ts (Format group) and the Format submenu of menu.ts, and optionally bind highlight to a shortcut (e.g. Mod-Shift-h) in keymap.ts.
  - Files: `editorCommands.ts`, `commands.ts`, `registry.ts`, `menu.ts`, `keymap.ts`
- [ ] **[micro-interactions/M]** Surface Focus/Typewriter mode state in the status bar
  - WYSIWYG: WYSIWYG reflects active editing modes in its chrome - Focus Mode and Typewriter Mode are toggles whose on/off state is discoverable (menu checkmarks plus the visible dimming), and users can flip them without remembering a function key.
  - Lekha: focusMode/typewriterMode live in editorStore and are only reachable via F8/F9 or the command palette (registry.ts entries 'Focus Mode'/'Typewriter Mode'). The StatusBar (StatusBar.tsx) only renders word/char counts and the mode button - it has no indicator or clickable control for focus or typewriter mode, so the state is invisible unless the dimming happens to be noticeable.
  - Change: Add two small toggle buttons (or status indicators) to StatusBar that read focusMode/typewriterMode from the store and dispatch toggleFocusMode/toggleTypewriterMode, mirroring the existing onToggleSource wiring. Give them active styling when on, plus title tooltips with the F8/F9 shortcuts.
  - Files: `StatusBar.tsx`, `global.css`, `github.css`
- [ ] **[micro-interactions/M]** Differentiate the dirty indicator from the auto-save state
  - WYSIWYG: WYSIWYG's title bar shows an unsaved-changes marker, and because edits are written to disk it does not leave files perpetually 'dirty'; the chrome accurately reflects whether on-disk state matches the buffer.
  - Lekha: TitleBar.tsx shows a bullet '•' whenever isDirty is true. App.tsx's handleChange sets isDirty on every keystroke, while useAutoSave silently writes after idle. Because there is no UI feedback when the auto-save fires, the dot can linger or flicker and the user gets no 'Saving…/Saved' confirmation - the auto-save (a WYSIWYG-defining behavior) is completely invisible.
  - Change: Add a transient auto-save indicator: when useAutoSave triggers a successful save, briefly show 'Saved' (or a check) in the status bar or title bar, then fade. Drive it from the autoSave flow in App.tsx (autoSaveFn) and a small store flag, so the dirty dot clears and a momentary 'Saved' confirmation appears.
  - Files: `TitleBar.tsx`, `StatusBar.tsx`, `App.tsx`, `useAutoSave.ts`
- [ ] **[block-elements/S]** Indent code-block lines with Tab instead of leaving the block
  - WYSIWYG: Inside a fenced code block, Tab inserts indentation (spaces/tab) into the code rather than moving focus, matching a code editor.
  - Lekha: keymap.ts tabCmd is chainCommands(goToNextCell(-1/1), sinkListItem, sinkListItem). Inside a code_block none of these apply (not in a table, not a list item), so all return false and Tab does its default browser/PM behavior (moves focus / no indentation). There is no code-block-aware Tab handler.
  - Change: Prepend a command to tabCmd (and Shift-Tab) that, when the cursor is in a code_block, inserts a tab/spaces (and dedents on Shift-Tab) and returns true; otherwise returns false so the existing chain runs. Gate on state.selection.$head.parent.type === schema.nodes.code_block.
  - Files: `keymap.ts`
- [ ] **[typography/S]** Make headings bold (700) to match WYSIWYG's weight
  - WYSIWYG: In WYSIWYG's default GitHub theme every heading h1-h6 uses font-weight: bold (700). h1 is ~2em and h2 ~1.5em, both heavy. The headings read as clearly heavier than body text, which is the dominant visual cue of WYSIWYG's hierarchy.
  - Lekha: github.css sets the shared heading rule to font-weight: 600, then explicitly OVERRIDES h1 and h2 down to font-weight: 500 (lines 426-438). So Lekha's two most prominent headings are semibold-to-medium, noticeably lighter and airier than WYSIWYG. The comment even calls this an intentional 'elegant, airy title' deviation.
  - Change: Set the shared h1-h6 rule to font-weight: 700 (or keep 600 for h3-h6 but raise h1/h2). Remove the font-weight: 500 overrides on h1 (line 427) and h2 (line 435). If the airy look is desired as a Graphite-only flourish, scope the 500 weight under [data-theme="graphite"] instead of the default theme.
  - Files: `github.css`
- [ ] **[sidebar-filetree/S]** Show the open folder name as the Files panel header
  - WYSIWYG: The file-tree panel header shows the name of the currently open root folder (the workspace), so you know which folder you are browsing.
  - Lekha: Sidebar.tsx always renders a static uppercase label `'Files'` (lines 69-74) regardless of which folder is open. The `rootFolder` is read in the store but never surfaced in the header. With multiple windows/folders the user cannot tell which workspace this sidebar belongs to.
  - Change: When sidebarTab === 'files' and rootFolder is set, render the folder's basename (e.g. `rootFolder.replace(/.*[\/\\]/, '')`) as the header instead of the literal 'Files'. Fall back to 'Files' when no folder is open.
  - Files: `Sidebar.tsx`
- [ ] **[sidebar-filetree/S]** Add a Collapse All / expand-all control to the file tree
  - WYSIWYG: The file tree offers a collapse-all action (and folders can be quickly folded), useful for large workspaces.
  - Lekha: No collapse-all exists anywhere (confirmed: no `collapseAll`/`expandAll` in src/renderer). The only way to collapse folders is to click each disclosure arrow individually. In a deep workspace this is tedious.
  - Change: Once expansion state is lifted to a Set (finding 1), add a small toolbar/icon button in the Files panel header (or the sidebar header row) that clears the expandedPaths set (Collapse All). Optionally a second button to expand all.
  - Files: `FileTree.tsx`, `Sidebar.tsx`
- [ ] **[outline/S]** Auto-scroll the outline panel to keep the active heading in view
  - WYSIWYG: When the active heading moves outside the visible region of a long outline, WYSIWYG scrolls the outline panel so the current heading stays visible.
  - Lekha: The outline panel (.outline in global.css) is a plain scrollable list with no programmatic scrolling; even hypothetically, with no active-heading concept (see above) nothing brings the current heading into view. A long document leaves the user manually scrolling the outline to find their place.
  - Change: Once active-heading tracking exists, give the active OutlineNodeRow item a ref and call ref.scrollIntoView({ block: 'nearest' }) inside a useEffect keyed on activeHeadingPos so the panel keeps the current heading visible without yanking on every minor change.
  - Files: `Outline.tsx`
- [ ] **[outline/S]** Scroll clicked heading to the top instead of centering, and don't move the cursor/steal focus
  - WYSIWYG: Clicking an outline entry scrolls that heading to (near) the top of the editor so its whole section is visible below. The click is a navigation gesture; it does not place the text caret mid-document or change the selection.
  - Lekha: scrollToPos (EditorView.tsx ~line 408) does `view.state.tr.setSelection(TextSelection.near(...)).scrollIntoView()` then `view.focus()`. ProseMirror's scrollIntoView only scrolls the position just barely into view (often leaving the heading near the bottom or center, not pinned to top), and the call also sets a text selection at the heading and focuses the editor - so a navigation click silently relocates the user's caret.
  - Change: Resolve the heading's DOM node via view.domAtPos(safePos) (or view.nodeDOM) and call element.scrollIntoView({ behavior: 'smooth', block: 'start' }) against the editor scroll container, matching the jumpToFootnoteDefinition pattern already in this file (~line 120). Avoid setting the selection/focus unless you intend to (or restore the prior selection), so clicking the outline navigates without disturbing the edit cursor.
  - Files: `EditorView.tsx`
- [ ] **[outline/S]** Reset collapsed outline state when the active document changes
  - WYSIWYG: Each document's outline collapse state is per-document; opening a different file shows that file's outline freshly (not collapsed by stale positions from the previous file).
  - Lekha: Outline.tsx tracks collapsed nodes in `useState<Set<number>>` keyed purely by heading `pos`. The Outline component is never remounted on file switch (Sidebar renders <Outline items={outline} .../> with no key tied to the document path), so the collapsed Set persists across documents. Since pos values from the old document can coincide with positions of unrelated headings in the new document, opening another file can leave arbitrary sections collapsed.
  - Change: Reset/forget collapse state on document change: either pass the active path as a `key` to <Outline> in Sidebar.tsx so it remounts per file, or clear the collapsed Set in a useEffect keyed on the document path/identity inside Outline.tsx.
  - Files: `Outline.tsx`, `Sidebar.tsx`
- [ ] **[math-diagrams/S]** Inline math: live preview while editing (currently only block math previews)
  - WYSIWYG: While editing inline math, WYSIWYG renders the formula live as you type, right where it sits.
  - Lekha: In makeMathNodeView, a live `blockPreview` div (renderKatex on every input) exists ONLY for the block case (`if (isBlock) { blockPreview = ... }`). For inline math the edit state shows just a bare `<input>` (math-source) with no rendered preview - you only see the result after Enter/blur exits edit mode. handleInput updates blockPreview only when it exists, so inline editors give zero visual feedback.
  - Change: Give inline math a small inline live-render element too: create a `math-preview` span next to the inline input in editContainer, and in handleInput call renderKatex on it (displayMode:false). Keep it visually compact (e.g. show the rendered result trailing the input).
  - Files: `mathNodeView.ts`, `github.css`
- [ ] **[math-diagrams/S]** Debounce KaTeX re-render on keystroke (mermaid is debounced, math is not)
  - WYSIWYG: WYSIWYG re-renders math smoothly while typing without visible flicker on each keystroke.
  - Lekha: codeBlockNodeView.ts debounces diagram renders at 250ms (scheduleRender). But mathNodeView's handleInput calls `renderKatex(blockPreview, latex, true)` synchronously on EVERY keystroke, and renderKatex first does setPlaceholder('Loading math...') then an async import resolution and innerHTML swap. On fast typing the block preview flickers between the 'Loading math...'/'...' placeholder and rendered output on each character.
  - Change: Debounce the preview re-render in handleInput (e.g. 120-200ms timeout, same pattern as scheduleRender in codeBlockNodeView), and skip the setPlaceholder('Loading math...') swap once KaTeX is already loaded (track a `katexReady` flag so cached re-renders are synchronous and never show the loading placeholder).
  - Files: `mathNodeView.ts`
- [ ] **[export-print/S]** Add a print/PDF stylesheet for page breaks and clean pagination
  - WYSIWYG: WYSIWYG supports CSS page-break control in exports (e.g. headings not orphaned, code blocks and tables avoiding awkward splits, and the theme's @media print rules) so multi-page PDFs paginate cleanly.
  - Lekha: The export document CSS in buildHtml.ts buildDocument() has no @media print rules and no page-break-inside/break-inside declarations; a grep finds no @media print anywhere in src. Long code blocks, tables, and images split across PDF page boundaries with no control, and headings can be orphaned at the bottom of a page.
  - Change: In buildDocument(), add print CSS: `pre, table, blockquote, .mermaid-diagram, img { break-inside: avoid; } h1,h2,h3,h4 { break-after: avoid; }` and an @media print block. This applies to both PDF (offscreen printToPDF) and any future Print command.
  - Files: `buildHtml.ts`
- [ ] **[export-print/S]** Surface export failures to the user instead of only console.error
  - WYSIWYG: WYSIWYG shows a visible dialog/notification when an export fails (e.g. Pandoc missing, write error), telling the user what went wrong and how to fix it.
  - Lekha: The exportPandoc handler throws user-friendly Errors (e.g. 'Pandoc is not installed…' in src/main/ipc/export.ts), but every renderer caller in useCommands.ts only does `.catch(err => console.error(...))` (lines ~308, 321, 340, 354, 374). The thrown message never reaches the UI, and the comment in useCommands claims 'the main process shows its own error dialogs' which is not true - no dialog.showMessageBox is called on failure. A user without pandoc clicks 'Export to Word' and nothing happens.
  - Change: Either show a dialog.showErrorBox/showMessageBox in the main handlers on failure, or propagate the rejection to the renderer and surface a toast/notification there. At minimum, present the pandoc-missing message visibly.
  - Files: `export.ts`, `useCommands.ts`
- [ ] **[themes/S]** Remove the h1/h2 underline rules on dark/non-GitHub themes
  - WYSIWYG: Only WYSIWYG's GitHub theme draws a hairline border-bottom under h1/h2. WYSIWYG's Night, Newsprint, Pixyll, etc. themes have NO heading underlines - headings are just larger/bolder text.
  - Lekha: github.css unconditionally applies border-bottom: 1px solid var(--border-light); padding-bottom: 0.3em to h1 and h2 (lines 425-438). None of the dark/alt themes (graphite.css, night.css, nord.css, solarized-dark.css) override this, so every theme - including 'Graphite', explicitly described as a faithful WYSIWYG Night clone - shows GitHub-style underlined h1/h2, which WYSIWYG Night does not.
  - Change: Move the h1/h2 border-bottom + padding-bottom out of the universal heading rules into a GitHub-scoped selector (e.g. :root:not([data-theme]) ... or html:not([data-theme]) .ProseMirror h1), OR add border-bottom: none; padding-bottom: 0 overrides in graphite.css/night.css (and decide intentionally for nord/solarized). At minimum, drop the underline in graphite.css so it matches WYSIWYG Night.
  - Files: `github.css`, `graphite.css`, `night.css`
- [ ] **[themes/S]** Set a theme-matched window backgroundColor to kill the white launch flash in dark themes
  - WYSIWYG: WYSIWYG paints its window background to the theme color, so launching in a dark theme shows a dark window immediately with no white flash.
  - Lekha: createWindow() in window.ts constructs the BrowserWindow with no backgroundColor (grep finds none), so the window paints default white until the renderer mounts and applyTheme runs. A user whose saved theme is night/graphite/nord/solarized-dark gets a jarring white flash on every launch and on every new window.
  - Change: Read the persisted theme from settings before creating the window and pass backgroundColor matching that theme's --bg (e.g. '#1e1e1e' for night, '#363b40' for graphite, '#ffffff' for github). Alternatively keep a small id->bg map. Also call nativeTheme.themeSource = 'dark'|'light' so the native titlebar/traffic-light region matches.
  - Files: `window.ts`
- [ ] **[themes/S]** Sync macOS native chrome (titlebar / traffic lights / context menus) to dark themes
  - WYSIWYG: When a dark theme is active, WYSIWYG's window chrome and native menus render in dark mode on macOS.
  - Lekha: The window uses titleBarStyle: 'hiddenInset' but nativeTheme.themeSource is never set (grep for nativeTheme/themeSource returns nothing). With an in-app dark theme, the macOS title-bar inset region, native right-click/context menus, and form-control rendering stay light, clashing with the dark editor surface.
  - Change: On startup and whenever the theme changes via the Themes menu / Preferences, set nativeTheme.themeSource to 'dark' for dark theme ids (night, graphite, nord, solarized-dark) and 'light' otherwise (and 'system' for the new auto theme). Drive this from the existing setTheme IPC path so it stays in sync with the renderer.
  - Files: `window.ts`, `menu.ts`
- [ ] **[themes/S]** Theme the source-mode caret, active-line, and gutter selection; widen ::selection beyond .ProseMirror
  - WYSIWYG: WYSIWYG's editor selection, active line, and caret all respect the theme in both rendered and source views.
  - Lekha: The editor ::selection rule is scoped only to .editor-pane .ProseMirror ::selection (github.css line 400), so CodeMirror source-mode text uses the browser-default selection color (light blue) on dark themes, which is harsh on night/graphite/nord/solarized-dark. Source mode also has no active-line highlight and only a --text caret; there is no themed .cm-selectionBackground / .cm-activeLine styling.
  - Change: Add CodeMirror selection/active-line theming in github.css section 11 (or via an EditorView.theme in SourceView): style .cm-editor .cm-selectionBackground and ::selection to var(--selection), and optionally .cm-activeLine to a faint var(--surface)/tint. This makes source-mode selection match the rendered-mode selection across all themes.
  - Files: `github.css`, `SourceView.tsx`
- [ ] **[shortcuts-palette/S]** Add indent / outdent shortcuts (Cmd+] / Cmd+[)
  - WYSIWYG: Cmd+] indents (sinks a list item or adds blockquote/indent nesting) and Cmd+[ outdents, working anywhere in the document, not only via Tab inside a list.
  - Lekha: keymap.ts only handles Tab / Shift-Tab, and those are chained through goToNextCell then sinkListItem/liftListItem (lines 44-53, 69-70). There is no Mod-] / Mod-[ binding at all, so users who press Cmd+] (WYSIWYG muscle memory) get nothing, and indenting requires Tab which also competes with focus traversal expectations.
  - Change: In keymap.ts add 'Mod-]': chainCommands(sinkListItem(listItemType), sinkListItem(taskItemType)) and 'Mod-[': chainCommands(liftListItem(listItemType), liftListItem(taskItemType)) to the bindings record (reuse the existing list item types already resolved at lines 33-34).
  - Files: `keymap.ts`
- [ ] **[shortcuts-palette/S]** Give block-formatting commands keyboard shortcuts (quote, code block, lists)
  - WYSIWYG: WYSIWYG binds the common block conversions: Cmd+Shift+K = code block, Cmd+Shift+Q = blockquote, Cmd+Shift+] = ordered list, Cmd+Shift+[ = unordered list (Ctrl+Shift on Windows). These appear next to the items in WYSIWYG's Paragraph menu.
  - Lekha: editorCommandMap exposes blockquote/codeBlock/bulletList/orderedList/taskList commands (editorCommands.ts lines 151-176) and menu.ts lists them (lines 263-268), but every one has accelerator 'undefined' and none are bound in keymap.ts. The only way to trigger them by keyboard is the slash menu or command palette.
  - Change: Add bindings in keymap.ts for the block commands already in cmds: 'Mod-Shift-q': cmds.blockquote, 'Mod-Shift-k': cmds.codeBlock, 'Mod-Shift-]': cmds.orderedList, 'Mod-Shift-[': cmds.bulletList (pick mappings that don't collide with Mod-] indent above; if collision, use WYSIWYG's exact set). Mirror the accelerators in menu.ts (lines 263-268) and the shortcut hints in registry.ts (lines 65-69).
  - Files: `keymap.ts`, `menu.ts`, `registry.ts`
- [ ] **[micro-interactions/S]** Add an empty-document placeholder prompt
  - WYSIWYG: When a document is empty, WYSIWYG shows a faint, centered placeholder hint in the editor body (e.g. 'Write something...'/'Type here...') that disappears the moment you type. New/empty files never look like a blank void.
  - Lekha: EditorPane has no ProseMirror placeholder decoration at all (grep for placeholder/is-empty in the editor finds only math-placeholder and diagram-placeholder, never an empty-doc prompt). On a new file (handleNewFile creates 'Untitled.md' then opens it) or after clearing a template, the editor body is completely blank with no guidance and only a blinking caret.
  - Change: Add a small ProseMirror plugin (e.g. src/renderer/editor/plugins/placeholder.ts) that, when doc.childCount === 1 and the only child is an empty paragraph, adds a widget/node decoration carrying a data-placeholder string; style it via CSS (.ProseMirror .is-empty::before { content: attr(data-placeholder); color: var(--color-text-muted); }). Register it in createState.ts. Use copy like 'Start writing…'.
  - Files: `placeholder.ts`, `createState.ts`, `github.css`
- [ ] **[micro-interactions/S]** Label the source-mode toggle by the action, not the current state
  - WYSIWYG: WYSIWYG's source/preview toggle and menu items name the action you will perform ('Source Code Mode' enters source; you switch back via the same labeled control), so the button text never reads as a redundant status echo of where you already are.
  - Lekha: StatusBar.tsx line 59 renders the button as `mode === 'wysiwyg' ? 'WYSIWYG' : 'Source'` - it shows the mode you are CURRENTLY in. In WYSIWYG the button literally says 'WYSIWYG', so a user reads it as a label rather than as 'click to switch to Source'. There is no tooltip and no aria-label on the button either.
  - Change: Show the target action instead: in wysiwyg render 'Source' (and title='Switch to source view'), in source render 'WYSIWYG' (title='Switch to WYSIWYG'). Add an aria-label matching the title. Optionally prefix with an icon so it reads as a control.
  - Files: `StatusBar.tsx`
- [ ] **[document-mgmt/S]** Enforce single-instance and route second-launch file opens
  - WYSIWYG: Opening additional files while WYSIWYG is running reuses the existing process (a new window in the same instance) rather than spawning a separate, state-unaware app instance.
  - Lekha: There is no app.requestSingleInstanceLock / 'second-instance' handling (grep confirms). Each OS launch starts a fresh Electron process with its own settings load, so a second launch (e.g. opening a file from Finder while Lekha runs) can race the settings.json writes from the first instance and won't route the file into the running app.
  - Change: At the top of main/index.ts call app.requestSingleInstanceLock(); if it returns false, app.quit(). Register app.on('second-instance', (_e, argv) => { ... }) to focus an existing window (or openNewWindow) and route any file path in argv through IPC.openPath. This also makes the macOS open-file routing and bounds/settings persistence consistent across launches.
  - Files: `index.ts`
- [ ] **[document-mgmt/S]** Prune or flag missing recent files and surface open errors
  - WYSIWYG: WYSIWYG's Open Recent skips/greys files that no longer exist and removes dead entries; clicking a recent file that is gone does not throw an unhandled error.
  - Lekha: settings.addRecentFile/getRecentFiles (settings.ts) never check existence, and buildOpenRecentSubmenu (menu.ts) lists every stored path as an enabled item. When a recent item is clicked, the menu sends IPC.openPath which App.tsx:267 handles with a bare `void fileOps.openPath(path)` (no try/catch), so a deleted file rejects with an uncaught error rather than a clean message; only the sidebar/keyboard paths (App.tsx:352-365) wrap openPath in window.alert.
  - Change: In getRecentFiles (or when building the menu), stat each path and drop non-existent ones from the persisted list. Wrap the IPC.openPath handler in App.tsx in the same try/catch + window.alert (or a toast) used by the other open call sites, and on a read failure remove the path from recents. Optionally add a 'Clear Recent Files' menu item (WYSIWYG has one).
  - Files: `settings.ts`, `menu.ts`, `App.tsx`

## LOW (28)

- [ ] **[export-print/L]** Embed images/relative resources in exported HTML so it is truly self-contained
  - WYSIWYG: WYSIWYG's exported HTML can embed local images as base64 data URIs so the single .html file renders anywhere with no missing-image placeholders.
  - Lekha: buildHtml.ts inlines all CSS and renders mermaid/KaTeX inline, but local image references (e.g. ![](./img/foo.png) or relative file paths in an opened doc) are passed through as-is by markdown-it. The exported .html is moved/emailed without those files and images break. The header comment claims the file is 'truly self-contained' but that only covers CSS, not images.
  - Change: Before rendering (or in a post-process pass over <img src>), resolve relative/local image paths against the document directory, read the bytes via a main-process IPC, and inline them as data: URIs in the exported HTML/PDF body. Skip remote http(s) srcs.
  - Files: `buildHtml.ts`, `useCommands.ts`, `export.ts`
- [ ] **[block-elements/M]** Offer a size picker (or grid) when inserting a table
  - WYSIWYG: The Table insert flow lets you choose rows x columns (drag-grid or a small dialog) so you get the table you want immediately.
  - Lekha: slashMenu.ts insertBlock('table') always inserts a fixed 2x2 starter via makeStarterTable() with no size choice. The only way to grow it is repeated addRow/addColumn from the toolbar.
  - Change: When the Table slash item is chosen, open a small rows/columns picker (reuse the existing dialog pattern used for Link/Image) and build the table at the requested size; generalize makeStarterTable to accept (rows, cols).
  - Files: `slashMenu.ts`, `EditorView.tsx`
- [ ] **[block-elements/M]** Convert an empty heading/quote back to a paragraph on Backspace
  - WYSIWYG: Pressing Backspace at the very start of an empty heading or an empty blockquote line converts it back to a plain paragraph (or lifts out of the quote) rather than joining with the previous block.
  - Lekha: Only baseKeymap's generic backspace (joinBackward) runs - there is no setBlockType-to-paragraph or liftEmptyBlock-style handling tuned for headings/blockquotes. Backspace at start of an empty heading joins it into the previous block instead of demoting it to a paragraph, which is the common WYSIWYG gesture to undo an accidental heading.
  - Change: Add a Backspace handler (chained before baseKeymap) that, when the cursor is at offset 0 of an empty heading, runs setBlockType(paragraph); and when at the start of a blockquote's first empty block, runs lift. Bind in keymap.ts.
  - Files: `keymap.ts`, `editorCommands.ts`
- [ ] **[sidebar-filetree/M]** Let clicking a folder row's name toggle without forcing arrow-only, and don't lose selection of files inside
  - WYSIWYG: Folder rows toggle on click anywhere on the row, and the tree distinguishes the selected/active row from merely-open folders; new entries are created inline at the right place.
  - Lekha: handleClick (FileTree.tsx lines 138-144) toggles folders on full-row click (good), but newly created entries are not auto-selected/scrolled to and folders aren't auto-expanded to reveal them. handleNewFile opens the new file (App.tsx line 352) but if its parent folder is collapsed the new row isn't visible in the tree; handleNewFolder (lines 358-367) creates 'Untitled Folder' but neither expands the parent nor starts an inline rename, so the user must hunt for it and right-click Rename.
  - Change: After creating a file/folder, expand the parent folder (via the lifted expandedPaths set) and immediately enter inline-rename on the new entry (set renamingPath to the returned new path), matching WYSIWYG's create-then-name flow. createFolder/createFile already return the new path, so plumb it back to set renamingPath.
  - Files: `App.tsx`, `FileTree.tsx`
- [ ] **[outline/M]** Collapse/expand entire outline and persist per-document collapse intent
  - WYSIWYG: WYSIWYG offers expand-all / collapse-all affordances and remembers the outline collapse state while you work in a document.
  - Lekha: Collapse is per-node only via the chevron (Outline.tsx toggle). There is no expand-all/collapse-all control, and (per the reset finding above) the per-node state is not scoped to a document. Users with deep documents must click each chevron individually.
  - Change: Add small 'Expand all' / 'Collapse all' actions in the outline panel header (Sidebar header area) that set the collapsed Set to empty or to all parent positions. Combine with per-document scoping so the chosen state is sensible across files.
  - Files: `Outline.tsx`, `Sidebar.tsx`
- [ ] **[images/M]** Preserve original file extension/name and dedupe instead of generic image-NNNNNN
  - WYSIWYG: When you drag/drop or paste an image file, WYSIWYG keeps the original filename in the assets folder where possible, so the asset is recognizable on disk.
  - Lekha: saveImageToDisk derives filenames purely from a monotone counter: `image-000001.png` etc (images.ts:62-63, only the extension is taken from the MIME type). The original File.name (available on drag-dropped files) is discarded, so every dropped image becomes image-NNNNNN.<ext>, making the assets folder opaque.
  - Change: Thread the original filename (file.name) from imagePaste.ts into SaveImageArgs; in resolveImageTarget/saveImageToDisk sanitize and reuse the base name when present (falling back to the counter for clipboard bitmaps that have no name), appending `-N` only on collision. Clipboard-pasted bitmaps (no name) keep the counter scheme.
  - Files: `images.ts`, `imagePaste.ts`
- [ ] **[images/M]** Handle dropped/pasted image URLs and HTML, not just file bytes
  - WYSIWYG: Dragging an image from a browser, or pasting copied HTML/image, inserts the image by its URL (or downloads it), not just raw file bitmaps.
  - Lekha: Both handlers only look at file items: handleDrop reads dataTransfer.files (imagePaste.ts:135) and handlePaste reads clipboardData.items of kind 'file' (imagePaste.ts:113,59). A drag from a browser (which provides text/uri-list or text/html but no files) falls through; for paste it would hit smartPaste/default text handling and insert a bare URL string rather than an image. There is no handling of an image URL drag source.
  - Change: In handleDrop, when no file items are present, check dataTransfer for `text/uri-list` / `text/html`; if it resolves to an image URL, insert an image node with that src (optionally offering to download into assets/). Mirror this for paste of an image URL/HTML img.
  - Files: `imagePaste.ts`
- [ ] **[images/M]** Add real zoom/pan controls to the image lightbox
  - WYSIWYG: WYSIWYG's image preview/zoom lets you actually zoom in beyond fit (and the OS preview supports pan), useful for inspecting detail.
  - Lekha: ImageZoom.tsx only renders the image with CSS max-width:90vw/max-height:90vh object-fit:contain (global.css:901-909). It is a fit-to-screen lightbox with no zoom-in, scroll-to-zoom, or pan; the only interactions are click-backdrop / Esc to close.
  - Change: Add scroll-wheel or +/- zoom and click-drag pan within ImageZoom (track a scale/translate transform on the img), with a reset on close. Keep the existing fit-to-screen as the default state.
  - Files: `ImageZoom.tsx`, `global.css`
- [ ] **[micro-interactions/M]** Show reading time (and ideally cursor position) in the status bar
  - WYSIWYG: WYSIWYG's word-count widget in the status bar shows words, characters, lines, and reading time at a glance, and clicking expands the full breakdown. Reading time is visible without opening a panel.
  - Lekha: StatusBar.tsx shows only '{words} words · {chars} chars'. Reading time, lines, and paragraphs are computed in wordCount.ts/documentStats and only appear inside the WordCountPanel popover after the user clicks. There is no inline reading-time and no cursor line/column readout anywhere.
  - Change: Add a reading-time segment to the status bar (the value is already in editorStore-derived stats or can be computed from wordCount). Keep the click-to-open detailed panel. Optionally add a cursor 'Ln x, Col y' segment fed from the editor selection (EditorPane already tracks selection for the selection counts).
  - Files: `StatusBar.tsx`, `editorStore.ts`
- [ ] **[micro-interactions/M]** Make focus mode dim by paragraph/sentence consistently and ensure it works in lists
  - WYSIWYG: WYSIWYG's Focus Mode highlights the current paragraph (and offers sentence-level focus), highlighting the active line even inside list items and blockquotes.
  - Lekha: focusMode.ts decorates only the active TOP-LEVEL block (findActiveTopLevelBlock, direct child of doc) and github.css dims `.ProseMirror > *`. Inside a long list or blockquote the entire list/quote is treated as one block - every item stays at full opacity together rather than focusing the current line, so the focus effect is coarse compared to WYSIWYG's per-paragraph behavior.
  - Change: Extend the decoration to also mark the active leaf textblock (the paragraph/list-item containing selection.head), and add CSS to dim sibling children within the focused block so focus tracks the current line inside lists/quotes, not just the outermost block.
  - Files: `focusMode.ts`, `topLevelBlock.ts`, `github.css`
- [ ] **[inline-editing/S]** Scope the em-dash rule so `--` does not fire inside words
  - WYSIWYG: WYSIWYG is conservative about converting `--`; in normal prose it generally leaves intra-word hyphenation (e.g. `well--known`) untouched and primarily targets standalone dash sequences, avoiding surprise glyph substitution.
  - Lekha: inputRules.ts includes the stock `emDash` rule unconditionally. As its own comment in hrInputRule notes, typing `--` anywhere converts the two dashes to `—`; the HR rule even has to compensate for the `—-` buffer that results. This means `well--known` silently becomes `well—known` mid-typing, which users may not want.
  - Change: Replace the stock `emDash` with a custom InputRule whose regex requires a non-dash, non-word boundary context (e.g. only fire on `--` preceded by whitespace/start or a letter+space), or gate it behind a 'smart dashes' preference. Keep `---` -> HR working by preserving rule ordering.
  - Files: `inputRules.ts`
- [ ] **[typography/S]** Align H1/H2 font sizes with WYSIWYG's scale
  - WYSIWYG: WYSIWYG default GitHub theme: h1 = 2em, h2 = 1.5em, h3 = 1.25em, h4 = 1em, h5 = 0.875em, h6 = 0.85em (the GitHub markdown scale).
  - Lekha: github.css uses h1 = 2.25em (line 426), h2 = 1.65em (line 434), h3 = 1.35em (line 441), h4 = 1.1em (line 444), h5 = 0.95em (line 448), h6 = 0.88em (line 452). Every heading is a step larger than WYSIWYG, and h1 also carries letter-spacing: -0.01em which WYSIWYG does not.
  - Change: Adjust to the GitHub scale: h1 2em, h2 1.5em, h3 1.25em, h4 1em, h5 0.875em, h6 0.85em. Drop the letter-spacing on h1 (line 428) unless intentionally part of Lekha's identity. This is the same area as the weight override above, so do both together.
  - Files: `github.css`
- [ ] **[typography/S]** Lower default body line-height from 1.7 to WYSIWYG's 1.6
  - WYSIWYG: WYSIWYG default theme sets body line-height to 1.6. Paragraph rhythm in WYSIWYG is comparatively tight; the 1.6 value is a recognizable part of its look.
  - Lekha: github.css sets --editor-line-height: 1.7 (line 205) for the default theme, and the task-item checkbox height is hard-coded to 1.7em (github.css line 696) to match it. Graphite bumps it further to 1.75 (graphite.css line 28). The default reading column is therefore looser than WYSIWYG.
  - Change: Change --editor-line-height default to 1.6 in github.css :root (line 205). Update the task-item checkbox centering height (github.css line 696) to track the same value (ideally reference the token, e.g. height: var(--editor-line-height) em-equivalent, or update the literal to 1.6em). Leave Graphite's 1.75 if that theme intentionally runs looser.
  - Files: `github.css`
- [ ] **[typography/S]** Give inline code a border and tune background like WYSIWYG
  - WYSIWYG: WYSIWYG default GitHub inline code uses background rgba(0,0,0,0.05)-ish (a faint gray), NO border in the default theme, padding ~2px 4px, font-size ~0.9em, and color matching body. The key recognizable trait is the subtle rounded tint. (Many WYSIWYG themes also add a hairline border.)
  - Lekha: github.css inline code (lines 539-546) uses --code-bg-inline (#f8f8f8 light), border-radius 3px, padding 0.2em 0.4em, font-size 0.9em, no border. This is close, but the #f8f8f8 tint is extremely faint against the #ffffff page (only ~3% gray) so inline code barely stands out compared with WYSIWYG's slightly stronger wash. In Night/Graphite the inline bg equals the fenced code bg, which is fine.
  - Change: Darken --gh-code-bg-inline slightly (e.g. to rgba(27,31,35,0.05) or #eff1f3) so inline code reads as a distinct chip on white, matching WYSIWYG's contrast. Optionally add a 1px solid color-mix border for extra parity. Low priority since the structure is already correct.
  - Files: `github.css`
- [ ] **[typography/S]** Reduce blockquote left-border thickness toward WYSIWYG's hairline
  - WYSIWYG: WYSIWYG's default GitHub blockquote uses a softer treatment: a 0.25em (~4px is acceptable) gray left bar but with muted text and padding, and importantly the bar color is a light gray (#dfe2e5). It reads quietly. WYSIWYG actually uses border-left of 4px in GitHub theme but pairs it with a more muted text and a left padding of 1em - Lekha is close here.
  - Lekha: github.css blockquote (lines 474-479): border-left 4px solid --blockquote-border, padding 0 1em, color --text-sub. This is actually a faithful match to WYSIWYG's GitHub blockquote. No real gap - the bar width, color, padding, and muted text all align.
  - Change: No change needed; Lekha already matches WYSIWYG here. (Listed only to confirm parity - safe to skip.)
  - Files: `github.css`
- [ ] **[typography/S]** Use WYSIWYG's default body font stack instead of Open Sans
  - WYSIWYG: WYSIWYG's default theme body font is a system/serif-agnostic stack led by 'Open Sans' then Helvetica/Arial - so Lekha's --font-editor: "Open Sans", "Helvetica Neue"... is actually faithful to WYSIWYG default. However WYSIWYG Night does NOT switch to a different family; it keeps the same body font. Graphite correctly keeps a system sans.
  - Lekha: github.css --font-editor (line 194) = Open Sans / Helvetica Neue / Helvetica / Arial - this matches WYSIWYG's GitHub theme default. global.css has an unrelated structural fallback of Georgia (global.css line 29) but the theme token wins. No real divergence in the active theme.
  - Change: No change needed for parity; Lekha's default body font already mirrors WYSIWYG. (Confirmed - safe to skip. Only flag if you want the global.css Georgia fallback aligned to a sans for robustness when no theme loads.)
  - Files: `github.css`, `global.css`
- [ ] **[typography/S]** Tighten heading top/bottom margins to WYSIWYG's rhythm
  - WYSIWYG: WYSIWYG default GitHub theme heading margins: margin-top: 1em (24px-ish) and margin-bottom: 16px, i.e. roughly 1em top / 1em bottom, fairly even. h1/h2 add padding-bottom: 0.3em above their border.
  - Lekha: github.css shared heading rule (lines 417-419) uses margin-top: 1.6em and margin-bottom: 0.7em. The 1.6em top gap is noticeably larger than WYSIWYG's ~1em, and the asymmetry (large top, small bottom) is more pronounced than WYSIWYG's near-even spacing, so sections sit farther apart than in WYSIWYG.
  - Change: Reduce heading margin-top to ~1em (or 1.2em) and raise margin-bottom toward ~0.6-1em to approximate WYSIWYG's evener heading rhythm. Adjust lines 418-419 in github.css.
  - Files: `github.css`
- [ ] **[sidebar-filetree/S]** Add 'Copy Path' / 'Copy Relative Path' to the file-tree context menu
  - WYSIWYG: The file-tree right-click menu includes Copy Path and Copy Relative Path (alongside reveal, rename, delete, new), commonly used when referencing files in links.
  - Lekha: FileTreeMenu.tsx offers only New File, New Folder, Rename, Delete, Reveal in Finder (lines 94-143). There is no way to copy a node's absolute or workspace-relative path from the tree, a frequent need when authoring relative-link references between notes.
  - Change: Add 'Copy Path' and 'Copy Relative Path' menu items in the showEntryActions section. Copy absolute via clipboard; compute relative against the store's rootFolder for the relative variant. Wire through a new onCopyPath callback from FileTree -> App that uses the existing clipboard:write IPC (or navigator.clipboard).
  - Files: `FileTreeMenu.tsx`, `FileTree.tsx`, `App.tsx`
- [ ] **[outline/S]** Show a placeholder for empty/untitled headings
  - WYSIWYG: Headings with no text still appear as outline entries with a sensible placeholder rather than a blank, unclickable-looking line.
  - Lekha: getOutline (outline.ts) pushes `text: node.textContent` verbatim. A heading that is empty (e.g. just typed '## ' with no text yet) produces an OutlineItem with text '', which OutlineNodeRow renders as an empty <span> - a blank row that the user cannot visually identify or distinguish from a rendering glitch.
  - Change: In OutlineNodeRow (Outline.tsx) render `node.text.trim() || '(untitled)'` (or fall back to a level label like 'Heading 2'), and optionally style the placeholder muted. Keeps every heading clickable and legible.
  - Files: `Outline.tsx`
- [ ] **[find-replace/S]** Switch between Find and Replace modes without reopening, and let Cmd+Alt+F upgrade an open find bar
  - WYSIWYG: In WYSIWYG the find bar can expand into the replace view in place; invoking replace while find is open just reveals the replace row, keeping the existing query.
  - Lekha: mode is a prop derived from findState (App.tsx:98-101, 211-216) and there is no in-bar control to toggle the replace row. Pressing Cmd+Alt+F while the find bar is open does re-dispatch onReplace which flips mode to 'replace', but because FindReplace is not keyed it keeps query state - acceptable. However there is no in-UI affordance (expand/collapse chevron) to reach replace, so a user who opened with Cmd+F must know the separate shortcut.
  - Change: Add an expand/collapse toggle button in the first row of FindReplace that flips an internal showReplace flag (independent of the menu-driven mode), so the replace row is reachable from the find-only bar. Preserve query/replaceValue when toggling.
  - Files: `FindReplace.tsx`
- [ ] **[find-replace/S]** Report the number of replacements made by Replace All
  - WYSIWYG: WYSIWYG's Replace All gives feedback on how many replacements occurred (and the count drops to 0/0), confirming the operation.
  - Lekha: handleReplaceAll calls replaceAll then re-runs setFind and updates matchInfo (FindReplace.tsx:95-101). replaceAll already returns the count (EditorView.tsx:466-474, replaceAllTr returns count in find.ts:128) but FindReplace ignores the return value - so the user gets no explicit 'N replaced' feedback, only the implicit match-count change.
  - Change: Capture the count returned by editorRef.current.replaceAll(...) and surface it briefly in the count area (e.g. 'Replaced 7' for a couple seconds via aria-live), then fall back to the normal 'current / count' display.
  - Files: `FindReplace.tsx`
- [ ] **[find-replace/S]** Disable Replace/Replace All when there is no match, and keep focus in the find field
  - WYSIWYG: WYSIWYG disables replace actions when there is nothing to replace and keeps the find bar usable throughout.
  - Lekha: Replace and Replace All buttons are always enabled (FindReplace.tsx:204-220). replaceCurrent is a no-op when current<0 (findHighlight.ts:194-196) and replaceAll on 0 matches is harmless (find.ts:116-118), so this is purely a UX/affordance gap rather than a bug. The count region already exists to indicate 'No matches' (FindReplace.tsx:177-181).
  - Change: Disable the Replace and Replace All buttons (disabled={matchInfo.count===0}) and dim the case/regex toggles consistently. Optionally disable next/prev arrows when count===0 too. Low effort, improves discoverability that there is nothing to act on.
  - Files: `FindReplace.tsx`
- [ ] **[math-diagrams/S]** Make mermaid render errors readable instead of full raw stack/message dump
  - WYSIWYG: WYSIWYG shows a concise 'Syntax error in graph' style message for invalid mermaid.
  - Lekha: renderMermaid (mermaid.ts) returns `{ error: err.message }` and codeBlockNodeView dumps the entire message into `.diagram-error` with `word-break: break-all` (github.css line 1294). Mermaid's error messages are often long multi-line parser dumps; break-all makes them an unreadable wall. Also, on error the previous successfully-rendered SVG is replaced by the error box, so while typing you lose the diagram entirely on each transient invalid state.
  - Change: Trim/format the mermaid error (first line + 'Syntax error' summary) and use `word-break: normal; overflow-wrap: anywhere`. Optionally keep the last good SVG visible and overlay a small error badge rather than replacing the preview, so transient typos don't blank the diagram (matches WYSIWYG's less jarring behavior).
  - Files: `codeBlockNodeView.ts`, `github.css`
- [ ] **[export-print/S]** Generate heading id anchors so exported HTML supports in-document links and a TOC
  - WYSIWYG: WYSIWYG assigns slug ids to headings on export so a [[toc]] block and intra-document anchor links (e.g. [link](#section)) work in the exported HTML, and so external deep links to headings resolve.
  - Lekha: The export markdown-it instance (buildMarkdownIt in src/renderer/export/buildHtml.ts) enables strikethrough, table, task-lists and math, but uses no anchor/slug plugin (no markdown-it-anchor or heading_open id rule). Exported headings have no id attributes, so anchor links and any table-of-contents do not resolve in the exported HTML/PDF.
  - Change: Add a heading-id rule to buildMarkdownIt (markdown-it-anchor or a small renderer.rules.heading_open override that slugifies token text) so every heading gets a stable id. This also unblocks a future TOC feature.
  - Files: `buildHtml.ts`
- [ ] **[themes/S]** Differentiate Graphite from Night - it is nearly a duplicate dark theme
  - WYSIWYG: WYSIWYG ships distinct dark themes (Night vs e.g. its other dark options) with genuinely different surfaces, accents, and code palettes; users pick between meaningfully different looks.
  - Lekha: graphite.css and night.css share an identical hljs palette (both use the VS Code dark+ set: #c586c0/#ce9178/#6a9955/#dcdcaa/#b5cea8/#4ec9b0/#9cdcfe/#569cd6), the same find-match colors (#3d3817/#7c4f0a), and the same ==highlight== amber (#5a4a16). Graphite differs from Night essentially only in surface tint (#363b40 vs #1e1e1e), accent (#4ea1f3 vs #4fc3f7), and font scale/line-height. They read as near-duplicates in the code view.
  - Change: Give Graphite the actual WYSIWYG Night code palette (WYSIWYG Night uses its own muted highlight colors distinct from VS Code dark+, e.g. softer keyword/blue/green tones) and a distinct selection (#3f4d5c is already set - good) so it is a real alternative to Night rather than a recolored clone. Adjust --hljs-* and --highlight-bg in graphite.css to WYSIWYG's actual Night values.
  - Files: `graphite.css`
- [ ] **[shortcuts-palette/S]** Bind strikethrough and inline-code to WYSIWYG's accelerators in the menu
  - WYSIWYG: WYSIWYG binds Strikethrough to Ctrl+Shift+~ (Cmd+Shift+` style) and inline code to Ctrl+Shift+` ; these accelerators show in the Format menu so they are discoverable.
  - Lekha: keymap.ts does bind 'Mod-Shift-x' (strikethrough) and 'Mod-`' (inline code) (lines 59-60), but menu.ts shows both Strikethrough and Code with accelerator 'undefined' (lines 246-247) and registry.ts lists them with no shortcut hint (lines 52-53). So the shortcuts exist but are invisible to users, and 'Mod-Shift-x' is not the gesture WYSIWYG users expect.
  - Change: Surface the existing accelerators: in menu.ts set the Strikethrough item accelerator to match the keymap (or align both to WYSIWYG's Cmd+Shift+`) and give Code an accelerator. Add the matching '⌘⇧X' / '⌘`' (or chosen WYSIWYG-aligned) shortcut hints to the strikethrough and inlineCode entries in registry.ts so the palette displays them.
  - Files: `menu.ts`, `registry.ts`, `keymap.ts`
- [ ] **[micro-interactions/S]** Show the file path on the title (tooltip / full path) instead of bare filename
  - WYSIWYG: WYSIWYG's title bar shows the document name and exposes the full path (hover/tooltip and the proxy-icon path popover on macOS), so users can disambiguate same-named files and see where the file lives.
  - Lekha: TitleBar.tsx renders only `title`, which editorStore.deriveTitle() reduces to basename(path). There is no title attribute and no way to see the full path from the title bar; two files named README.md are indistinguishable in the chrome.
  - Change: Add a `title={path ?? 'Untitled'}` (full path) attribute to the .title-bar__title element so hovering reveals the location, reading editorStore.path. Optionally show a dimmed parent-folder segment next to the filename.
  - Files: `TitleBar.tsx`
- [ ] **[document-mgmt/S]** Make autosave debounce/idle behavior closer to WYSIWYG
  - WYSIWYG: WYSIWYG autosaves on an idle/interval basis and reliably persists before the app quits, so saved files stay current without manual Cmd+S.
  - Lekha: useAutoSave.ts debounces 1500ms after the last keystroke and additionally flushes on window 'blur'. It has no periodic flush during continuous typing (the debounce timer keeps resetting while you type, so a long uninterrupted typing burst is never written until you pause), and there is no save flush on app quit beyond the per-window close guard.
  - Change: Add a max-wait cap to the debounce (e.g. force a save at least every N seconds of continuous editing even if keystrokes keep resetting the timer) so long typing sessions are not left unsaved. Optionally flush on visibilitychange/pagehide in addition to blur. Keep the existing hasPath guard.
  - Files: `useAutoSave.ts`


---

## Progress log

### Wave 1 - Editor input & keymap parity (`feat/wysiwyg-input-parity`)
Implemented:
- **Backspace undoes a just-applied input rule** (`undoInputRule`) - keymap.ts.
- **Shift-Enter inserts a hard line break** (`hard_break`) - keymap.ts.
- **`$$` at start of an empty paragraph creates a block equation** - inputRules.ts.
- **Inline `code` mark is non-inclusive** (caret exits code styling) - schema.ts.
- **WYSIWYG heading shortcuts Cmd+1..6 / Cmd+0** (kept Cmd+Alt+0..6 as alternates) - keymap.ts + menu.ts.

Tests: +9 (keymap heading/break/backspace, `$$` rule, code-mark inclusive). 1169 unit + 7 e2e green.
Deferred (separate findings): inline-code caret-exit affordance, math/diagram auto-enter-edit on insert.

### Wave 2 - Sidebar file-tree reveal & expansion (`feat/wysiwyg-sidebar-reveal`)
Implemented:
- **Lifted folder expand/collapse state to a Set** keyed by absolute path at the FileTree root (survives tree refresh after create/rename/delete; previously per-node useState).
- **Auto-reveal the active file**: ancestor folders of the active path are always expanded (pure render-time union), so the highlighted file is reachable wherever it lives.
- **Scroll the active row into view** via a ref + `scrollIntoView({block:'nearest'})` when a row becomes active.

Tests: +2 (auto-expand reveals nested active file; active class applied). 1171 unit + 7 e2e green.
Note: the active file's own ancestor folders can't be manually collapsed while active (pure-derivation tradeoff to satisfy the react-hooks/refs lint - no effect/ref/setState). Acceptable + WYSIWYG-like.

### Wave 3 - Table & find interaction parity (`feat/wysiwyg-table-find`)
Implemented:
- **Tab in the last table cell appends a new row** and moves into its first cell (`addRowOnTab` in tableCommands.ts, chained into the Tab binding) - build a table fully from the keyboard.
- **Find seeds its query from the current selection** on open (short single-line selections) - FindReplace.tsx.
- **Find scrolls the current match into view as you type** (`setFindQuery` jumps to the current match) - findHighlight.ts.

Tests: +5 (Tab adds row; find seed-from-selection incl. multi-line skip). 1174 unit + 7 e2e green.

### Wave 4 - Format menu completeness (`feat/wysiwyg-format-menu`)
Implemented (menu/settings parity):
- **Highlight** (==, Cmd+Shift+H), **Superscript** (^), **Subscript** (~), **Clear Formatting** (Cmd+Alt+\) commands - marks already in the schema, now exposed via editorCommandMap, native Format menu, and the command palette/registry.
- Updated registry heading shortcuts to the WYSIWYG Cmd+1..6 / Cmd+0 (matching Wave 1).
- Fixed pre-existing lint debt in findReplace.test.tsx (Wave 3 test slipped past eslint): use `getByLabelText<HTMLInputElement>`.

Tests: +12 (highlight/sup/sub/clear command toggles + registry/menu coverage). 1183 unit + 7 e2e green.

### Wave 5 - Underline mark (`feat/wysiwyg-underline`)
Implemented (resolved Q5):
- **Underline `<u>` mark** with Cmd+U. New `underline-plugin.ts` adds a markdown-it inline rule that tokenizes bare `<u>`/`</u>` into `u_open`/`u_close` (html stays disabled, only these two tags handled); schema gains an `underline` mark; parser maps token `u` -> underline; serializer emits raw `<u>…</u>` (WYSIWYG HTML passthrough). Wired into editorCommandMap, keymap (Mod-u), Format menu, and the command registry.

Tests: +5 (underline round-trip + parse, command toggle, registry/menu/entries coverage). 1187 unit + 7 e2e green. Round-trip `<u>underlined</u>` is idempotent.

### Wave 6 - Doc-level file ops, part 1 (`feat/wysiwyg-doc-fileops`)
Implemented (menu/settings parity, build order b):
- **Reveal in File Tree** - ensures sidebar Files tab is visible; the active file auto-reveals (Wave 2).
- **Open File Location** (Show in Finder) - reveals the current document via revealPath.
- **Revert to Saved** - reloads the current file from disk through the shared loadInto, with a confirm guard when the doc is dirty (new `useFileOps.revertToSaved`).
Wired into AppCommand, useCommands dispatch, the File menu, and the command registry.

Tests: +1 useCommands dispatch + registry/menu coverage of the 3 commands. 1188 unit + 7 e2e green.
Remaining in build-order (b): Rename, Duplicate, Move To, Delete (need new fs IPC for duplicate/move), Save All (multi-window) - next sub-wave.

### Wave 7 - Doc-level file ops, part 2: Duplicate + Delete (`feat/wysiwyg-fileops-2`)
Implemented (build order b cont.):
- **Duplicate** - new main `duplicatedPath` (pure) + `duplicatePath` (IO, copies to "name copy.md", auto-increments " copy 2/3…" on collision); new `fs:duplicatePath` IPC + preload; `useFileOps.duplicateCurrent` duplicates the open file, refreshes the tree, opens the copy. File menu + registry + command.
- **Move to Trash** - `useFileOps.deleteCurrent` confirms, trashes the current file (existing deletePath), resets to a blank doc, refreshes the tree. File menu + registry + command.

Tests: +6 (duplicatedPath pure, duplicatePath IO incl. collision, duplicateFile dispatch; updated 4 LekhaAPI/FileOps mocks). 1193 unit + 7 e2e green.
Remaining in (b): Rename current (name prompt), Move To (folder picker + new fs:movePath IPC), Save All (multi-window) - next sub-wave.

### Wave 8 - Move To + Save All (`feat/wysiwyg-move-saveall`)
Implemented (build order b, near-finished):
- **Move To…** - new main `movedPath` (pure) + `movePath` (IO, rename into chosen dir, collision guard) + `fs:movePath` IPC/preload; `useFileOps.moveCurrentTo` picks a folder via the native dialog, moves the open file, reopens at the new path, refreshes the tree. File menu + registry + command.
- **Save All** - main-side: iterates all BrowserWindows and sends the `save` command to each (reaches every window, not just focused). Wired via a new onSaveAll param to buildMenuTemplate + index.ts; File ▸ Save All.

Tests: +6 (movedPath pure, movePath IO incl. collision-reject, moveFileTo dispatch; +3 LekhaAPI mocks updated with movePath, +1 FileOps mock). 1197 unit + 7 e2e green.
Deferred: **Rename current** needs a small dialog component (Electron disables window.prompt) - next wave.

### Wave 9 - Print (`feat/wysiwyg-print`)
Implemented (build order c):
- **Print…** - new `window:print` IPC (fire-and-forget); main calls `event.sender.print()` so the OS print dialog (page setup included) opens for the sending window. Preload `print()`, AppCommand `print`, useCommands handler, File ▸ Print…, command registry. No accelerator (Cmd+P stays Quick Open in Lekha).

Tests: +1 dispatch + registry; updated all 4 LekhaAPI mocks with print. 1198 unit + 7 e2e green.

### Wave 10 - Rename current document (`feat/wysiwyg-rename`)
Implemented:
- **Rename…** - new App-hosted `RenameDialog` (reuses .dialog CSS + useFocusTrap; prefilled with the current basename, base selected, Enter/Esc). useCommands gains an optional `onRename` option; App opens the dialog on `renameFile` and on submit reuses the existing `handleRenameEntry` (renamePath + updates the open-doc path + refreshes the tree). AppCommand `renameFile`, File ▸ Rename…, command registry.

Tests: +5 (RenameDialog render/prefill/submit/unchanged-noop; renameFile dispatch). 1203 unit + 7 e2e green.

### Wave 11 - Get Info (`feat/wysiwyg-getinfo`)
Implemented (build order d):
- **Get Info** - new `statFile` fs-helper + `FileStat` type + `fs:statFile` IPC/preload/api; App-hosted read-only `GetInfoDialog` (focus-trapped) showing name, path, human-readable size, created/modified dates, and word/char counts (from editorStore). App resolves the stat in the command handler (not an effect) and passes a snapshot to the presentational dialog. useCommands gains an optional `onGetInfo`; AppCommand `getInfo`, File ▸ Get Info, registry.

Tests: +5 (statFile IO, getInfo dispatch, GetInfoDialog render/size/counts); statFile added to 3 LekhaAPI mocks. 1208 unit + 7 e2e green.

### Wave 12 - Articles/Library sidebar view (`feat/wysiwyg-articles`)
Implemented (build order e):
- **Articles/Library tab** - new `ArticleEntry` type + `listArticles` fs-helper (recursive .md walk; title = first `# ` heading else basename; ~140-char preview; sorted mtime desc) + `deriveArticleTitle`/`deriveArticlePreview` pure helpers; `fs:listArticles` IPC/preload/api. `Articles.tsx` flat recent-first list (title + source folder + relative time + 2-line preview, click opens). Added a 4th sidebar tab (Files | Outline | Articles | Search): extended `sidebarTab` type in shared/types + workspaceStore + Sidebar (tab button + render + header label). `revealInLibrary` command + File ▸ Reveal in Library + registry.

Tests: +8 (deriveArticleTitle/Preview pure, listArticles IO, revealInLibrary dispatch, Articles component load/click); listArticles added to all 4 LekhaAPI mocks. 1216 unit + 7 e2e green. Verified visually (Graphite theme).

### Wave 13 - Share via macOS share sheet (`feat/wysiwyg-share`)
Implemented (build order f):
- **Share…** - renderer command -> `window:share` IPC -> main opens Electron's `ShareMenu({ filePaths: [path] })` popup on the sender window (macOS only; no-op elsewhere). AppCommand `share`, useCommands handler (shares current doc path), File ▸ Share…, registry. share() added to all 4 LekhaAPI mocks.

Tests: +2 (share dispatch with path + registry). 1217 unit + 7 e2e green.

### Wave 14 - Jump to Top / Bottom (`feat/wysiwyg-jump`)
Implemented (Edit/View additions, sub-wave A):
- **Jump to Top** / **Jump to Bottom** - editorCommandMap commands (TextSelection.atStart/atEnd + scrollIntoView). Edit menu, command registry. No accelerators (avoid clobbering native caret nav).

Tests: +2 (jump selection to start/end). 1221 unit + 7 e2e green.

### Wave 15 - Copy as Plain Text / Copy without Theme Styling (`feat/wysiwyg-copy-plain`)
Implemented (Edit/View additions, sub-wave B):
- **Copy as Plain Text** - new `getPlainText()` editor handle (doc.textBetween with blank-line block separators); useCommands writes it to the clipboard as text.
- **Copy without Theme Styling** - `buildExportHtml` gains an `includeCss` option (default true); the command builds HTML with `includeCss:false` (no inlined theme/KaTeX/hljs CSS) and writes it as rich HTML + markdown fallback, so paste adopts the destination's styling.
Edit menu + command registry + AppCommands. (Paste as Plain Text deferred to a follow-up - needs a clipboard-read IPC + insert.)

Tests: +4 (buildHtml includeCss structural, copyAsPlainText dispatch); getPlainText added to the EditorPaneHandle mocks. 1224 unit + 7 e2e green.
