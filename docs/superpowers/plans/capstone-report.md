# Lekha - WYSIWYG-Parity Campaign Capstone Report

Final review of the autonomous WYSIWYG-parity campaign. Lekha is an
Electron + React + ProseMirror WYSIWYG Markdown editor. This report summarizes
what shipped, the final architecture, the hardening work, the test/quality
posture, and the consciously-deferred items.

**Status: polished and shippable.** Suite green at **1362 unit tests + 9 e2e**;
`typecheck`, `lint`, `test`, and `test:e2e` all pass. Every change reached
`staging` through a feature-branch -> PR -> rebase-merge -> ff-only flow
(linear history); `main` was never touched.

---

## 1. Features shipped this campaign

### Document Tabs (waves 23a-23d)
Multi-document editing with a WYSIWYG-style tab strip.
- **23a** `documentsStore` - the open-tab collection (`DocumentTab` {id, path,
  title, markdown, isDirty, eol, mode} + `activeId`) with pure reducers
  (`openDocument` de-dupes by path, `closeDocument` left-neighbour activation,
  `pickNeighbourId`, `nextTabId`). Extracted `@shared/pathTitle`.
- **23b** `TabBar` presentational component (title, dirty indicator, close,
  `+`); hidden at <=1 doc; middle-click close.
- **23c** wired into `useFileOps`/App: open routes through tabs (reuse a blank
  Untitled, else add a tab), per-tab save guard on close, snapshot/restore of
  the live editor on switch. Open/New no longer prompt - the guard moved to
  per-tab close + app quit.
- **23d** persistence (`Settings.openTabPaths`/`activeTabPath`, restored on
  launch) + keyboard/Window menu (Ctrl+Tab / Ctrl+Shift+Tab / Cmd+W).

### Design System (waves 24a-24b)
A single, documented, modular token contract.
- **24a** extracted `styles/tokens.css` - Layer 1 palette (`--gh-*`) + Layer 2
  semantic tokens (`--bg`/`--text`/`--accent`/editor layout/fonts/shadows) +
  `--color-*` aliases. `github.css` reduced to component rules only; `global.css`
  to the structural skeleton. Export (`buildHtml`) inlines `tokens.css`.
- **24b** documented `_template.css` starter (now `DEFAULT_TEMPLATE_CSS`);
  verified all built-in themes are token-only `[data-theme]` blocks.

### Custom Themes (waves 25a-25c)
User-authored themes loaded at runtime (WYSIWYG-style).
- **25a** main process: `userData/themes` folder seeded with the template on
  first run; `themes:list`/`reload`/`openFolder` IPC; metadata parser
  (`@name`/`@type`).
- **25b** renderer: `injectUserThemes` writes one managed `<style>` (escaped),
  `applyTheme` accepts user ids, startup injects before applying the saved theme.
- **25c** Theme menu lists user themes + Open Theme Folder / Reload Themes
  (AppCommands too).

### Earlier parity waves (1-22)
Menu/settings parity, line endings (LF/CRLF), Selection submenu + macOS
Speech/Emoji roles, a dedicated Paragraph menu with Indent/Outdent and
heading promote/demote, smart-punctuation toggle, underline, and the broad
WYSIWYG-fidelity polish recorded in `wysiwyg-parity-ledger.md`.

---

## 2. Hardening (campaign item 4)

Two adversarially-verified parallel audit workflows drove the hardening phase.

### Round 1 - security / performance / UX (55 agents, 19 confirmed)
- **Wave 26** a11y: `:focus-visible` rings for sidebar tabs, status bar,
  dialogs, outline, file-tree rows.
- **Wave 27** security: reject theme symlinks via `lstat`; add
  `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY`.
- **Wave 28** perf: stop per-keystroke `documents` array churn (flip `isDirty`
  once; snapshot markdown lazily).
- **Wave 29** UX: error feedback on open/reload failure; dead-theme -> github
  fallback; dirty-tab italic title.
- **Wave 30** a11y: dialog focus-return (in `useFocusTrap`, shared by all
  dialogs) + WAI-ARIA TabBar keyboard nav (roving tabindex, arrows/Home/End).

Tally: 15 fixed, 1 root-cause-resolved, 3 reasoned-deferred.

### Round 2 - correctness bug-hunt (33 agents, 16 confirmed)
- **Wave 31** serializer round-trip data loss: table-cell backslash
  exponential growth (double-escape removed) + escaped-`$` re-parsed as math
  (`escapeExtraCharacters: /\$/g`).
