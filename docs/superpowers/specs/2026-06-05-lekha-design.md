# Lekha - WYSIWYG Markdown Editor (Phase 1 MVP) - Design Spec

**Date:** 2026-06-05
**Status:** Approved direction, ready for implementation planning
**Platform:** macOS-first (cross-platform-friendly code)

## 1. Overview

Lekha is a desktop **WYSIWYG Markdown editor** - a polished, independent editor.
Its defining behavior is **seamless live editing on a single surface**: the user types
Markdown and it renders in place (no split source/preview pane). Phase 1 delivers a solid,
fully-tested core editor plus file management. Later phases layer on math, diagrams, export,
themes, and more.

### Goals (Phase 1)
- Polished look (GitHub default theme: typography, colors, layout) and core feel.
- True inline WYSIWYG editing backed by a real document model (ProseMirror).
- Lossless Markdown round-trip (open file -> edit -> save produces clean, stable Markdown).
- A reliable macOS desktop app: open folder, file tree, open/save files, native menu.
- Built test-first (TDD) with a meaningful unit + e2e suite.

### Non-Goals (deferred to later phases)
LaTeX math, Mermaid/diagrams, export (PDF/HTML/Word via pandoc), CSS theme switching,
focus/typewriter mode, image asset management, footnotes/TOC/YAML front-matter,
document tabs / multi-window, preferences window, auto-update.

## 2. Tech Stack

Mirrors the proven Tora toolchain (independent codebase):

| Concern | Choice |
|---|---|
| Shell | Electron 41 |
| Build/dev | electron-vite + Vite |
| Language | TypeScript (strict) |
| UI | React 19 |
| State | zustand |
| Editor engine | ProseMirror (model/state/view/transform/commands/keymap/history/inputrules/schema-list/gapcursor/dropcursor) |
| Markdown bridge | markdown-it (parse) + custom ProseMirror MarkdownSerializer (serialize) |
| Tables | prosemirror-tables |
| Syntax highlight | lowlight / highlight.js (code blocks) |
| Source mode | CodeMirror 6 (`@codemirror/*`, markdown language) |
| Unit tests | vitest + happy-dom + @testing-library/react |
| E2E tests | Playwright (`_electron`) |
| Packaging | electron-builder (mac dmg/zip) |
| Lint/format | eslint + prettier + husky + lint-staged |

**Persistence:** a small JSON settings store in `app.getPath('userData')` (recent files,
last folder, window bounds, sidebar state). No native DB dependency in Phase 1 - keeps
packaging simple.

## 3. Process Architecture

Standard hardened Electron three-process split:

```
Main process (Node): window lifecycle, native menu, dialogs, filesystem IO,
  settings store, IPC handlers
   |  contextBridge (typed `window.lekha`)
Preload (isolated): thin, typed, allow-listed IPC surface only
   |
Renderer (React): App shell, ProseMirror editor, CodeMirror source, sidebar,
  outline, status bar, find/replace, zustand stores
```

**Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
The renderer never touches `fs`/`path` directly - only the allow-listed preload API.

### Preload API surface (`window.lekha`)
```ts
interface LekhaAPI {
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  saveAsDialog(suggestedName: string): Promise<string | null>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  readDir(path: string): Promise<FileNode[]>
  getRecentFiles(): Promise<string[]>
  addRecentFile(path: string): Promise<void>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<void>
  onCommand(cb: (cmd: AppCommand) => void): () => void
  setDocumentState(state: { title: string; dirty: boolean; path: string | null }): void
}
```

`AppCommand` is a string union (new, open, save, toggleSource, bold, italic, ...). The
native menu sends these to the focused renderer; the renderer executes the corresponding
command.

## 4. Editor Engine (the core)

The hardest, highest-value unit. Built and tested before any UI is wired.

- **Schema** (`editor/schema.ts`): extends the prosemirror-markdown baseline with task lists,
  strikethrough, tables, and a `language` attr on code blocks.
- **Parser** (`editor/parser.ts`): markdown-it (html:false, task lists, strikethrough, tables)
  mapped to a ProseMirror document.
- **Serializer** (`editor/serializer.ts`): custom MarkdownSerializer emitting clean,
  deterministic Markdown for every node/mark.
- **Round-trip guarantee:** `serialize(parse(md))` is idempotent for all supported constructs,
  driven by a corpus of fixture `.md` files.
