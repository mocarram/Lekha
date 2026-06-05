# Lekha Phase 1 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a WYSIWYG-faithful WYSIWYG Markdown editor (Phase 1 MVP) as a hardened macOS Electron app, test-first.

**Architecture:** Three-process Electron (main / preload / renderer). The renderer hosts a ProseMirror editor engine with a tested Markdown round-trip (markdown-it parser + custom serializer), input rules, lowlight highlighting, and a CodeMirror source mode. Main owns filesystem IO, native menu, dialogs, and a JSON settings store, exposed via an allow-listed `window.lekha` preload bridge.

**Tech Stack:** Electron 41, electron-vite, TypeScript (strict), React 19, zustand, ProseMirror, markdown-it, prosemirror-tables, lowlight/highlight.js, CodeMirror 6, vitest + happy-dom + Testing Library, Playwright.

**Conventions:**
- Each task: red -> green -> (refactor) -> commit. Local commits only (no push to main; work on a feature branch). No Claude co-author.
- Unit tests: `npm test` (vitest run) or `npx vitest run <path>`. Types: `npm run typecheck`. Lint: `npm run lint`.
- Conventional commit messages.

---

## Locked shared contracts (keep these names exact across all tasks)

`src/shared/types.ts`
```ts
export interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[] }
export interface Settings {
  recentFiles: string[]; lastFolder: string | null
  sidebarVisible: boolean; sidebarTab: 'files' | 'outline'
  windowBounds?: { x: number; y: number; width: number; height: number }
}
export type EditorMode = 'wysiwyg' | 'source'
export interface OutlineItem { level: number; text: string; pos: number }
export interface DocCounts { words: number; chars: number }
export interface DocumentState { title: string; dirty: boolean; path: string | null }
```

`src/shared/commands.ts`
```ts
export type AppCommand =
  | 'new' | 'open' | 'openFolder' | 'save' | 'saveAs'
  | 'toggleSource' | 'toggleSidebar' | 'find' | 'replace'
  | 'bold' | 'italic' | 'strikethrough' | 'inlineCode' | 'link'
  | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
  | 'paragraph' | 'bulletList' | 'orderedList' | 'taskList' | 'blockquote'
  | 'codeBlock' | 'horizontalRule' | 'undo' | 'redo'
```

`src/shared/ipc-channels.ts`
```ts
export const IPC = {
  openFileDialog: 'dialog:openFile', openFolderDialog: 'dialog:openFolder', saveAsDialog: 'dialog:saveAs',
  readFile: 'fs:readFile', writeFile: 'fs:writeFile', readDir: 'fs:readDir',
  getRecentFiles: 'settings:getRecentFiles', addRecentFile: 'settings:addRecentFile',
  getSettings: 'settings:get', setSettings: 'settings:set',
  setDocumentState: 'window:setDocumentState', command: 'app:command',
} as const
```

`window.lekha` API (preload), typed in `src/preload/api.d.ts` — methods:
openFileDialog, openFolderDialog, saveAsDialog, readFile, writeFile, readDir,
getRecentFiles, addRecentFile, getSettings, setSettings, setDocumentState, onCommand.

Editor engine public surface (exact signatures):
```ts
export const schema: Schema                                   // editor/schema.ts
export function parseMarkdown(md: string): Node               // editor/parser.ts
export function serializeMarkdown(doc: Node): string          // editor/serializer.ts
export function buildInputRules(schema: Schema): Plugin       // editor/inputRules.ts
export function buildKeymap(schema: Schema): Plugin           // editor/keymap.ts
export function keymapBindings(schema: Schema): Record<string, Command>  // editor/keymap.ts
export function highlightPlugin(): Plugin                     // editor/plugins/highlight.ts
export function getOutline(doc: Node): OutlineItem[]          // editor/outline.ts
export function countWords(doc: Node): DocCounts              // editor/wordCount.ts
export function createEditorState(markdown: string): EditorState  // editor/createState.ts
```

---

## Milestone 1 - Scaffold
**Task 1:** electron-vite + Electron 41 + React 19 + TS strict + zustand, vitest (happy-dom) + Playwright, hardened BrowserWindow (contextIsolation/sandbox/nodeIntegration:false, titleBarStyle hiddenInset), aliases @shared/@renderer/@main, smoke test green. Mirror Tora's configs.
**Task 2:** shared contracts (types/commands/ipc-channels) exactly as above.

