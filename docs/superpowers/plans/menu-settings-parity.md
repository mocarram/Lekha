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

## Edit menu
ADD: Paste as Plain Text, Copy as Plain Text, Smart Punctuation toggle, Jump to
Top / Jump to Bottom, Emoji & Symbols (macOS role). HAVE: Undo/Redo, Cut/Copy/
Paste/SelectAll, Copy as HTML/Markdown, Find/Replace.

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

## Open questions for you (please clarify / screenshot)
1. **Document tabs** (File ▸ New Tab): add real in-window tabs like WYSIWYG, or keep one-doc-per-window?
2. **Reveal in Library** - what should this map to in Lekha?
3. **Share** (macOS share sheet) - include it?
4. **Page Setup** - needed, or is Print sufficient?
5. **Underline** - add a real `<u>` underline mark (not standard Markdown; WYSIWYG stores raw HTML)?

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
