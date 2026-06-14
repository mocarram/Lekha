/**
 * Update channel + version comparison helpers (pure, unit-testable).
 *
 * Lekha ships through two non-overlapping update channels:
 *
 *   - 'homebrew' (default): the unsigned cask build. macOS refuses to apply an
 *     unsigned Squirrel.Mac update, so electron-updater MUST stay dormant here -
 *     running it would download an update it can never install. Updates arrive
 *     via `brew upgrade --cask lekha` (the cask is version-bumped per release),
 *     and the in-app check just tells the user a newer version exists.
 *   - 'direct': a signed + notarized direct-download build. electron-updater
 *     drives real in-app auto-update.
 *
 * The channel is baked at BUILD time (electron.vite.config.ts `define` reads
 * LEKHA_UPDATE_CHANNEL), because a packaged app has no environment to read at
 * runtime. normalizeChannel() validates that token defensively.
 */

export type UpdateChannel = 'homebrew' | 'direct'

/** Default channel when the build-time flag is unset or unrecognized. */
export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'homebrew'

/** Validate a raw channel token, falling back to the default. */
export function normalizeChannel(raw: unknown): UpdateChannel {
  return raw === 'direct' ? 'direct' : DEFAULT_UPDATE_CHANNEL
}

/**
 * Parse a version string into numeric [major, minor, patch], tolerating a
 * leading 'v' (git tags) and a pre-release/build suffix (e.g. '1.2.3-beta.1'),
 * which is ignored for ordering. Missing or non-numeric segments become 0.
 */
export function parseVersion(version: string): [number, number, number] {
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0] ?? ''
  const parts = core.split('.')
  const n = (i: number): number => {
    const v = Number.parseInt(parts[i] ?? '0', 10)
    return Number.isFinite(v) ? v : 0
  }
  return [n(0), n(1), n(2)]
}

/**
 * True when `latest` is a strictly newer release than `current` (release-level
 * precision: pre-release suffixes are not ordered). Used to decide whether to
 * offer an update.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < 3; i++) {
    if (a[i]! > b[i]!) return true
    if (a[i]! < b[i]!) return false
  }
  return false
}

/** Outcome of an update check, shared by the menu dialog and the in-app UI. */
export interface UpdateCheckResult {
  channel: UpdateChannel
  currentVersion: string
  /** The newest released version, when a check succeeded. */
  latestVersion: string | null
  /** True when latestVersion is strictly newer than currentVersion. */
  updateAvailable: boolean
  /** True when the check itself failed (network/parse/no releases). */
  error: boolean
}
