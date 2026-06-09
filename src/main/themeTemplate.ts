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
  --sidebar-bg:        #fafafa;   /* sidebar panel background */
  --sidebar-hover:     #efefef;   /* hovered file/outline row */
  --statusbar-text:    #9b9b9b;   /* status bar text */
  --sidebar-font-size: 16px;      /* file-tree / outline / articles row text */
  /* Scrollbar thumb (sidebar + editor). Use translucent white on dark themes. */
  --scrollbar-thumb:       rgba(0, 0, 0, 0.18);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.32);

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

  /* --- Shape: border-radius scale (set every one to 0 for a square UI) --- */
  --radius-sm:   4px;     /* inputs, chips, inline code, small buttons */
  --radius:      6px;     /* buttons, cards, panels, menu surfaces */
  --radius-lg:   8px;     /* dialogs, toasts, command palette */
  --radius-xl:   10px;    /* image lightbox, large cards */
  --radius-pill: 999px;   /* fully-rounded pills / toggles */

  /* --- Semantic (danger / overlays / elevation) --- */
  --danger:               #cb2431;                  /* error / delete actions */
  --on-accent:            #ffffff;                  /* text on accent backgrounds */
  --on-accent-muted:      rgba(255, 255, 255, 0.82);/* dimmed text on accent */
  --overlay-scrim:        rgba(0, 0, 0, 0.35);      /* modal backdrop */
  --overlay-scrim-strong: rgba(0, 0, 0, 0.82);      /* lightbox backdrop */
  --shadow:               0 8px 32px rgba(0, 0, 0, 0.18);  /* menus, dialogs */
  --shadow-sm:            0 2px 8px rgba(0, 0, 0, 0.14);   /* toolbars */
  --shadow-lg:            0 16px 48px rgba(0, 0, 0, 0.28); /* palette, lightbox */
  --focus-ring:           0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);
  --sidebar-active:       color-mix(in srgb, var(--accent) 14%, transparent); /* active row wash */

  /* --- Chrome metrics (structural; usually left at defaults) --- */
  --titlebar-height:  34px;
  --statusbar-height: 26px;
  --sidebar-width:    240px;   /* default width; the user can still drag-resize */

  /* --- Component-scoped --- */
  --list-indent: 1.6em;   /* list indent (outer + per nested level) */
  --focus-dim:   0.25;    /* opacity of non-focused blocks in Focus Mode */

  /* --- Presentation mode (the slideshow stage). Deliberately dark by default
   *     so slides look the same projected anywhere; override to retheme it. --- */
  --pres-bg:           #1a1a1a;
  --pres-text:         #f0f0f0;
  --pres-heading:      #ffffff;
  --pres-rule:         rgba(255, 255, 255, 0.15);
  --pres-border:       rgba(255, 255, 255, 0.2);
  --pres-code-bg:      rgba(255, 255, 255, 0.08);
  --pres-code-text:    #e0e0e0;
  --pres-quote:        #c0c0c0;
  --pres-quote-border: rgba(255, 255, 255, 0.3);
  --pres-counter:      rgba(255, 255, 255, 0.5);
}

/*
 * ADVANCED (optional) - change more than colors.
 * ----------------------------------------------
 * Tokens above cover colors, fonts, radii, and metrics. To restyle structure
 * the tokens don't expose, your theme file may ALSO contain ordinary CSS rules,
 * as long as every selector is scoped to your [data-theme="..."] so it only
 * applies when your theme is active:
 *
 *   [data-theme="my-theme"] .tab        { text-transform: uppercase; }
 *   [data-theme="my-theme"] .cmdk       { border-width: 2px; }
 *
 * Tokens are the supported, future-proof path; raw rules may need updating if a
 * component's class names change.
 *
 * WORKED EXAMPLE - a soft, rounded, airy look (copy into your block + adapt):
 *
 *   --radius-sm: 8px; --radius: 12px; --radius-lg: 16px; --radius-xl: 20px;
 *   --editor-line-height: 1.85;
 *   --editor-max-width: min(820px, 80%);
 */
`
