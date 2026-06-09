# Collapsible Sidebar Toggle Button - Design

**Date:** 2026-06-09
**Branch:** `feat/collapsible-sidebar`
**Status:** Approved

## Summary

Add a visible, on-screen button that lets the user hide and show the sidebar
with a click. The collapse/expand state machinery already exists in full; this
feature only adds the missing UI affordance.

## Background: what already exists

The sidebar can already be toggled - it just has no on-screen button:

- `workspaceStore` holds `sidebarVisible: boolean` plus `toggleSidebar()` and
  `setSidebarVisible(v)`.
- The state is persisted across restarts (`settings.ts` default
  `sidebarVisible: true`; `useStartup` restores it and writes changes back via a
  debounced `setSettings`).
- A `⌘\` keyboard shortcut (`toggleSidebar` command) and a native **View →
  Toggle Sidebar** menu item both flip the same store value.
- `App.tsx` already applies an `app--sidebar-hidden` class to the root when the
  sidebar is hidden. The CSS for that modifier already reserves macOS
  traffic-light space on the tab bar (`padding-left: 72px`) and re-anchors the
  word-count popover.
- When hidden, `<Sidebar>` returns `null` (instant show/hide, no animation).

Because every entry point drives the same store value, a new button, the
shortcut, and the menu item all stay in sync automatically.

## Goals

- A single clickable button that toggles the sidebar.
- The button lives in **one fixed place** (top-left, next to the traffic lights)
  and never moves between the open and closed states.
- The button shows **two icons**: one indicating the sidebar is visible, one
  indicating it is hidden.
- Instant toggle (no animation), matching current behavior.

## Non-goals (YAGNI)

- No slide/width animation - the sidebar keeps appearing/disappearing instantly.
- No new persisted setting (reuses `sidebarVisible`).
- No change to the `⌘\` shortcut or the native menu item.
- No second control inside the sidebar.

## Design

### New component: `SidebarToggle`

New file `src/renderer/components/SidebarToggle.tsx`. A small, focused button
component with one job: reflect and toggle sidebar visibility.

- Subscribes to `sidebarVisible` from `workspaceStore`.
- On click, calls `useWorkspaceStore.getState().toggleSidebar()`.
- Renders one of two inline SVG icons depending on `sidebarVisible`.
- `title` and `aria-label` describe the **action**: `"Hide sidebar"` when
  visible, `"Show sidebar"` when hidden.
- `aria-pressed={sidebarVisible}` so assistive tech reports the toggle state.
- `type="button"` and class `no-drag` (so it is clickable inside the drag strip).

Rendered as a direct child of the `.app` root in `App.tsx`, alongside (not
inside) the `<Sidebar>` and `.content-col`, so its position is independent of
whether the sidebar is mounted.

### Placement - one fixed spot

The button is absolutely positioned against the app root at the window's
top-left, just right of the macOS traffic lights. The lights sit at `x:16`
(three buttons, ending ~`x:68`), so the toggle anchors at roughly `left: 74px`
with its vertical center aligned to the traffic-light row (the
`.sidebar__chrome` strip is `36px` tall; the lights are at `y:16`).

Because it is pinned to the root, it occupies the **same screen coordinates in
both states**:

- **Sidebar open:** the button overlays the sidebar's top chrome strip
  (`.sidebar__chrome`, an empty 36px drag region above the "Files" header). The
  sidebar is 240px wide, so the button is comfortably inside it and clear of the
  tabs (which start after the sidebar).
- **Sidebar closed:** the button overlays the tab bar's reserved left zone.

Styling notes:

- `-webkit-app-region: no-drag` on the button (the surrounding strip stays a
  drag region).
- A z-index above the sidebar/tab-bar panels but below modal overlays and their
  scrims, so dialogs always cover it.
- Hover/active styling consistent with existing chrome buttons (subtle
  background on hover, theme-token colors).

### CSS adjustment for the collapsed state

The only layout tweak: increase `.app--sidebar-hidden .tab-bar` `padding-left`
from `72px` to about `104px` so the first tab clears the toggle button when the
sidebar is collapsed. The open state needs no tab change, since tabs already
begin to the right of the 240px sidebar.

### Icons

Two inline `16x16` SVGs in the Octicon style already used by `FileTree.tsx` (no
new dependency): a panel/sidebar rectangle whose left rail is **filled** when the
sidebar is visible and **empty (outline only)** when it is hidden. This makes the
current state legible at a glance while the tooltip states the action.

## State and data flow

```
click SidebarToggle
  -> workspaceStore.toggleSidebar()
       -> sidebarVisible flips
            -> <Sidebar> mounts/unmounts (returns null when false)
            -> .app root toggles `app--sidebar-hidden`
            -> SidebarToggle re-renders with the other icon + updated label
            -> useStartup's subscription persists the new value (debounced)
```

The `⌘\` shortcut and the **View → Toggle Sidebar** menu item flow into the same
`toggleSidebar()`, so the button's icon updates regardless of which entry point
was used.

## Testing

- **Unit** (`tests/unit/components/sidebarToggle.test.tsx`):
  - renders a button with an accessible label;
  - clicking it calls `toggleSidebar` / flips `sidebarVisible`;
  - the icon, `aria-label`/`title`, and `aria-pressed` change between the
    visible and hidden states.
- **e2e:** clicking the button hides the sidebar; clicking again restores it;
  the `⌘\` path still works alongside the button.
- Full gate before merge: typecheck, lint, unit, build, e2e.

## Risks

- **Overlap with traffic lights / first tab:** mitigated by the fixed offset
  (~74px) and the bumped collapsed tab-bar padding (~104px). Verify visually
  across themes.
- **Drag region:** the button must be `no-drag` or it will be unclickable;
  covered above and by the e2e click test.
- **z-index vs. overlays:** keep the button below modal scrims so dialogs cover
  it.
