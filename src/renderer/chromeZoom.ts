/**
 * Zoom compensation for native-anchored chrome.
 *
 * Page zoom scales every CSS pixel, but the macOS traffic lights are OS-drawn
 * at fixed NATIVE coordinates (window.ts trafficLightPosition x:16 y:15) and
 * never move. Chrome that must stay glued to them - the sidebar toggle and
 * the collapsed tab-bar's left clearance - divides its geometry by the
 * current zoom factor in CSS (e.g. `calc(80px / var(--zoom-factor))`), so
 * CSS-px x zoom = constant native px at any zoom level.
 *
 * This is the single writer of that variable. Callers pass the factor
 * returned by window.lekha.adjustZoom (zoom commands, startup restore).
 */
export function applyChromeZoom(factor: number): void {
  const safe = Number.isFinite(factor) && factor > 0 ? factor : 1
  document.documentElement.style.setProperty('--zoom-factor', String(safe))
}