- **Input rules** (`editor/inputRules.ts`): type-Markdown transforms (headings, lists, quotes,
  code blocks, hr, emphasis, smart pairing).
- **Keymap** (`editor/keymap.ts`): history, list handling, formatting shortcuts, base keymap.
- **Code highlighting** (`editor/plugins/highlight.ts`): lowlight decoration plugin.
- **Source mode** (`editor/SourceView.tsx`): CodeMirror 6 bound to the serialized Markdown.
- **Derived data:** outline extraction and word/char count as pure functions over the doc.

## 5. Renderer UI

```
App
  TitleBar    (traffic-light gutter, centered doc title, dirty dot)
  Workspace
    Sidebar   (toggle; tabs Files | Outline; bottom toggle bar)
      FileTree (open-folder tree, active highlight)
      Outline  (heading list, click to scroll)
    EditorPane
      EditorView (ProseMirror)  or  SourceView (CodeMirror)
  StatusBar   (word/char count, Ln/Col, source toggle)
  FindReplace (overlay, Cmd-F / Cmd-Alt-F)
```
macOS uses `titleBarStyle: 'hiddenInset'`. Styling lives in `styles/themes/github.css` as CSS
variables so later phases can add theme switching. Phase 1 ships the GitHub default theme,
matching the approved mockup.

## 6. State (zustand)

- **editorStore**: path, title, isDirty, mode, markdown snapshot, outline, wordCount, charCount.
  The live ProseMirror EditorState is held in the editor component via ref; the store holds
  metadata/derived data updated on transactions (debounced).
- **workspaceStore**: rootFolder, fileTree, recentFiles, sidebarVisible, sidebarTab.

## 7. Data Flow

**Open file:** dialog -> readFile -> parse -> set EditorState -> update store -> set window title.
**Edit:** transaction -> view update -> debounced recompute outline + counts, mark dirty.
**Save:** serialize doc -> writeFile (atomic) -> mark clean -> addRecentFile.
**Toggle source:** wysiwyg->source serializes; source->wysiwyg parses.

## 8. Error Handling
- IPC handlers return typed results; FS errors surface as user-facing toasts, never crash.
- Parser is defensive: unknown Markdown falls back to paragraphs/plain text.
- Dirty-document guard on close/open prompts Save / Don't Save / Cancel.
- Save writes atomically (temp file + rename).

## 9. Testing Strategy (TDD)
- **Unit (vitest):** round-trip corpus, schema, input rules, keymap commands, outline,
  word count, file tree builder, settings store, zustand stores.
- **Component (vitest + Testing Library):** TitleBar, StatusBar, Sidebar, FindReplace.
- **E2E (Playwright + Electron):** type renders, open/edit/save, source toggle, folder tree,
  find & replace.

## 10. Project Structure
```
src/
  main/      index.ts, window.ts, menu.ts, settings.ts, ipc/{files,dialog}.ts
  preload/   index.ts, api.d.ts
  renderer/
    main.tsx, App.tsx
    editor/  schema, parser, serializer, inputRules, keymap, outline, wordCount,
             plugins/highlight, EditorView, SourceView
    components/ TitleBar, Sidebar, FileTree, Outline, StatusBar, FindReplace
    store/   editorStore, workspaceStore
    styles/  global.css, themes/github.css
  shared/    types.ts, ipc-channels.ts, commands.ts
tests/ unit/ (+ fixtures/*.md), e2e/
```

## 11. Implementation Order (each milestone is TDD)
1. Scaffold (electron-vite, tsconfig, eslint/prettier, vitest, playwright, blank window).
2. Markdown engine (schema -> parser -> serializer, round-trip corpus).
3. EditorView (mount ProseMirror, render parsed doc).
4. Input rules + keymap.
5. Code highlighting.
6. Tables, task lists, strikethrough behaviors.
7. Source mode.
8. Outline + word count.
9. File IPC (open/save/save-as, dirty tracking, atomic write, recent files).
10. Stores + file ops.
11. App shell + sidebar.
12. Native menu + command bridge.
13. Find & replace.
14. Styling, e2e, packaging.

## 12. Success Criteria
- Type Markdown and watch it render inline, in place, no split pane.
- Open/edit/save real `.md` files with stable, clean round-tripped output.
- Open a folder, browse the tree, switch files, see the outline.
- Source-mode toggle, find & replace, word count all work.
- Unit + e2e suites green; app packages into a runnable macOS build.
- Visual match to the approved GitHub-theme mockup.
