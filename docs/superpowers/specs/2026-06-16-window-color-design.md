# Window Color (per-folder marker) - Design Spec

Date: 2026-06-16
Status: approved

## Goal

Let users mark a window with a real, solid color so multiple Lekha windows -
typically one per project folder - are distinguishable at a glance. Inspired by
VS Code's Peacock, adapted to Lekha's folder-oriented, multi-window model.

## The marker

A theme-independent solid color **rail**: a 4px bar pinned to the very top edge
of the window, full width.

- It sits above the macOS traffic lights (which start lower at y:15), so there
  is no collision, and it follows the OS rounded window corners.
- Driven by a single CSS custom property `--window-color` on the document root
  (same single-writer pattern as `--zoom-factor`): when set, the rail is visible
  in that color; when unset, there is no rail and layout is unchanged.
- The color is a raw hex applied outside the theme token system, so it looks
  identical on every theme (github / night / sepia / user themes).

Chosen over a full tab-bar fill or full top-band fill because the rail never
competes with tab text and needs no per-color contrast computation.

## What the color is attached to

A new **global** settings slice:

```
folderColors: Record<string, string>   // absolute folder path -> hex (#rrggbb)
```

- Global (not session-gated, like `theme`): any window that opens folder X reads
  X's color, so reopening a project anywhere restores its marker.
- On folder open / restore: look up `folderColors[rootFolder]` and apply.
- On set while a folder is open: persist under that folder's path; "None"
  deletes the key.
- A **folderless** scratch window may still set a color, but it is ephemeral
  (held in the workspace store only, never written). Opening a folder then
  switches to that folder's stored color (or none).

## Picking a color

Right-click **empty tab-bar space** (not a tab - the existing tab context menu
still owns tabs) opens a small popup, reusing the existing token-themed menu
styling:

- A row of **8 curated swatches**: red, orange, amber, green, teal, blue,
  violet, pink (vivid mid-tones that read on both light and dark themes).
- **Custom…** - opens the native OS color picker via a hidden
  `<input type="color">` (no new dependency).
- **None** - clears the window's color.

The same action is exposed as a **"Set Window Color"** command in the command
palette for keyboard users (opens the same popup).

## Architecture and data flow

- `workspaceStore` gains `windowColor: string | null` + `setWindowColor`.
- `applyWindowColor(color)` (single writer) sets/removes `--window-color` on
  `document.documentElement`, mirroring `chromeZoom.ts`.
- Folder open/restore (useStartup + openFolderPath) reads `folderColors[path]`
  and calls `setWindowColor` + `applyWindowColor`.
- A dedicated main IPC `setFolderColor(path, hex | null)` performs an **atomic
  read-modify-write** on the single map key in the settings store. Main is
  single-threaded, so two windows mutating different keys cannot clobber each
  other's entries (avoids whole-map last-writer-wins if we patched via
  setSettings). Reads piggyback on the existing `getSettings`.
- A small pure module `windowColor.ts` (shared) holds the swatch palette
  constant and `normalizeWindowColor(raw): string | null` - validates a
  `#rrggbb` hex and defends against corrupt persisted values.

## Components / files

- Create: `src/shared/windowColor.ts` - palette + hex validator (pure).
- Create: `src/renderer/windowColor.ts` - `applyWindowColor()` CSS-var writer.
- Modify: `src/shared/types.ts` - `Settings.folderColors: Record<string,string>`.
- Modify: `src/main/settings.ts` - default `folderColors: {}`.
- Modify: `src/shared/ipc-channels.ts` + `src/main/index.ts` - `setFolderColor` IPC.
- Modify: `src/preload/index.ts` + `src/preload/api.d.ts` - bridge method.
- Modify: `src/renderer/store/workspaceStore.ts` - `windowColor` + setter.
- Modify: `src/renderer/components/TabBar.tsx` - right-click-empty-space color
  menu (swatches + Custom + None).
- Modify: `src/renderer/hooks/useStartup.ts` + `useFileOps.ts` - apply on folder
  open/restore; persist on set.
- Modify: `src/shared/commands.ts` + command palette wiring - "Set Window Color".
- Modify: `src/renderer/styles/global.css` - the `.window-rail` (or root
  `::before`) rule gated on `--window-color`.

## Testing

- Unit: `normalizeWindowColor` (valid / invalid / null); palette constant shape;
  workspace store set/clear; `applyWindowColor` sets/removes the var; the
  tab-bar color menu picks a swatch (sets color + calls `setFolderColor`) and
  None clears.
- e2e: set a color on a folder window, open the same folder in a second window
  -> the rail comes back in that color; clear -> rail gone. The rail element is
  present/absent and carries the expected background color.

## Out of scope (v1)

- Auto-deriving a color from the folder name ("surprise me").
- Tinting any surface beyond the rail (tab bar fill, sidebar, status bar).
- Syncing colors across machines.
