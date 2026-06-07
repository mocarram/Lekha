/**
 * Regression: the floating table toolbar APPEARS when the caret is in a table,
 * and its buttons edit the table. The toolbar never showed before because the
 * columnResizing div.tableWrapper broke the table-rect lookup (no rect -> not
 * rendered).
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

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-tt-'))
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

test('table toolbar appears in a table and inserts a row', async () => {
  // Build a 1-body-row table via source mode, then switch to WYSIWYG.
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.cm-editor', { state: 'visible' })
  await win.locator('.cm-content').click()
  await win.keyboard.press('Meta+A')
  await win.keyboard.press('Backspace')
  await win.keyboard.type('# T\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n')
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.ProseMirror table', { state: 'visible' })

  // No toolbar until the caret is in the table.
  expect(await win.locator('.table-toolbar').count()).toBe(0)

  await win.locator('.ProseMirror table td').first().click()

  // The toolbar shows.
  await expect(win.locator('.table-toolbar')).toBeVisible()

  const rowsBefore = await win.locator('.ProseMirror table tr').count()
  await win.locator('.table-toolbar button[aria-label="Insert row below"]').click()
  await expect
    .poll(() => win.locator('.ProseMirror table tr').count())
    .toBe(rowsBefore + 1)
})
