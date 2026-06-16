/**
 * Single writer of the `--window-color` CSS custom property, which drives the
 * top color rail (see global.css `.app::before`). Mirrors chromeZoom.ts.
 *
 * Pass a validated `#rrggbb` hex to show the rail, or null to remove it (the
 * rail rule is gated on the variable being present, so layout is untouched
 * when there is no color).
 */
import { normalizeWindowColor } from '@shared/windowColor'

export function applyWindowColor(color: string | null): void {
  const root = document.documentElement
  const hex = normalizeWindowColor(color)
  if (hex === null) {
    root.style.removeProperty('--window-color')
  } else {
    root.style.setProperty('--window-color', hex)
  }
}
