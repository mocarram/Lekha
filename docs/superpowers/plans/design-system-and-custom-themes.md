# Design System & Custom Themes - Architecture Plan

Goal: make Lekha **fully themable and customizable** with a clean, modular
design system (no "diabolical" sprawl), then expose **custom/importable themes**.

## Current state (already decent)

- `styles/themes/github.css` holds TWO token layers in `:root`:
  - Layer 1: palette constants (`--gh-*`)
  - Layer 2: semantic design tokens (`--bg`, `--text`, `--accent`, `--editor-*`, …)
- Component CSS uses only Layer-2 tokens.
- Each theme = a `[data-theme="id"]` block overriding Layer-2 tokens
  (night, graphite, sepia, nord, solarized-*).
- `applyTheme(id)` sets `data-theme` on `<html>`; all theme CSS is bundled.

The bones are good. The problems to fix for a clean system:
1. The **token contract is buried** inside github.css mixed with component rules.
2. Component CSS is split across `global.css` (structural) + `github.css`
   (themed) - the boundary is fuzzy.
3. No **documented, enumerated token catalogue** a theme author can target.
4. No way to load **user-authored themes** at runtime.
5. Export (`buildHtml.ts`) inlines `github.css?raw` - must keep working.

## Target architecture

```
styles/
  tokens.css        // THE contract: :root { all Layer-2 design tokens + defaults }
                    //   (palette constants collapse into the token defaults here)
  base.css          // structural layout skeleton (from global.css)
  components.css     // all token-driven component rules (chrome, dialogs, editor…)
  editor.css        // ProseMirror/editor typography + content rules
  themes/
    _template.css   // documented starter a custom theme copies (only tokens)
    github.css      // [data-theme="github"] (or :root default) token overrides
    night.css, graphite.css, sepia.css, nord.css, solarized-*.css  // token-only
```

Principles:
- **One token contract** (`tokens.css`) with every token + its default and a
  one-line doc comment. Themes ONLY ever set tokens - never component selectors
  (except rare, documented escape hatches like scrollbar tints).
- Built-in themes become pure token files (most already are; github.css gets
  split so its component rules move to components.css/editor.css).
- Token categories: surface, text, accent, editor-content, code/syntax,
  chrome (sidebar/titlebar/statusbar), find, semantic (danger/overlay/shadow),
  layout (`--editor-max-width`/`--editor-font-scale`/`--editor-line-height`),
  typography (font stacks).

## Custom themes (after the refactor)

- **User theme folder**: `userData/themes/*.css`. Each file defines
  `[data-theme="<id>"] { --token: value; … }` plus an optional metadata header
  comment (`/* @name Solar Flare @type dark */`).
- **Main process**: a `themes:list` IPC scans the folder, parses metadata,
  returns `{id, label, type, css}`; `themes:openFolder` reveals it;
  `themes:reload` re-scans.
- **Renderer**: merge user themes into the THEMES registry; inject their CSS
  into a managed `<style data-user-themes>` element; add them to the Theme menu.
  `_template.css` is copied into the folder on first run as a starting point.
- **Menu**: Themes ▸ "Open Theme Folder", "Reload Themes".
- **Safety**: user CSS is style-only (no script execution). Under the existing
  CSP, remote `url()` is already restricted. Strip/escape `</style>` when
  injecting. Document that themes are local-trust.

## Migration safety

- Pure CSS reorg + token extraction must be **visually identical** - verify with
  screenshots across all themes before/after.
- Keep `buildHtml.ts` export working: it can inline `tokens.css` + `editor.css`
  + `components.css` (the parts export needs) instead of github.css.
- Do it in small, separately-verified waves: (1) extract tokens.css with no
  visual change; (2) split components/editor css; (3) convert themes to
  token-only; (4) add user-theme loading; (5) add `_template.css` + menu + docs.

## Sequencing vs the menu/settings work

Menu/settings parity (`menu-settings-parity.md`) lands first (user
priority), then this design-system refactor, then custom themes - each as
audit-backed, verified, feature-branch → staging waves logged in the ledger.
