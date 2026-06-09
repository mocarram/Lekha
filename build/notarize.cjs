/*
 * electron-builder `afterSign` hook - conditional macOS notarization.
 *
 * Notarizes the signed .app only when ALL of APPLE_ID,
 * APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID are set. Otherwise it logs and
 * returns, so local builds and unsigned CI builds proceed untouched. The
 * @electron/notarize dependency is required lazily so this module is cheap to
 * load in unit tests (which only exercise shouldNotarize).
 */

/** True only when all three Apple credential env vars are non-empty. */
function shouldNotarize(env) {
  return Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID)
}

exports.shouldNotarize = shouldNotarize

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  if (!shouldNotarize(process.env)) {
    console.log('[notarize] Skipping - Apple credentials not set (unsigned build).')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const { notarize } = require('@electron/notarize')
  console.log(`[notarize] Notarizing ${appName}.app ...`)
  await notarize({
    appBundleId: 'com.lekha.app',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
  console.log(`[notarize] Done: ${appName}.app`)
}