## Milestone 2 - Markdown engine (schema -> parser -> serializer -> round-trip)
**Task 3:** Schema extending prosemirror-markdown with task_list/task_item{checked}, strikethrough, tables (prosemirror-tables), code_block{language}.
- **KNOWN FIX (bake in):** `task_list` content MUST be `(task_item | list_item)+` so a markdown-it-merged mixed list (plain + checkbox items) doesn't lose data.
**Task 4:** Parser via MarkdownParser over `MarkdownIt('commonmark',{html:false}).enable(['strikethrough','table']).use(taskLists,{label:true})` + custom token plugins for task lists (retype container to task_list, only checkbox items to task_item, leave plain as list_item) and tables (wrap cell inline in paragraph).
**Task 5:** Serializer extending defaultMarkdownSerializer: fenced code_block w/ language, `~~` strike, task_list rendering BOTH task_item (`- [x]`/`- [ ]`) and list_item (`- `), GFM tables (pipe escaping). Canonical: ATX headings, `-` bullets.
**Task 6:** Round-trip idempotency corpus — fixtures/*.md (headings, emphasis, lists, tasks, quotes, code, tables, links-images, rules, mixed, mixed-lists) + `serialize(parse(once)) === once`.

## Milestone 3 - EditorView
**Task 7:** `createEditorState(md)` (plugins: buildInputRules, buildKeymap, keymap(baseKeymap), dropCursor, gapCursor, history, tableEditing) and a React `EditorView` (forwardRef) with props `{markdown,onChange?,className?}`, single mount + teardown, imperative `EditorHandle { getDoc, getMarkdown, setMarkdown, focus }`.

## Milestone 4 - Input rules + keymap
**Task 8:** `buildInputRules(schema)` — smartQuotes/ellipsis/emDash; `# `..heading; `> `blockquote; `-/*/+ `bullet; `1. `ordered; ` ``` `code_block(lang); `---/***/___`hr; inline `**`/`__`strong, `*`/`_`em, `` ` ``code, `~~`strike via shared `markInputRule`.
- **KNOWN FIX (bake in):** `markInputRule` must read `match[1] ?? match[2]` so underscore variants (`__b__`, `_i_`) in 2-group alternation regexes apply correctly.
**Task 9:** `keymapBindings(schema): Record<string,Command>` (exported for direct tests) + `buildKeymap` — Mod-b/i/Shift-x/backtick marks; Mod-z/y/Shift-z history; Enter/Tab/Shift-Tab list (chained list_item+task_item); Mod-Alt-0..6 block types. Wire into createState (no duplicate history/keymap).

## Milestone 5 - Code highlighting
**Task 10:** `highlightPlugin()` — decoration plugin using lowlight to highlight code_block by language (GitHub palette), cached by block text.

## Milestone 6 - Task items / tables / strike behaviors
**Task 11:** `toggleTaskItem(pos)` command + interactive checkbox NodeView; tableEditing()/columnResizing() active; Tab/Shift-Tab move cells.

## Milestone 7 - Source mode
**Task 12:** `SourceView.tsx` (CodeMirror 6 markdown) + `EditorPane` conditional on mode; serialize on enter-source, parse on exit-source. Pure bridge tests.

## Milestone 8 - Outline + word count
**Task 13:** `getOutline(doc)` -> heading level/text/pos.
**Task 14:** `countWords(doc)` -> {words,chars}.

## Milestone 9 - File IPC + settings (main)
**Task 15:** `createSettingsStore(baseDir)` — get/set(patch)/addRecentFile (unshift+dedupe+cap 15), settings.json.
**Task 16:** `buildFileTree(dir)` (md-only, dirs-first, nested -> FileNode[]) + `writeFileAtomic(path,content)` (temp+rename).
**Task 17:** ipcMain handlers for all IPC.* + preload contextBridge `window.lekha` + onCommand.

## Milestone 10 - Stores + file ops
**Task 18:** zustand editorStore + workspaceStore.
**Task 19:** `useFileOps` — open/save/saveAs/new orchestrating window.lekha + stores + editor ref.

## Milestone 11 - App shell + sidebar
**Task 20:** TitleBar/StatusBar/EditorPane + App assembly (reads stores).
**Task 21:** Sidebar (tabs Files|Outline + bottom toggle), FileTree (recursive, active highlight, onSelect), Outline (indented, onJump). openFolder() wired.

## Milestone 12 - Native menu + command bridge
**Task 22:** `buildMenu(send)` File/Edit/Format/View/Paragraph with accelerators -> AppCommand; main sends via webContents.send(IPC.command); `useCommands` hook dispatches.

## Milestone 13 - Find & replace
**Task 23:** `find.ts` (findMatches(doc,query,{caseSensitive}) -> ranges; replaceAll) + FindReplace overlay (next/prev/replace/replace-all, Esc, match decorations).

## Milestone 14 - Styling, e2e, packaging
**Task 24:** github.css CSS variables + `.ProseMirror` rules matching the approved mockup (Open Sans 16/1.6, bordered h1/h2, GitHub-blue links, #f8f8f8 code, #fafafa sidebar, faint #c8c8c8 source markers); hiddenInset title bar.
**Task 25:** Playwright e2e — type renders, open/edit/save, source toggle, folder tree, find & replace.
**Task 26:** electron-builder.yml (appId, productName Lekha, mac dmg+zip, category productivity); `dist:mac`.

## Self-Review
Spec coverage complete; no placeholders; type names consistent across tasks. Two known bugs from the first build are pre-baked into Tasks 3 and 8.
