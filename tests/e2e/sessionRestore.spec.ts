/**
 * Session restore - end-to-end: previously open tabs come back in one batch
 * (all tab chrome at once, only the remembered ACTIVE document loaded into
 * the editor), exercising the real settings -> path-policy -> restoreTabs
 * pipeline across processes.
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-restore-'))
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-restore-docs-'))

  fs.writeFileSync(path.join(docsDir, 'first.md'), '# First Doc\n', 'utf8')
  fs.writeFileSync(path.join(docsDir, 'second.md'), '# Second Doc 777\n', 'utf8')
  fs.writeFileSync(path.join(docsDir, 'third.md'), '# Third Doc\n', 'utf8')

  // A persisted session: three open tabs, the MIDDLE one active, plus one
  // path that no longer exists (must be skipped silently).
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({
      openTabPaths: [
        path.join(docsDir, 'first.md'),
        path.join(docsDir, 'gone.md'),
        path.join(docsDir, 'second.md'),
        path.join(docsDir, 'third.md'),
      ],
      activeTabPath: path.join(docsDir, 'second.md'),
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

test('restores all session tabs, skipping missing files, with the remembered tab active', async () => {
  // All three surviving tabs are present (gone.md skipped), no stray Untitled.
  await expect(win.locator('.tab')).toHaveCount(3, { timeout: 10_000 })
  const titles = await win.locator('.tab .tab__title').allTextContents()
  expect(titles).toEqual(['first.md', 'second.md', 'third.md'])

  // The remembered ACTIVE tab is selected and ITS content is in the editor.
  await expect(win.locator('.tab', { hasText: 'second.md' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(win.locator('.ProseMirror h1', { hasText: 'Second Doc 777' })).toBeVisible()
})

test('a restored background tab opens with its content when activated', async () => {
  await win.locator('.tab', { hasText: 'third.md' }).click()
  await expect(win.locator('.ProseMirror h1', { hasText: 'Third Doc' })).toBeVisible()
  // And switching back works too (snapshots intact).
  await win.locator('.tab', { hasText: 'first.md' }).click()
  await expect(win.locator('.ProseMirror h1', { hasText: 'First Doc' })).toBeVisible()
})
