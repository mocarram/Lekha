/**
 * Folder workflow - end-to-end: session restore of the last folder, folder
 * search, the full Replace All round-trip (disk + open-tab reload), and the
 * filesystem path policy.
 *
 * The folder is "opened" by seeding settings.json with lastFolder before
 * launch - the same persisted-session path real users hit on every relaunch
 * (and the path-policy allowance that goes with it). The Replace All confirm
 * is a native dialog Playwright cannot drive, so dialog.showMessageBox is
 * stubbed in the MAIN process to auto-accept - everything after the dialog is
 * the real code path.
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-folder-'))
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-folder-docs-'))

  fs.writeFileSync(path.join(docsDir, 'alpha.md'), '# Alpha\n\nthe cat sleeps here\n', 'utf8')
  fs.writeFileSync(path.join(docsDir, 'beta.md'), '# Beta\n\nanother cat naps too\n', 'utf8')
  fs.writeFileSync(path.join(docsDir, 'plain.txt'), 'no felines in this one\n', 'utf8')

  // Persisted session: the app restores lastFolder on launch (useStartup),
  // which is also what authorizes the folder for the filesystem IPC.
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
})

test.afterAll(async () => {
  await app.close()
})

test('the last folder is restored into the sidebar tree, including plain text files', async () => {
  await expect(win.locator('.file-tree__name', { hasText: 'alpha.md' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(win.locator('.file-tree__name', { hasText: 'beta.md' })).toBeVisible()
  // The unified openable set includes .txt in the tree.
  await expect(win.locator('.file-tree__name', { hasText: 'plain.txt' })).toBeVisible()
})

test('the path policy rejects paths the user never opened and allows the workspace', async () => {
  // Outside any permitted root: must reject (defense-in-depth regression test).
  const denied = await win.evaluate(async () => {
    try {
      await window.lekha.readFile('/etc/hosts')
      return 'allowed'
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  })
  expect(denied).toContain('not permitted')

  // Inside the opened folder: must work.
  const allowed = await win.evaluate(
    async (p: string) => window.lekha.readFile(p),
    path.join(docsDir, 'alpha.md'),
  )
  expect(allowed).toContain('the cat sleeps here')
})

test('folder search finds matches across files and a click opens the file at the match', async () => {
  await win.locator('.sidebar__tab-btn', { hasText: 'Search' }).click()
  await win.locator('.folder-search__input').fill('cat')

  // Two markdown files match; results are grouped per file.
  await expect(win.locator('.folder-search__file-group')).toHaveCount(2, { timeout: 10_000 })

  // Click the first match: the file opens and the in-editor find highlights it.
  await win.locator('.folder-search__match').first().click()
  await expect(win.locator('.ProseMirror .find-match').first()).toBeVisible({ timeout: 10_000 })
})

test('Replace All rewrites matching files on disk and reloads the open clean tab', async () => {
  // Auto-accept the native confirm (button 0 = "Replace All"); Playwright
  // cannot drive native dialogs. Everything else is the real path.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () =>
      ({ response: 0, checkboxChecked: false }) as Electron.MessageBoxReturnValue
  })

  await win.locator('.folder-search__replace-toggle').click()
  await win.locator('.folder-search__replace-row .folder-search__input').fill('dog')
  await win.locator('.folder-search__replace-all').click()

  // Disk contents changed in both matching files...
  await expect
    .poll(() => fs.readFileSync(path.join(docsDir, 'alpha.md'), 'utf8'), { timeout: 10_000 })
    .toContain('the dog sleeps here')
  expect(fs.readFileSync(path.join(docsDir, 'beta.md'), 'utf8')).toContain('another dog naps too')
  // ...and the file open in a CLEAN tab (alpha.md, opened by the previous
  // test's result click) reloaded to the replaced content.
  await expect(win.locator('.ProseMirror', { hasText: 'the dog sleeps here' })).toBeVisible({
    timeout: 10_000,
  })
})
