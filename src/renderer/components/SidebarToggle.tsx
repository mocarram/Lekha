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
