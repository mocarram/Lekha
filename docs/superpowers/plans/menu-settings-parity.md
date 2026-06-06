# WYSIWYG Menu & Settings Parity - Map, Plan & Open Questions

Compares WYSIWYG's menu/settings surface to Lekha's (`src/main/menu.ts`,
`components/Preferences.tsx`, `src/shared/types.ts` Settings). Status legend:
**HAVE** · **ADD** (will implement) · **SKIP** (not wanted) · **❓** (needs your input).

## File menu

| WYSIWYG | Lekha | Status |
|---|---|---|
| New | New | HAVE |
| New Tab | – | ❓ Lekha uses one doc per window (no in-window tabs). Add document **tabs**, or keep window-per-doc? Big arch choice. |
| New Window | New Window | HAVE |
| Open… | Open… | HAVE |
| Open Recent | Open Recent | HAVE |
| Open Quickly | Quick Open (Cmd+P) | HAVE (rename to "Open Quickly"?) |
| Get Info | – | ADD - doc info popover (path, size, created/modified, word/char count) |
| Reveal in Library | – | ❓ Tied to WYSIWYG's "Library/Articles" concept - what should this do in Lekha? |
| Reveal in File Tree | (auto-reveal exists) | ADD - explicit "Reveal in Sidebar" command |
| Open File Location | (tree row has Reveal) | ADD - doc-level "Show in Finder" |
| Delete… | (tree row has Delete) | ADD - doc-level "Move to Trash" |
| Close | Cmd+W (role) | HAVE |
| Save | Save | HAVE |
| Duplicate | – | ADD - duplicate current file on disk |
| Rename… | (tree inline rename) | ADD - doc-level Rename |
| Move To… | – | ADD - move current file to another folder |
| Revert To | – | ADD - "Revert to Saved" (reload from disk, discard changes); macOS version browsing = SKIP (OS-level) |
| Save All | – | ADD - save all open windows |
| Share | – | ❓ macOS share sheet - want it? (lower priority) |
| Import | – | SKIP (per your note) |
| Export | Export submenu | HAVE (HTML/PDF/docx/epub/rtf/latex/opml) |
| Page Setup | – | ❓ needed, or is Print enough? |
| Print | – | ADD - system print (already a high backlog finding) |

## Edit menu (expanded from WYSIWYG's Edit menu screenshot)
HAVE: Undo/Redo, Cut/Copy/Paste/SelectAll, Copy as HTML/Markdown, Find/Replace.
ADD (needed):
- **Copy as Plain Text** and **Paste as Plain Text** (strip formatting).
- **Copy without Theme Styling** - copy-as-HTML variant with no theme CSS inlined.
- **Move Row Up / Move Row Down** - reorder the current table row (and add
  **Move Column Left/Right** for completeness) via prosemirror-tables.
- **Line Endings** submenu - LF / CRLF for the current document (persist + apply
  on save).
- **Selection** submenu - Select Line / Select Block / Select Word.
- **Jump to Top / Jump to Bottom** of the document.
- **Speech** (Start Speaking / Stop Speaking), **Start Dictation**, **Emoji &
  Symbols** - macOS roles (`startSpeaking`/`stopSpeaking`/`startsDictation`/
  `showEmojiAndSymbols` / `toggleSpeech`), cheap to add.
ADD (have behavior, expose toggle): **Substitutions / Smart Punctuation**
(smart quotes, dashes, ellipsis) - already in input rules; add a settings toggle
+ Edit-menu entry. **Spelling and Grammar** - we have spellcheck; surface the
standard submenu where practical.
SKIP: Copy Image Content (niche), AutoFill (OS form-fill, irrelevant to an editor).

## Paragraph menu (WYSIWYG separates block-level from inline)
Lekha folds these into Format. ADD a dedicated **Paragraph** menu mirroring
WYSIWYG: Heading 1-6, Paragraph, Increase/Decrease Heading Level, Ordered/Bullet/
Task List, Indent/Outdent, Blockquote, Code Fences, Math Block, Table, Horizontal
Rule, [TOC], Footnote, Link Reference.

## Format menu (inline)
ADD: Underline (❓ WYSIWYG supports `<u>`; Lekha has no underline mark yet),
Highlight (`==`), Superscript (`^`), Subscript (`~`), Comment, Clear Format.
HAVE: Bold, Italic, Strikethrough, Code, Link, Image. (highlight/sub/sup marks
exist in the schema but lack menu/command entries.)

