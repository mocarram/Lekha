/**
 * Window page-zoom math, shared by the zoom:adjust IPC handler.
 *
 * Zoom moves in Chromium zoom LEVELS (factor = 1.2^level) like the built-in
 * zoom roles, clamped to a range where the layout stays usable and the
 * zoom-compensated chrome (sidebar toggle, traffic-light clearances) cannot
 * collapse to nothing: level -3..3, i.e. factor ~0.58..~1.73.
 */

export const ZOOM_LEVEL_MIN = -3
export const ZOOM_LEVEL_MAX = 3
export const ZOOM_LEVEL_STEP = 0.5

/** The next zoom level for a menu action, clamped to the supported range. */
export function nextZoomLevel(current: number, action: 'in' | 'out' | 'reset'): number {
  if (action === 'reset') return 0
  const next = action === 'in' ? current + ZOOM_LEVEL_STEP : current - ZOOM_LEVEL_STEP
  return Math.min(ZOOM_LEVEL_MAX, Math.max(ZOOM_LEVEL_MIN, next))
}

/**
 * Clamp an absolute zoom FACTOR (the persisted-settings restore path) to the
 * same range the level arithmetic can produce. Non-finite input resets to 1.
 */
export function clampZoomFactor(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return 1
  const min = Math.pow(1.2, ZOOM_LEVEL_MIN)
  const max = Math.pow(1.2, ZOOM_LEVEL_MAX)
  return Math.min(max, Math.max(min, factor))
}