- **Wave 32** perf: derive outline/word-count from the live ProseMirror doc
  instead of re-parsing the markdown string each keystroke.
- **Wave 33** tabs: `documentsStore.updatePath` keeps tab paths correct on
  rename/move (exact + folder-prefix); `moveCurrentTo` updates in place
  (no duplicate tab / no lost edits). Verified no save-guard race; verified
  open-failure can't clobber the blank tab.
- **Wave 34** themes: drop user themes whose id collides with a built-in;
  scope metadata parsing to the leading comment; case-insensitive id dedupe.

Tally: 9 fixed, 2 verified-already-safe, 5 reasoned-deferred.

Full finding-by-finding detail (including the baseline posture) lives in
`hardening-rounds.md`.

---

## 3. Final architecture

- **Main process** (`src/main`): hardened Electron shell (contextIsolation +
  sandbox + nodeIntegration:false), CSP + security headers, allow-listed
  `window.lekha` preload bridge, IPC handler modules (`ipc/*`), settings store,
  native menu builder, file ops, user-themes loader, spell-check, updater,
  multi-window registry + close guard.
- **Renderer** (`src/renderer`): React 19 + zustand. `editorStore`
  (active doc) + `documentsStore` (tab set) + `workspaceStore`. ProseMirror
  WYSIWYG engine (`editor/*`): schema, input rules, keymap, the
  `editorCommandMap`/`tableCommandMap` DRY command maps, a custom
  `MarkdownSerializer`, markdown-it parser, themes registry + injection.
  Command palette + slash menu + native menu all route through one
  `useCommands` dispatch + the command `registry`.
- **Shared** (`src/shared`): `commands` (AppCommand union), `ipc-channels`,
  `types` (Settings, ThemeDef/UserTheme), `eol`, `pathTitle`.
- **Styling**: `tokens.css` (contract) -> `global.css` (skeleton) ->
  `themes/*.css` (token-only) -> user themes (runtime-injected).
- **Tests**: 1362 unit (vitest + happy-dom + Testing Library) + 9 e2e
  (Playwright `_electron`), across 98 files.

---

## 4. Security posture (verified)

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- CSP: `default-src 'self'`, `script-src 'self'`, `connect-src 'self'`,
  `img-src 'self' data: file: blob:` (no remote http), `object-src 'none'`,
  `frame-src 'none'`; plus `X-Content-Type-Options: nosniff` and
  `X-Frame-Options: DENY`.
- Custom themes are **local-trust** (like WYSIWYG) but defensively contained:
  CSS is injected via `textContent` (no HTML parse) with `</style>` escaped;
  the CSP blocks `url()` beaconing and any network; the themes folder scan uses
  `lstat` so symlinks can't be followed into arbitrary files; user theme ids
  can't shadow built-ins.
- All renderer IPC goes through the narrow, typed preload allow-list.

---

## 5. Deferred items (with rationale)

These were confirmed by the audits but consciously NOT changed - each would add
risk or complexity out of proportion to its value:

- **Round 1**: combobox `aria-expanded` semantics (cosmetic); close-last-tab
  leaves a blank Untitled (intentional WYSIWYG behavior); a one-off MarkdownIt
  escape micro-optimization (negligible).
- **Round 2**: empty-text links `[](url)` vanish (links are ProseMirror *marks*;
  preserving empty-text links needs a schema change for a pathological, rare
  input); reference-links normalize to inline (lossy but idempotent, and the
  standard WYSIWYG behavior WYSIWYG also exhibits); table-cell literal newline
  collapse (unreachable - GFM cells cannot contain literal newlines); HR
  `***`/`___` normalize to `---` (cosmetic and idempotent).
- The `wysiwyg-parity-ledger.md` backlog still lists many `[ ]` items whose work
  actually shipped in earlier waves but whose checkboxes were never ticked; a
  few genuinely-optional niceties (drag-drop file moves in the tree, per-image
  resize handles, regex find) remain as future enhancements, not blockers.

---

## 6. Conclusion

Lekha now has the three headline features requested - **document tabs**, a clean
**design-token system**, and **custom themes** - plus a WYSIWYG-faithful menu and
editing surface, all delivered as small, individually-verified, feature-branch
waves with a consistently green test suite. Two adversarial audit rounds drove
targeted security/perf/a11y/correctness fixes, with the remaining findings
deferred for documented, defensible reasons. The app is in a polished,
shippable state.
