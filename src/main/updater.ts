/**
 * updater.ts - channel-aware update checking.
 *
 * Two non-overlapping channels (see src/shared/updateChannel.ts):
 *
 *   - 'homebrew' (default, unsigned cask): electron-updater stays DORMANT -
 *     macOS rejects an unsigned Squirrel.Mac update, so running it would only
 *     download something it can never install. The update check instead queries
 *     the GitHub Releases API and, when a newer version exists, tells the user
 *     to run `brew upgrade --cask lekha`.
 *   - 'direct' (signed + notarized): electron-updater drives real in-app
 *     auto-update (background download, install on quit) and the manual check
 *     delegates to it.
 *
 * The channel is baked at build time (electron.vite.config.ts define). Pure
 * helpers (updateStatusMessage + the version math in updateChannel.ts) are
 * unit-tested; the electron-updater path is verified MANUALLY on a packaged
 * signed build.
 */

import { app, dialog, clipboard } from 'electron'
import electronUpdater from 'electron-updater'
import {
  normalizeChannel,
  isNewerVersion,
  type UpdateChannel,
  type UpdateCheckResult,
} from '@shared/updateChannel'

const { autoUpdater } = electronUpdater

/** Build-time channel flag (electron.vite.config.ts `define`). */
declare const __UPDATE_CHANNEL__: string
const CHANNEL: UpdateChannel = normalizeChannel(
  typeof __UPDATE_CHANNEL__ === 'string' ? __UPDATE_CHANNEL__ : undefined,
)

/** GitHub repo backing the Homebrew channel's release lookup + cask. */
const GITHUB_REPO = 'mocarram/Lekha'
/** The cask token, used in the upgrade hint shown to Homebrew users. */
const BREW_CASK = 'lekha'
/** How long to wait on the GitHub Releases API before giving up. */
const GITHUB_TIMEOUT_MS = 8000

// ---------------------------------------------------------------------------
// Pure status mapper (unit-testable)
// ---------------------------------------------------------------------------

/** Discrete updater states surfaced to the user / logs. */
export type UpdateStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloaded'
  | 'error'

/**
 * Map an updater status to a short human-readable message. Pure (no Electron
 * deps) so it can be unit-tested and reused by the background notifier, the
 * manual dialog, and the in-app check.
 */
export function updateStatusMessage(status: UpdateStatus, version?: string): string {
  switch (status) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return version
        ? `Update available: version ${version} is downloading in the background.`
        : 'An update is available and downloading in the background.'
    case 'not-available':
      return 'You are running the latest version of Lekha.'
    case 'downloaded':
      return version
        ? `Version ${version} has been downloaded and will install on restart.`
        : 'An update has been downloaded and will install on restart.'
    case 'error':
      return 'Could not check for updates. Please try again later.'
  }
}

/** The `brew upgrade` command Homebrew users run to update. */
export function brewUpgradeCommand(): string {
  return `brew upgrade --cask ${BREW_CASK}`
}

// ---------------------------------------------------------------------------
// Channel-aware update check (shared by the menu dialog + the in-app button)
// ---------------------------------------------------------------------------

/** The channel this build was compiled for. */
export function updateChannel(): UpdateChannel {
  return CHANNEL
}

/**
 * Query the GitHub Releases API for the latest published version. Returns the
 * tag (without a leading 'v') or null on any failure (network, no releases,
 * rate limit) - the caller treats null as "could not check".
 */
async function fetchLatestGitHubVersion(): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, GITHUB_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name?: string }
    const tag = typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/i, '') : ''
    return tag.length > 0 ? tag : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run a channel-appropriate update check and return a structured result.
 * NEVER throws. On 'homebrew' it compares the running version to the latest
 * GitHub release; on 'direct' it asks electron-updater (packaged only).
 */
