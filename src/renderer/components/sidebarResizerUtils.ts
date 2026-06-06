/**
 * sidebarResizerUtils.ts - Pure utilities for the sidebar drag-resize feature.
 *
 * Extracted into a non-component file so the react-refresh fast-reload plugin
 * does not warn about mixed component+function exports, and so this can be
 * imported from both SidebarResizer.tsx and tests without DOM dependencies.
 */

/** Minimum sidebar width in pixels. */
export const SIDEBAR_MIN_WIDTH = 160

/** Maximum sidebar width in pixels. */
export const SIDEBAR_MAX_WIDTH = 480

/** Default / reset sidebar width in pixels. */
export const SIDEBAR_DEFAULT_WIDTH = 240

/**
 * Clamp a desired sidebar width to [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH].
 * This is the single source of truth for the valid range.
 */
export function clampSidebarWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, px))
}
