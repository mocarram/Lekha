/**
 * themeTemplate.ts (main process)
 *
 * The canonical custom-theme starter. This single string is the source of
 * truth for the `_template.css` file seeded into the user themes folder
 * (userData/themes) on first run. Keeping it here (main scope) avoids a
 * cross-bundle ?raw import from the renderer styles directory.
 *
 * A theme is only a set of design-token overrides scoped to a
 * [data-theme="<id>"] selector (see styles/tokens.css for the full token
 * catalogue). Users copy this file, rename it, set @name/@type, and override
 * the tokens they want.
 */
export const DEFAULT_TEMPLATE_CSS = `/*
 * _template.css - starter for a custom Lekha theme.
 *
 * @name  My Theme
 * @type  dark        (dark | light - hint for the theme picker)
 *
 * HOW THEMES WORK
 * ---------------
 * A theme is JUST a set of design-token overrides scoped to a
 * [data-theme="<your-id>"] selector. You never write component CSS - you only
 * re-assign the semantic tokens (see Lekha's tokens.css). Lekha applies a theme
 * by setting data-theme="<your-id>" on <html>, so your block wins.
 *
 * TO CREATE A THEME
 *   1. Copy this file and rename it (the file name is your theme id, e.g.
 *      "solar-flare.css" -> id "solar-flare"). Files starting with "_" are
 *      treated as templates and are NOT listed as selectable themes.
 *   2. Change the selector below to [data-theme="solar-flare"].
 *   3. Set the @name / @type metadata in the header comment above.
 *   4. Override the tokens you want. Anything you omit inherits the default
 *      (GitHub-light) value, so you only specify what differs.
 *   5. Choose Themes -> Reload Themes, then pick your theme.
 *
 * The values below are the GitHub-light defaults, shown so you can see every
 * token you can override in one place.
 */

[data-theme="my-theme"] {
  /* --- Surfaces --- */
  --bg:              #ffffff;   /* editor / app background */
  --surface:         #fafafa;   /* panels: sidebar, titlebar, statusbar */
  --border:          #ededed;   /* default border color */
  --border-light:    #e1e4e8;   /* lighter border (headings, inputs) */

  /* --- Text --- */
  --text:            #333333;   /* primary body text */
  --text-muted:      #9b9b9b;   /* secondary / de-emphasized text */
  --text-sub:        #6a737d;   /* blockquote / h6 / muted-interactive */
  --text-dark:       #2b2b2b;   /* emphasized text (active items) */
  --text-file:       #4a4a4a;   /* file-tree + outline item text */
  --heading:         #333333;   /* heading color */

  /* --- Accent --- */
  --link:            #4183c4;   /* hyperlinks */
  --accent:          #4183c4;   /* accent / focus (drives selection tints) */

  /* --- Editor content --- */
  --selection:          #d7e4ff;  /* text selection background */
  --code-bg:            #f6f8fa;  /* fenced code block background */
  --code-bg-inline:     #f8f8f8;  /* inline code background */
  --code-text:          #333333;  /* code text */
  --blockquote-text:    #6a737d;  /* blockquote body */
  --blockquote-border:  #dfe2e5;  /* blockquote left border */
  --table-border:       #dfe2e5;  /* table cell borders */
  --table-header-bg:    #f6f8fa;  /* table header / zebra row */
  --hr-color:           #e1e4e8;  /* horizontal rule */

  /* --- Chrome --- */
  --sidebar-bg:      #fafafa;   /* sidebar panel background */
  --sidebar-hover:   #efefef;   /* hovered file/outline row */
  --titlebar-bg:     #fafafa;   /* titlebar background */
  --statusbar-text:  #9b9b9b;   /* status bar text */

  /* --- Find / highlight --- */
  --find-match:         #fff3b0;  /* non-current find highlight */
  --find-match-current: #ffb454;  /* current find match */
  --highlight-bg:       #fff8c5;  /* ==mark== background */
  --highlight-text:     #24292e;  /* ==mark== text */

  /* --- Syntax highlighting --- */
  --hljs-keyword:   #d73a49;
  --hljs-string:    #032f62;
  --hljs-comment:   #6a737d;
  --hljs-function:  #6f42c1;
  --hljs-number:    #005cc5;
  --hljs-tag:       #22863a;
  --hljs-attribute: #e36209;
  --hljs-section:   #005cc5;

  /* --- Typography (font stacks) --- */
  --font-editor: "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono:   "SF Mono", "Consolas", "Liberation Mono", Menlo, monospace;
  --font-ui:     -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;

  /* --- Editor layout (reading column) --- */
  --editor-max-width:   min(1150px, 88%);  /* content column width */
  --editor-font-scale:  1;                 /* multiply the base font size */
  --editor-line-height: 1.7;               /* body line spacing */

  /* --- Semantic (danger / overlays) --- */
  --danger:               #cb2431;
  --on-accent:            #ffffff;          /* text on accent backgrounds */
  --overlay-scrim:        rgba(0, 0, 0, 0.35);
  --overlay-scrim-strong: rgba(0, 0, 0, 0.82);

  /* --- Component-scoped --- */
  --list-indent: 1.6em;   /* list indent (outer + per nested level) */
  --focus-dim:   0.25;    /* opacity of non-focused blocks in Focus Mode */
}
`
