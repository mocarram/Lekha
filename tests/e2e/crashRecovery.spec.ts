/**
 * Crash recovery on relaunch - end-to-end.
 *
 * The crash-backup machinery is heavily unit-tested, but the actual
 * multi-process flow (main reads <userData>/backups, renderer recovers the
 * buffer into a tab and shows the notice) only happens on a real launch.
 * This spec seeds a backup file the way a crashed session leaves one behind,
 * launches the app, and asserts the unsaved buffer comes back.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

let app: ElectronApplication
let win: Page

const RECOVERED_HEADING = 'Recovered After Crash 24680'

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-crash-'))

  // Seed a backup exactly as a crashed session leaves it: an Untitled
  // (path: null) dirty buffer in <userData>/backups/<backupId>.json.
  const backupsDir = path.join(userDataDir, 'backups')
  fs.mkdirSync(backupsDir, { recursive: true })
  fs.writeFileSync(
    path.join(backupsDir, 'e2e-crash-tab.json'),
    JSON.stringify({
      backupId: 'e2e-crash-tab',
      path: null,
      title: 'Untitled',
      content: `# ${RECOVERED_HEADING}\n\nUnsaved words that must survive.\n`,
      eol: 'lf',
      savedAt: Date.now(),
    }),
    'utf8',
  )

  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'production', LEKHA_DISABLE_QUIT_GUARD: '1' },
    timeout: 30_000,
  })
  win = await app.firstWindow()
  await win.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })
})

test.afterAll(async () => {
  await app.close()
})

test('an unsaved buffer left by a crash is restored into a tab with the recovery notice', async () => {
  // The recovered buffer is loaded into a tab; activate it if it is not the
  // active one (recovery appends a tab next to the welcome doc).
  const recoveredTab = win.locator('.tab-bar__tab', { hasText: 'Untitled' })
  if (await recoveredTab.count()) {
    await recoveredTab.first().click()
  }

  // The unsaved content is back in the editor...
  await expect(
    win.locator('.ProseMirror h1', { hasText: RECOVERED_HEADING }),
  ).toBeVisible({ timeout: 10_000 })

  // ...and the recovery notice tells the user what happened.
  await expect(win.locator('.recovered-notice')).toBeVisible()
})