export async function runUpdateCheck(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const base: UpdateCheckResult = {
    channel: CHANNEL,
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    error: false,
  }

  // Dev/e2e have no release channel: never make the live GitHub/electron-updater
  // call (avoids a real network request + e2e flakiness). Report "up to date".
  if (!app.isPackaged) return base

  if (CHANNEL === 'direct') {
    // Signed build: defer to electron-updater (packaged-only, guarded above).
    try {
      const result = await autoUpdater.checkForUpdates()
      const latest = result?.updateInfo?.version ?? null
      return {
        ...base,
        latestVersion: latest,
        updateAvailable: latest !== null && isNewerVersion(latest, currentVersion),
      }
    } catch (err) {
      console.error('[updater] direct check failed:', err)
      return { ...base, error: true }
    }
  }

  // Homebrew channel: ask GitHub directly.
  const latest = await fetchLatestGitHubVersion()
  if (latest === null) return { ...base, error: true }
  return { ...base, latestVersion: latest, updateAvailable: isNewerVersion(latest, currentVersion) }
}

// ---------------------------------------------------------------------------
// Status callback type
// ---------------------------------------------------------------------------

export interface UpdaterOptions {
  /** Optional hook invoked on each status transition (for logging/UI/tests). */
  onStatus?: (status: UpdateStatus, message: string) => void
}

// ---------------------------------------------------------------------------
// setupAutoUpdater (background, direct channel only)
// ---------------------------------------------------------------------------

/**
 * Configure electron-updater and start a background check on launch.
 *
 * DORMANT unless this is a packaged 'direct' (signed) build: the Homebrew
 * channel can never apply a Squirrel update, so we must not download one.
 * Never throws - all autoUpdater interaction is wrapped.
 */
export function setupAutoUpdater(opts: UpdaterOptions = {}): void {
  if (CHANNEL !== 'direct' || !app.isPackaged) return

  const emit = (status: UpdateStatus, version?: string): void => {
    const message = updateStatusMessage(status, version)
    console.info(`[updater] ${status}: ${message}`)
    opts.onStatus?.(status, message)
  }

  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => { emit('checking') })
    autoUpdater.on('update-available', (info) => { emit('available', info.version) })
    autoUpdater.on('update-not-available', () => { emit('not-available') })
    autoUpdater.on('update-downloaded', (info) => { emit('downloaded', info.version) })
    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err)
      emit('error')
    })

    void autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
      console.error('[updater] checkForUpdatesAndNotify failed:', err)
    })
  } catch (err) {
    console.error('[updater] setup failed:', err)
  }
}

// ---------------------------------------------------------------------------
// checkForUpdates (manual menu trigger -> native dialog)
// ---------------------------------------------------------------------------

/**
 * Manual "Check for Updates…" from the menu. Channel-aware: on Homebrew an
 * available update offers to copy the `brew upgrade` command; on the direct
 * channel electron-updater has already begun downloading. Never throws.
 */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    console.info('[updater] checkForUpdates skipped (not packaged)')
    return
  }

  const result = await runUpdateCheck()

  if (result.error) {
    await dialog
      .showMessageBox({
        type: 'warning',
        title: 'Check for Updates',
        message: 'Update Check Failed',
        detail: updateStatusMessage('error'),
        buttons: ['OK'],
      })
      .catch(() => { /* dialog failure is non-fatal */ })
    return
  }

  if (!result.updateAvailable) {
    await dialog
      .showMessageBox({
        type: 'info',
        title: 'Check for Updates',
        message: 'No Updates',
        detail: updateStatusMessage('not-available'),
        buttons: ['OK'],
      })
      .catch(() => { /* non-fatal */ })
    return
  }

  // An update is available.
  const v = result.latestVersion ?? ''
  if (CHANNEL === 'homebrew') {
    const cmd = brewUpgradeCommand()
    const choice = await dialog
      .showMessageBox({
        type: 'info',
        title: 'Check for Updates',
        message: `Lekha ${v} is available`,
        detail: `You are on ${result.currentVersion}. Update from your terminal:\n\n${cmd}`,
        buttons: ['Copy command', 'OK'],
        defaultId: 0,
        cancelId: 1,
      })
      .catch(() => null)
    if (choice?.response === 0) clipboard.writeText(cmd)
    return
  }

  // direct channel: electron-updater is downloading in the background.
  await dialog
    .showMessageBox({
      type: 'info',
      title: 'Check for Updates',
      message: 'Update Available',
      detail: updateStatusMessage('available', v),
      buttons: ['OK'],
    })
    .catch(() => { /* non-fatal */ })
}
