/**
 * Live folder watcher - end-to-end. With a folder open, files/folders created
 * or removed ON DISK (by this test, simulating an external app) appear/vanish
 * in the sidebar live, debounced, without any user action. Changes under a
 * collapsed/unloaded directory do not appear until it is expanded.
 *
 * The folder is "opened" by seeding settings.json with lastFolder before launch
 * (the persisted-session path real users hit on relaunch), which also starts
 * the watcher. The test then mutates the folder ON DISK via fs and asserts the
 * tree updates live - no user click drives the create/remove updates.
 *
 * This is the most timing-sensitive spec in the suite: each live update has to
 * clear the FSEvents latency + the 250ms watcher debounce + the dir re-read, so
 * positive assertions use generous retrying timeouts. Folder rows are matched
 * with an anchored regex (/^sub$/) so short names cannot collide with another
 * row, matching lazyTree.spec.ts.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

// ---------------------------------------------------------------------------
// Fixture: root.md + nested.md under sub/ (loaded once expanded) and a cold/
// dir that stays collapsed for the laziness-boundary case. The watcher writes
// into this dir during the test to simulate an external app.
// ---------------------------------------------------------------------------
function buildFixture(): string {
  // Intentionally NOT realpath'd: macOS tmpdir is under a /var -> /private/var
  // symlink, so this exercises the watcher's real-path -> watched-root remap
  // (FSEvents reports resolved paths; the tree uses the unresolved open path).
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-watch-docs-'))
  fs.mkdirSync(path.join(docsDir, 'sub'), { recursive: true })
  fs.mkdirSync(path.join(docsDir, 'cold'), { recursive: true }) // stays collapsed
  fs.writeFileSync(path.join(docsDir, 'root.md'), '# Root\n', 'utf8')
  fs.writeFileSync(path.join(docsDir, 'sub', 'nested.md'), '# Nested\n', 'utf8')
  return docsDir
}

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'production', LEKHA_DISABLE_QUIT_GUARD: '1' },
    timeout: 30_000,
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })
  return { app, win }
}

test.describe('live folder watcher', () => {
  let app: ElectronApplication
  let win: Page
  let docsDir: string

  test.beforeAll(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-watch-'))
    docsDir = buildFixture()
    fs.writeFileSync(
      path.join(userDataDir, 'settings.json'),
      JSON.stringify({ lastFolder: docsDir }),
      'utf8',
    )
    ;({ app, win } = await launch(userDataDir))
    // The seeded lastFolder opens the folder AND starts the watcher; the root
    // level must be loaded before any live-update assertion is meaningful.
    await expect(win.locator('.file-tree__name', { hasText: /^root\.md$/ })).toBeVisible({
      timeout: 10_000,
    })
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('a file created on disk at the root appears live', async () => {
    fs.writeFileSync(path.join(docsDir, 'external.md'), '# External\n', 'utf8')
    await expect(win.locator('.file-tree__name', { hasText: /^external\.md$/ })).toBeVisible({
      timeout: 8_000,
    })
  })

  test('a file removed on disk disappears live', async () => {
    fs.rmSync(path.join(docsDir, 'external.md'))
    await expect(win.locator('.file-tree__name', { hasText: /^external\.md$/ })).toHaveCount(0, {
      timeout: 8_000,
    })
  })

  test('a file created in an expanded subfolder appears live', async () => {
    // Expand sub/ so its children are lazily loaded and the dir is "watched".
    const subName = win.locator('.file-tree__name', { hasText: /^sub$/ })
    const subRow = win.locator('.file-tree__row--dir', { has: subName })
    await expect(subName).toBeVisible({ timeout: 10_000 })
    await subRow.click()
    await expect(win.locator('.file-tree__name', { hasText: /^nested\.md$/ })).toBeVisible({
      timeout: 10_000,
    })
    // Now an external create inside the loaded sub/ shows up live, no click.
    fs.writeFileSync(path.join(docsDir, 'sub', 'live.md'), '# Live\n', 'utf8')
    await expect(win.locator('.file-tree__name', { hasText: /^live\.md$/ })).toBeVisible({
      timeout: 8_000,
    })
  })

  test('a file created under a collapsed folder does NOT appear until expand', async () => {
    // cold/ was never expanded, so its children are unloaded and unwatched. An
    // external create inside it must NOT leak into the tree.
    fs.writeFileSync(path.join(docsDir, 'cold', 'hidden.md'), '# Hidden\n', 'utf8')
    await win.waitForTimeout(2_000) // give the watcher time to (not) act
    await expect(win.locator('.file-tree__name', { hasText: /^hidden\.md$/ })).toHaveCount(0)
    // Expanding cold/ now loads its children, revealing the file created above.
    const coldName = win.locator('.file-tree__name', { hasText: /^cold$/ })
    const coldRow = win.locator('.file-tree__row--dir', { has: coldName })
    await coldRow.click()
    await expect(win.locator('.file-tree__name', { hasText: /^hidden\.md$/ })).toBeVisible({
      timeout: 10_000,
    })
  })
})
