/**
 * Window color (per-folder marker) - end to end.
 *
 * Setting a color via the tab-bar menu paints the top rail (--window-color),
 * persists under the folder path, and a second window opening the same folder
 * gets the same rail - exercising the real renderer -> setFolderColor IPC ->
 * settings.json -> openFolderPath round trip across processes.
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
let docsDir: string

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-wc-'))
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-wc-docs-'))
  fs.writeFileSync(path.join(docsDir, 'a.md'), '# A\n', 'utf8')
  // Persisted session: the folder is open (and authorized) on launch.
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ lastFolder: docsDir }),
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
  await win.waitForSelector('.file-tree__name', { state: 'visible', timeout: 10_000 })
})

test.afterAll(async () => {
  await app.close()
})

/** The resolved --window-color CSS var (empty string when unset). */
function windowColorVar(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--window-color').trim(),
  )
}

test('no rail by default', async () => {
  expect(await windowColorVar(win)).toBe('')
})

test('picking a swatch paints the rail and persists for the folder', async () => {
  // Right-click empty tab-bar space -> color menu -> Teal.
  await win.locator('.tab-bar').click({ button: 'right' })
  await expect(win.locator('.window-color-menu')).toBeVisible()
  await win.locator('.window-color-swatch[aria-label="Teal"]').click()

  await expect.poll(() => windowColorVar(win)).toBe('#0d9488')
  // Menu dismissed.
  await expect(win.locator('.window-color-menu')).toHaveCount(0)

  // Persisted under the folder path.
  await expect
    .poll(async () => (await win.evaluate(() => window.lekha.getSettings())).folderColors[docsDir])
    .toBe('#0d9488')
})

test('a fresh launch reopening the folder restores its rail', async () => {
  // The color is now persisted under docsDir (previous test). A separate app
  // instance whose session reopens that folder must paint the same rail - the
  // real getSettings -> folderColors -> useStartup apply path. Isolated user
  // dir so it does not touch the main window's session.
  const ud2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-wc2-'))
  fs.writeFileSync(
    path.join(ud2, 'settings.json'),
    JSON.stringify({ lastFolder: docsDir, folderColors: { [docsDir]: '#0d9488' } }),
    'utf8',
  )
  const app2 = await electron.launch({
    args: ['.', `--user-data-dir=${ud2}`],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'production', LEKHA_DISABLE_QUIT_GUARD: '1' },
    timeout: 30_000,
  })
  try {
    const w2 = await app2.firstWindow()
    await w2.waitForSelector('.file-tree__name', { state: 'visible', timeout: 20_000 })
    await expect.poll(() => windowColorVar(w2)).toBe('#0d9488')
  } finally {
    await app2.close()
  }
})

test('None clears the rail and the persisted entry', async () => {
  await win.locator('.tab-bar').click({ button: 'right' })
  await win.locator('.window-color-menu').getByRole('menuitem', { name: 'None' }).click()

  await expect.poll(() => windowColorVar(win)).toBe('')
  await expect
    .poll(async () => (await win.evaluate(() => window.lekha.getSettings())).folderColors[docsDir])
    .toBeUndefined()
})
