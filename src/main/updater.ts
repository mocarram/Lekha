/**
 * updater.ts - Auto-update wiring via electron-updater.
 *
 * Design / safety contract:
 *   - In DEVELOPMENT (!app.isPackaged) every public function is a NO-OP. The
 *     electron-updater code path is only meaningful for a packaged app reading
 *     its latest-mac.yml from the configured GitHub release channel; running it
 *     unpackaged throws ("application is not packaged") and pollutes the console.
 *     We guard early and return so dev launches never touch autoUpdater.
 *   - Nothing in here is allowed to throw. autoUpdater work is wrapped so a
 *     network failure / missing release simply logs and (optionally) notifies.
 *   - The GitHub provider (owner/repo) is declared in electron-builder.yml under
 *     `publish:`; electron-updater reads the generated app-update.yml at runtime,
 *     so no provider config is needed here.
 *
 * electron-updater itself is Electron-bound and cannot be unit-tested in the
 * vitest/Node environment, so the testable surface is the pure
 * `updateStatusMessage` mapper below. The full check/download/notify flow is
 * verified MANUALLY on a packaged build (see PR notes).
 */

import { app, dialog } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

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
 * Map an updater status to a short human-readable message.
 *
 * Pure (no Electron deps) so it can be unit-tested and reused by both the
 * background notifier and the manual "Check for Updates…" dialog.
 *
 * @param status  - The updater lifecycle status.
 * @param version - Optional version string for the available/downloaded states.
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

// ---------------------------------------------------------------------------
// Status callback type
// ---------------------------------------------------------------------------

export interface UpdaterOptions {
  /** Optional hook invoked on each status transition (for logging/UI/tests). */
  onStatus?: (status: UpdateStatus, message: string) => void
}

// ---------------------------------------------------------------------------
// setupAutoUpdater
// ---------------------------------------------------------------------------

/**
 * Configure electron-updater and start a background check on launch.
 *
 * NO-OP in development (!app.isPackaged) so dev launches never hit the updater.
 * Never throws: all autoUpdater interaction is wrapped.
 */
export function setupAutoUpdater(opts: UpdaterOptions = {}): void {
  // Dev guard: the updater is only meaningful for a packaged build that can
  // read its release channel. Bail out cleanly otherwise.
  if (!app.isPackaged) return

  const emit = (status: UpdateStatus, version?: string): void => {
    const message = updateStatusMessage(status, version)
    console.info(`[updater] ${status}: ${message}`)
    opts.onStatus?.(status, message)
  }

  try {
    // We download automatically but install on quit (electron-updater default
    // for checkForUpdatesAndNotify): the user is notified, no forced restart.
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => { emit('checking') })

    // A manual "Check for Updates…" resolves its own result dialog by awaiting
    // checkForUpdates(); these background listeners only log/notify.
    autoUpdater.on('update-available', (info) => { emit('available', info.version) })
    autoUpdater.on('update-not-available', () => { emit('not-available') })
    autoUpdater.on('update-downloaded', (info) => { emit('downloaded', info.version) })
    autoUpdater.on('error', (err) => {
      console.error('[updater] error:', err)
      emit('error')
    })

    // Background check + native notification when an update is downloaded.
    void autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
      console.error('[updater] checkForUpdatesAndNotify failed:', err)
    })
  } catch (err) {
    // Defensive: configuration must never crash startup.
    console.error('[updater] setup failed:', err)
  }
}

// ---------------------------------------------------------------------------
// checkForUpdates (manual menu trigger)
// ---------------------------------------------------------------------------

/**
 * Manually check for updates from the "Check for Updates…" menu item.
 *
 * NO-OP (with a friendly dev dialog suppressed) in development. In production it
 * runs a check and shows a result dialog: "no update found" or "update
 * available / downloading". Never throws.
 */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    // In dev there is no release channel; show nothing rather than an error.
    console.info('[updater] checkForUpdates skipped (not packaged)')
    return
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    // checkForUpdates resolves with the update info; if no newer version is
    // offered the update-not-available event fires and updateInfo.version equals
    // the current app version.
    const version = result?.updateInfo?.version
    const isNewer = version !== undefined && version !== app.getVersion()
    const status: UpdateStatus = isNewer ? 'available' : 'not-available'
    await dialog.showMessageBox({
      type: 'info',
      title: 'Check for Updates',
      message: isNewer ? 'Update Available' : 'No Updates',
      detail: updateStatusMessage(status, version),
      buttons: ['OK'],
    })
  } catch (err) {
    console.error('[updater] manual check failed:', err)
    await dialog.showMessageBox({
      type: 'warning',
      title: 'Check for Updates',
      message: 'Update Check Failed',
      detail: updateStatusMessage('error'),
      buttons: ['OK'],
    }).catch(() => { /* dialog failure is non-fatal */ })
  }
}