## View menu
ADD: Show/Hide Status Bar, toggle Outline/Files/Search panel directly, Always on
Top. HAVE: Sidebar, Source Mode, Focus, Typewriter, Presentation, zoom,
fullscreen, Command Palette, devtools.

## Themes menu
ADD (ties to design-system workstream): "Open Theme Folder" + "Reload Themes"
(load user `.css` themes from a userData/themes dir) and optionally "Get Themes".
HAVE: built-in theme radio list.

## Settings / Preferences panels to expand
WYSIWYG groups: General, Appearance, Editor, Image, Markdown, Export, Spelling.
Lekha currently has: theme, font size, focus/typewriter defaults, equation
numbering, auto-save, spell check + language, sidebar default tab.
ADD settings (most behaviors already exist - just expose toggles): smart
punctuation (smart quotes/dashes/ellipsis), auto-pair brackets/markers, code-block
line numbers + copy button, image insert behavior (copy-to-assets vs absolute),
markdown extension toggles (math, diagrams, sub/sup, highlight, footnotes, YAML),
reading-time in status bar.

## Resolved decisions (user answered - now ADD, no longer ❓)
1. **Document tabs** - YES. Add real in-window tabs (multiple docs per window,
   tab bar, Cmd+T new tab, Cmd+W closes tab then window). Large workstream - do
   it as its own staged effort (tab model in a store, tab strip UI, per-tab
   editor state, dirty indicator per tab, drag-reorder, persistence).
2. **Articles/Library view + two reveal commands** - YES, both views exist:
   - **File Tree** (current sidebar Files tab) - folder hierarchy.
   - **Articles/Library** (NEW sidebar tab "Articles") - a FLAT list of every
     `.md` file under the workspace, sorted by last-modified (most recent first),
     each row showing: title (first H1 or filename), source folder label, a
     relative timestamp ("20 minutes ago"/"Yesterday"/date), and a 1-2 line
     content preview. Clicking opens the file.
   - **Reveal in File Tree** - switch to Files tab + expand/scroll to active file
     (Wave-2 auto-reveal already does the expand/scroll).
   - **Reveal in Library** - switch to Articles tab + highlight/scroll active file.
   Needs a main IPC to list all md files with {path, mtime, title, preview}.
3. **Share** - YES. macOS share sheet (AirDrop/Messages/Notes/…) via Electron's
   `ShareMenu` (macOS only); File ▸ Share with the current file as the shared item.
4. **Print** - YES, Print only (`webContents.print()` opens the native dialog,
   which already exposes page setup). No separate Page Setup item.
5. **Underline** - YES. Add a `<u>` underline mark with Cmd+U; parser maps `<u>`,
   serializer emits raw `<u>…</u>` (HTML passthrough, like WYSIWYG). Keep
   markdown round-trip stable for the rest.

## Articles/Library view - design
- Sidebar gains a 4th tab: **Files | Outline | Articles | Search** (Articles
  between Outline and Search, matching WYSIWYG's emphasis).
- Main IPC `fs:listArticles(root)` returns `ArticleEntry[]`
  `{ path, title, mtimeMs, sizeBytes, preview }` for all `.md` under root
  (reuse the recursive walk from buildFileTree / searchFolder; cap preview to
  ~140 chars; title = first `# heading` else basename).
- Renderer `Articles.tsx` component renders the grouped/sorted list with
  relative-time formatting; clicking calls the same open-file path as the tree.
- `sidebarTab` type extends to include `'articles'`; persisted like the others.

## Build order (autonomous waves)
1. Doc-level file ops (Get Info, Reveal in Sidebar, Show in Finder, Rename,
   Duplicate, Move To, Delete, Revert to Saved, Save All).
2. Format/Paragraph menu completeness (Underline?, Highlight, Sub/Sup, Clear
   Format; dedicated Paragraph menu; Indent/Outdent, Increase/Decrease heading).
3. Edit/View additions (Paste as Plain, smart-punctuation toggle, Jump to
   Top/Bottom, Show Status Bar, Always on Top).
4. Print + Page Setup.
5. Preferences expansion (the settings toggles above).
(Items marked ❓/SKIP are held for your confirmation.)
