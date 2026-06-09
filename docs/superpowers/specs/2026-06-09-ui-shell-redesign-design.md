# Floating-panel app shell redesign

## Goal

Restyle Lekha's window shell into the approved "floating panels" layout: a
full-height rounded **sidebar** beside a **content column** whose tab strip,
editor card, and status bar are separate rounded panels sitting on a compact
window-background gutter. The change is **layout + styling only** - no editor,
file, or document behavior changes - and must keep every existing feature.

Approved mockup: `.superpowers/brainstorm/.../shell-v3.html`.

## Layout

Today: `.app` is a vertical stack (full-width `TitleBar` / `.workspace`
[`Sidebar` | editor] / full-width `StatusBar`).

New: `.app` becomes a horizontal flex row painted with the window-background and
a small padding gutter.

```
.app  (flex row, background var(--window-bg), padding var(--shell-gap), gap var(--shell-gap))
├── .sidebar            full-height rounded panel (bg --surface, radius --radius-lg)
│   ├── .sidebar__chrome   reserved top strip for macOS traffic lights (drag region)
│   ├── .sidebar__header   "FILES" / "OUTLINE" / ...
│   ├── panel body         FileTree | Outline | Articles | FolderSearch
│   └── .sidebar__tabs      Files / Outline / Articles / Search switcher (unchanged)
│   └── SidebarResizer      (unchanged; resizes width)
└── .content-col        flex column, gap --shell-gap, min-width 0
    ├── .tab-strip         always-visible rounded tab pills + "+" (drag region; tabs no-drag)
    ├── notices            external-change / recovery banners (relocated here, rounded)
    ├── .content-card      rounded panel (bg --bg, radius --radius-lg, overflow hidden) wrapping EditorPane
    └── .status-bar        rounded, content-width (unchanged component/selectors)
```

## Tokens (DRY, theme-overridable)

- `--window-bg`: the gutter backdrop behind the panels. Default derives from the
  theme so every theme works without edits:
  `--window-bg: color-mix(in srgb, var(--surface) 92%, #000);`
  Midnight overrides it to its Etherscan-darker shade (`#10151d`).
- `--shell-gap`: panel gutter/gap. Default `6px`.
- Panel radius reuses the existing `--radius-lg`; tab pills reuse `--radius`.

No new hardcoded colors; the lone window chrome already token-driven.

## Components

- **Remove `TitleBar`** (and its test). Its three roles are re-homed: the doc
  title now lives in the tab pill, the dirty state is already shown by the tab
  (italic + dot) and the OS edited-dot, and the window drag region moves to
  `.sidebar__chrome` + `.tab-strip`. macOS traffic lights are reserved by
  `.sidebar__chrome`. (Implementation note: `titleBarStyle` became `'hidden'`
  with an explicit `trafficLightPosition` so the lights align to the floating
  sidebar strip; when the sidebar is hidden the tab strip reserves that width.)
- **`TabBar`**: a persistent shell element - always rendered, even with zero or
  one document open, so the layout never shifts and the new-tab button is always
  available. Styling becomes rounded pills via CSS only.
- **`StatusBar`**: unchanged component; only its container moves into the content
  column and gets the rounded panel styling. Class names/selectors preserved.
- **`Sidebar`**: add the `.sidebar__chrome` top strip; everything else unchanged.

## Drag regions

`.sidebar__chrome` and `.tab-strip` get `-webkit-app-region: drag`; every
interactive child (tabs, "+", buttons) keeps/gets `no-drag`.

## Tests

- Update `tabBar.test.tsx`: a single open document now renders one tab (not null);
  zero documents still renders nothing.
- Update the 4 `app.spec.ts` `.tab-bar` count assertions to the always-visible
  behavior (1 doc -> count 1).
- Remove `titleBar.test.tsx` with the component.
- Keep all `.status-bar*` selectors and behavior.

## Non-goals

No changes to editor engine, file ops, themes' colors (beyond adding
`--window-bg`), commands, or persistence. Sidebar resize, panels, find, tabs
selection/close all keep working.

## Verification

Full gate (typecheck, lint, unit, e2e, build) green; manual look in the dev app
matches the approved mockup; feature smoke (open folder, switch panels, tabs
open/close/switch, source toggle, resize sidebar, find).
