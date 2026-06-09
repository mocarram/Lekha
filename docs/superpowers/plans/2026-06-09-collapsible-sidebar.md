# Collapsible Sidebar Toggle Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible top-left button that toggles the sidebar, swapping between a "sidebar shown" and a "sidebar hidden" icon.

**Architecture:** The collapse state, `⌘\` shortcut, native menu item, and persistence already exist in `workspaceStore` + `useStartup`. This plan adds one new presentational component (`SidebarToggle`) that reads `sidebarVisible` and calls the existing `toggleSidebar()`, plus the CSS to pin it at the window's top-left and clear the collapsed tab bar. No store, IPC, or settings changes.

**Tech Stack:** React 18 + TypeScript, Zustand (`workspaceStore`), plain CSS with design tokens, Vitest + @testing-library/react (unit), Playwright Electron (e2e).

---

## Background facts (already true in the codebase, do not re-implement)

- `src/renderer/store/workspaceStore.ts` exposes `sidebarVisible: boolean`, `toggleSidebar()`, `setSidebarVisible(v)`.
- `src/renderer/App.tsx` line ~579 renders the root as
  `<div className={`app${sidebarVisible ? '' : ' app--sidebar-hidden'}`}>` and
  already reads `const sidebarVisible = useWorkspaceStore((s) => s.sidebarVisible)`.
- `src/renderer/components/Sidebar.tsx` returns `null` when `sidebarVisible` is false (line ~111).
- `src/renderer/styles/global.css` has `.app { display: flex; flex-direction: row; ... padding: var(--shell-gap); }` (line ~40), `.app--sidebar-hidden .tab-bar { padding-left: 72px; }` (line ~76), and `.no-drag { -webkit-app-region: no-drag; }` (line ~980).
- macOS traffic lights are configured in `src/main/window.ts`: `titleBarStyle: 'hidden'`, `trafficLightPosition: { x: 16, y: 16 }`. The three buttons end around x:68.
- Inline SVG icon pattern lives in `src/renderer/components/FileTree.tsx` (16x16 viewBox, `aria-hidden="true"`, `currentColor`).
- Component unit tests live in `tests/unit/components/*.test.tsx` and drive `useWorkspaceStore.setState(...)` directly (see `sidebar.test.tsx`).

---

## File structure

- **Create** `src/renderer/components/SidebarToggle.tsx` — the button component (icons + click handler + a11y attributes). One responsibility: reflect and toggle sidebar visibility.
- **Create** `tests/unit/components/sidebarToggle.test.tsx` — unit tests for the component.
- **Modify** `src/renderer/App.tsx` — import and render `<SidebarToggle />` as a direct child of `.app`.
- **Modify** `src/renderer/styles/global.css` — add `.sidebar-toggle` styling; bump `.app--sidebar-hidden .tab-bar` padding so the first tab clears the button.
- **Modify** `tests/e2e/app.spec.ts` — add an e2e test that clicks the button to hide and re-show the sidebar.

---

## Task 1: Create the `SidebarToggle` component (failing test first)

**Files:**
- Create: `tests/unit/components/sidebarToggle.test.tsx`
- Create: `src/renderer/components/SidebarToggle.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/components/sidebarToggle.test.tsx`:

```tsx
/**
 * Tests for SidebarToggle component.
 *
 * SidebarToggle is a single button pinned at the window's top-left. It reads
 * sidebarVisible from useWorkspaceStore, calls toggleSidebar() on click, and
 * swaps its icon + accessible label between the visible and hidden states.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { SidebarToggle } from '../../../src/renderer/components/SidebarToggle'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'

beforeEach(() => {
  useWorkspaceStore.setState({ sidebarVisible: true })
})

afterEach(() => {
  cleanup()
  useWorkspaceStore.setState({ sidebarVisible: true })
})

describe('SidebarToggle', () => {
  it('renders a button', () => {
    const { container } = render(<SidebarToggle />)
    expect(container.querySelector('button.sidebar-toggle')).not.toBeNull()
  })

  it('labels itself "Hide sidebar" and is pressed when the sidebar is visible', () => {
    useWorkspaceStore.setState({ sidebarVisible: true })
    const { getByRole } = render(<SidebarToggle />)
    const btn = getByRole('button', { name: 'Hide sidebar' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('labels itself "Show sidebar" and is not pressed when the sidebar is hidden', () => {
    useWorkspaceStore.setState({ sidebarVisible: false })
    const { getByRole } = render(<SidebarToggle />)
    const btn = getByRole('button', { name: 'Show sidebar' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles sidebarVisible from true to false on click', () => {
    useWorkspaceStore.setState({ sidebarVisible: true })
    const { getByRole } = render(<SidebarToggle />)
    fireEvent.click(getByRole('button'))
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false)
  })

  it('toggles sidebarVisible from false to true on click', () => {
    useWorkspaceStore.setState({ sidebarVisible: false })
    const { getByRole } = render(<SidebarToggle />)
    fireEvent.click(getByRole('button'))
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true)
  })

  it('swaps the icon when visibility changes', () => {
    const { container, rerender } = render(<SidebarToggle />)
    // Visible state shows the "shown" icon (filled left rail uses data attr).
    expect(container.querySelector('[data-state="shown"]')).not.toBeNull()
    useWorkspaceStore.setState({ sidebarVisible: false })
    rerender(<SidebarToggle />)
    expect(container.querySelector('[data-state="hidden"]')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- sidebarToggle`
Expected: FAIL — module `../../../src/renderer/components/SidebarToggle` cannot be resolved (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/renderer/components/SidebarToggle.tsx`:

```tsx
import { useWorkspaceStore } from '@renderer/store/workspaceStore'

// ---------------------------------------------------------------------------
// Panel icons (16x16, Octicon-style, inherit currentColor). The left rail is
// filled when the sidebar is shown and an outline when it is hidden, so the
// button's glyph reflects the current state at a glance.
// ---------------------------------------------------------------------------

/** Panel glyph with a FILLED left rail — shown while the sidebar is visible. */
function PanelShownIcon() {
  return (
    <svg
      data-state="shown"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M6 2.75V13.25" />
      <rect x="1.75" y="2.75" width="4.25" height="10.5" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Panel glyph with an EMPTY left rail — shown while the sidebar is hidden. */
function PanelHiddenIcon() {
  return (
    <svg
      data-state="hidden"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      <path d="M6 2.75V13.25" />
    </svg>
  )
}

/**
 * SidebarToggle is a single button pinned at the window's top-left (just right
 * of the macOS traffic lights). It reflects and toggles sidebar visibility.
 *
 * The collapse state itself lives in workspaceStore and is also driven by the
 * Cmd+\ shortcut and the View > Toggle Sidebar menu item; this button shares
 * that single source of truth, so all three stay in sync automatically.
 */
export function SidebarToggle() {
  const sidebarVisible = useWorkspaceStore((s) => s.sidebarVisible)
  const label = sidebarVisible ? 'Hide sidebar' : 'Show sidebar'
  return (
    <button
      type="button"
      className="sidebar-toggle no-drag"
      aria-label={label}
      title={label}
      aria-pressed={sidebarVisible}
      onClick={() => { useWorkspaceStore.getState().toggleSidebar() }}
    >
      {sidebarVisible ? <PanelShownIcon /> : <PanelHiddenIcon />}
    </button>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- sidebarToggle`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SidebarToggle.tsx tests/unit/components/sidebarToggle.test.tsx
git commit -m "feat(sidebar): add SidebarToggle button component"
```

---

## Task 2: Mount the button in App and style it

**Files:**
- Modify: `src/renderer/App.tsx` (import + render inside `.app`)
- Modify: `src/renderer/styles/global.css` (add `.sidebar-toggle`; bump collapsed tab-bar padding)

- [ ] **Step 1: Import the component in `App.tsx`**

In `src/renderer/App.tsx`, add this import next to the other component imports (e.g. just after the `Sidebar` import on line ~21):

```tsx
import { SidebarToggle } from '@renderer/components/SidebarToggle'
```

- [ ] **Step 2: Render the button as the first child of `.app`**

In `src/renderer/App.tsx`, the root return currently begins (line ~578):

```tsx
  return (
    <div className={`app${sidebarVisible ? '' : ' app--sidebar-hidden'}`}>
      <Sidebar
```

Change it to render `<SidebarToggle />` before `<Sidebar>`:

```tsx
  return (
    <div className={`app${sidebarVisible ? '' : ' app--sidebar-hidden'}`}>
      <SidebarToggle />
      <Sidebar
```

- [ ] **Step 3: Add the button CSS**

In `src/renderer/styles/global.css`, add the following block immediately after the `.app` rule (it ends near line ~52, just before the `.sidebar` / `.sidebar__chrome` section). Paste it as its own block:

```css
/* ---------------------------------------------------------------------------
 * Sidebar toggle button: pinned at the window's top-left, just right of the
 * macOS traffic lights (configured at x:16 in window.ts; the three buttons end
 * ~x:68). Positioned against the app root so it occupies the SAME spot whether
 * the sidebar is open (overlaying .sidebar__chrome) or closed (overlaying the
 * tab bar's reserved left zone) — it never jumps. no-drag makes it clickable
 * inside the surrounding drag region.
 * --------------------------------------------------------------------------- */
.sidebar-toggle {
  position: absolute;
  top: 13px;
  left: 80px;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm, 5px);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.12s ease, background-color 0.12s ease;
}

.sidebar-toggle:hover {
  color: var(--color-text);
  background-color: var(--sidebar-hover);
}
```

- [ ] **Step 4: Bump the collapsed tab-bar padding so the first tab clears the button**

In `src/renderer/styles/global.css`, find (line ~76):

```css
.app--sidebar-hidden .tab-bar {
  /* Clear the OS traffic lights (x:16 + three buttons) on the now-leftmost
     strip. The padding stays a drag region; the lights sit over empty space. */
  padding-left: 72px;
}
```

Change `padding-left: 72px;` to `padding-left: 116px;` and update the comment to mention the toggle button:

```css
.app--sidebar-hidden .tab-bar {
  /* Clear the OS traffic lights (x:16 + three buttons) AND the sidebar-toggle
     button (left:80px, width:26px) on the now-leftmost strip. The padding stays
     a drag region; the lights + toggle sit over it. */
  padding-left: 116px;
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/styles/global.css
git commit -m "feat(sidebar): mount + style the toggle button at top-left"
```

---

## Task 3: e2e — clicking the button hides and re-shows the sidebar

**Files:**
- Modify: `tests/e2e/app.spec.ts` (append a new test)

- [ ] **Step 1: Add the e2e test**

In `tests/e2e/app.spec.ts`, append this test at the end of the file (after the last `test(...)` block). It reuses the shared `sharedWin` page already launched in `beforeAll`:

```ts
// ---------------------------------------------------------------------------
// Test: sidebar toggle button hides and re-shows the sidebar
// ---------------------------------------------------------------------------

test('sidebar toggle button collapses and restores the sidebar', async () => {
  const win = sharedWin

  // Baseline: the sidebar and the toggle button are both present.
  await expect(win.locator('.sidebar')).toBeVisible()
  const toggle = win.locator('.sidebar-toggle')
  await expect(toggle).toBeVisible()

  // Click to hide: the sidebar unmounts and the root gains the modifier class.
  await toggle.click()
  await expect(win.locator('.sidebar')).toHaveCount(0)
  await expect(win.locator('.app.app--sidebar-hidden')).toHaveCount(1)
  // The button itself stays put and is still clickable.
  await expect(toggle).toBeVisible()

  // Click to show: the sidebar comes back and the modifier class is removed.
  await toggle.click()
  await expect(win.locator('.sidebar')).toBeVisible()
  await expect(win.locator('.app.app--sidebar-hidden')).toHaveCount(0)
})
```

- [ ] **Step 2: Build the app (e2e runs the production build)**

Run: `npm run build`
Expected: PASS — `out/` is produced with no errors.

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS — all existing tests plus the new "sidebar toggle button collapses and restores the sidebar" test pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/app.spec.ts
git commit -m "test(e2e): cover sidebar toggle button hide/show"
```

---

## Task 4: Full verification gate

- [ ] **Step 1: Run the complete gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`
Expected: all green. The unit suite includes the new `sidebarToggle` tests; e2e includes the new toggle test.

- [ ] **Step 2: Manual visual check (dev build) across themes**

Run: `npm run dev`, then in the app:
- Confirm the toggle button sits just right of the traffic lights and does not overlap them.
- Click it: the sidebar collapses; the button stays in the exact same spot; the first tab does not slip under the button.
- Click it again: the sidebar returns.
- Press `⌘\`: confirm the button's icon updates (shared state with the shortcut).
- Switch a couple of themes (e.g. github light, midnight, high-contrast) and confirm the button is legible and its hover state reads in each.

- [ ] **Step 3: No commit** (verification only). If the manual check surfaces a pixel nudge (e.g. `top`/`left`), make the fix in `global.css`, re-run Step 1, and commit with `fix(sidebar): nudge toggle button position`.

---

## Self-review notes (for the implementer)

- The component imports `useWorkspaceStore` via the `@renderer` path alias (matches every other component, e.g. `Sidebar.tsx`).
- The icon glyph is selected by `sidebarVisible`; the unit test asserts both the `data-state` attribute swap and the `aria-label`/`aria-pressed` swap, so the two icons and the a11y state can never silently diverge.
- `--radius-sm` and `--sidebar-hover` are existing tokens (used by `.sidebar__tab-btn:hover`). `--radius-sm` has a `5px` fallback in case a theme omits it.
- No changes to `workspaceStore`, settings, IPC, the `⌘\` command, or the native menu — those already drive `toggleSidebar()` and stay in sync with the button for free.
```