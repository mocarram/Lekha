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

  // A persisted session: an open folder, three open tabs (the MIDDLE one
  // active), plus one path that no longer exists (must be skipped silently).
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({
      lastFolder: docsDir,
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

test('dragging a tab reorders it within the strip', async () => {
  // Drag third.md onto the LEFT half of first.md -> it lands in front.
  const source = win.locator('.tab', { hasText: 'third.md' })
  const target = win.locator('.tab', { hasText: 'first.md' })
  const targetBox = (await target.boundingBox())!
  await source.dragTo(target, {
    targetPosition: { x: Math.floor(targetBox.width * 0.2), y: Math.floor(targetBox.height / 2) },
  })

  await expect
    .poll(async () => win.locator('.tab .tab__title').allTextContents())
    .toEqual(['third.md', 'first.md', 'second.md'])
})

test('dropping a tab PAST the last one (on the bar background) moves it to the end', async () => {
  // Order here: [third, first, second]. Drag the MIDDLE tab and release it to
  // the RIGHT of the last tab - that area is bare tab-bar background (a window
  // drag region), the spot a "move it after the last tab" gesture naturally
  // ends on. The bar-level drop handler must catch it and map it to the end
  // slot; this also proves DnD events deliver over -webkit-app-region: drag.
  const source = win.locator('.tab', { hasText: 'first.md' })
  const bar = win.locator('.tab-bar')
  const lastBox = (await win.locator('.tab').last().boundingBox())!
  const barBox = (await bar.boundingBox())!
  await source.dragTo(bar, {
    targetPosition: {
      x: lastBox.x + lastBox.width + 30 - barBox.x,
      y: Math.floor(barBox.height / 2),
    },
  })
  await expect
    .poll(async () => win.locator('.tab .tab__title').allTextContents())
    .toEqual(['third.md', 'second.md', 'first.md'])

  // Drag it back into the middle (left half of second.md) so the later tests
  // see the order they expect.
  const target = win.locator('.tab', { hasText: 'second.md' })
  const targetBox = (await target.boundingBox())!
  await source.dragTo(target, {
    targetPosition: { x: Math.floor(targetBox.width * 0.2), y: Math.floor(targetBox.height / 2) },
  })
  await expect
    .poll(async () => win.locator('.tab .tab__title').allTextContents())
    .toEqual(['third.md', 'first.md', 'second.md'])
})

test('File > New Window opens BLANK instead of replaying the session', async () => {
  // Trigger New Window through the same IPC the menu/command uses.
  const [newWin] = await Promise.all([
    app.waitForEvent('window'),
    win.evaluate(() => { window.lekha.newWindow() }),
  ])
  await newWin.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })

  // One blank Untitled tab - NOT the restored session files.
  await expect(newWin.locator('.tab')).toHaveCount(1)
  await expect(newWin.locator('.tab .tab__title')).toHaveText('Untitled')
  await expect(newWin.locator('.tab', { hasText: 'second.md' })).toHaveCount(0)

  // ...and an EMPTY workspace: the session's folder is not inherited either.
  await expect(newWin.locator('.files-empty')).toBeVisible()
  await expect(newWin.locator('.file-tree__name')).toHaveCount(0)

  // The original window's session is untouched (tabs + folder tree).
  await expect(win.locator('.tab')).toHaveCount(3)
  await expect(win.locator('.file-tree__name', { hasText: 'first.md' })).toBeVisible()
  await newWin.close()
})

test('pinning moves a tab to the front and protects it from Close Others', async () => {
  // Pin third.md via its context menu: it jumps to the FRONT of the strip
  // with the pin glyph in place of the close button.
  await win.locator('.tab', { hasText: 'third.md' }).click({ button: 'right' })
  await win.locator('.tab-menu').getByRole('menuitem', { name: 'Pin Tab', exact: true }).click()
  await expect
    .poll(async () => win.locator('.tab .tab__title').allTextContents())
    .toEqual(['third.md', 'first.md', 'second.md'])
  await expect(win.locator('.tab--pinned .tab__pin')).toBeVisible()

  // Close Others on second.md: the pinned tab survives alongside the target.
  await win.locator('.tab', { hasText: 'second.md' }).click({ button: 'right' })
  const menu = win.locator('.tab-menu')
  await expect(menu).toBeVisible()
  // The curated set is present (plus the pin toggle).
  for (const label of ['Pin Tab', 'Close', 'Close Others', 'Close Saved', 'Close All', 'Reveal in Finder']) {
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
  }
  await menu.getByRole('menuitem', { name: 'Close Others', exact: true }).click()

  await expect(win.locator('.tab')).toHaveCount(2)
  await expect
    .poll(async () => win.locator('.tab .tab__title').allTextContents())
    .toEqual(['third.md', 'second.md'])
  await expect(win.locator('.tab-menu')).toHaveCount(0)
  // The surviving target's document is still loaded.
  await expect(win.locator('.ProseMirror h1', { hasText: 'Second Doc 777' })).toBeVisible()
})
