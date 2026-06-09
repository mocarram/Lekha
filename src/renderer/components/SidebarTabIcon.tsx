/*
 * SidebarTabIcon - the small glyph shown above each bottom sidebar tab label
 * (Files / Outline / Articles / Search).
 *
 * Monochrome inline SVGs (16x16 viewBox, rendered ~18px) that inherit
 * `currentColor`, so they tint with the tab button's state (muted by default,
 * --color-text on hover, --color-accent when active) without any per-icon
 * color rules. aria-hidden because the adjacent text label is the accessible
 * name. Matches the inline-SVG convention used by FileTree.tsx.
 */

export type SidebarTab = 'files' | 'outline' | 'articles' | 'search'

interface SidebarTabIconProps {
  tab: SidebarTab
}

export function SidebarTabIcon({ tab }: SidebarTabIconProps) {
  const common = {
    className: 'sidebar__tab-icon',
    width: 18,
    height: 18,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (tab) {
    case 'files':
      // Outline folder with a tab.
      return (
        <svg {...common}>
          <path d="M1.75 4.4h3.4l1.2 1.25h6.95c.4 0 .7.32.7.72v6.18c0 .4-.3.72-.7.72H1.75a.7.7 0 0 1-.7-.72V5.12c0-.4.3-.72.7-.72z" />
        </svg>
      )
    case 'outline':
      // Bulleted list (table-of-contents look).
      return (
        <svg {...common}>
          <circle cx="2.9" cy="4" r="0.95" fill="currentColor" stroke="none" />
          <line x1="5.8" y1="4" x2="14" y2="4" />
          <circle cx="2.9" cy="8" r="0.95" fill="currentColor" stroke="none" />
          <line x1="5.8" y1="8" x2="14" y2="8" />
          <circle cx="2.9" cy="12" r="0.95" fill="currentColor" stroke="none" />
          <line x1="5.8" y1="12" x2="11.5" y2="12" />
        </svg>
      )
    case 'articles':
      // Document/page with text lines.
      return (
        <svg {...common}>
          <rect x="3" y="1.9" width="10" height="12.2" rx="1.3" />
          <line x1="5.5" y1="5.2" x2="10.5" y2="5.2" />
          <line x1="5.5" y1="8" x2="10.5" y2="8" />
          <line x1="5.5" y1="10.8" x2="9" y2="10.8" />
        </svg>
      )
    case 'search':
      // Magnifier.
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.25" />
          <line x1="10.4" y1="10.4" x2="14" y2="14" />
        </svg>
      )
  }
}
