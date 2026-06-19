/**
 * Lazy file tree - end-to-end: proves the tree loads ONE directory level at a
 * time. Two launched apps (separate userDataDir + fixture each):
 *
 *  1. Lazy load + expand: opening a folder shows only the root level; a
 *     sub-folder's children are absent from the DOM until that folder is
 *     clicked, at which point they load and render.
 *  2. Restore reveal: when the persisted session has an active tab inside a
 *     sub-folder, that folder's children are auto-loaded and revealed on launch
 *     with NO user interaction.
 *
 * The folder is "opened" by seeding settings.json with lastFolder before launch
 * (the persisted-session path real users hit on relaunch). For the reveal case
 * the seed also carries openTabPaths + activeTabPath pointing inside the
 * sub-folder, which is what triggers useStartup's revealPath() ancestor load.
 *
 * Folder rows are matched with an anchored regex (/^sub$/) rather than the
 * substring hasText, so a short name like "sub" can never collide with another
 * row.
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
// Fixture: root.md at the top level, sub/nested.md one level down, and an
// empty other/ dir. Shared shape across both describe blocks.
// ---------------------------------------------------------------------------
function buildFixture(prefix: string): string {
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), `lekha-lazy-${prefix}-docs-`))
  fs.mkdirSync(path.join(docsDir, 'sub'), { recursive: true })
  fs.mkdirSync(path.join(docsDir, 'other'), { recursive: true })
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

// ---------------------------------------------------------------------------
// 1. Lazy load + expand
// ---------------------------------------------------------------------------
test.describe('lazy load and expand', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeAll(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-lazy-load-'))
    const docsDir = buildFixture('load')
    fs.writeFileSync(
      path.join(userDataDir, 'settings.json'),
      JSON.stringify({ lastFolder: docsDir }),
      'utf8',
    )
    ;({ app, win } = await launch(userDataDir))
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('opening a folder shows only the root level; sub-folder children are not loaded', async () => {
    // Top-level entries are present.
    await expect(win.locator('.file-tree__name', { hasText: 'root.md' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(win.locator('.file-tree__name', { hasText: /^sub$/ })).toBeVisible()
    await expect(win.locator('.file-tree__name', { hasText: /^other$/ })).toBeVisible()
    // The sub-folder's child has not been loaded into the DOM yet (lazy).
    await expect(win.locator('.file-tree__name', { hasText: 'nested.md' })).toHaveCount(0)
  })

  test('expanding a sub-folder loads and shows its children', async () => {
    await win.locator('.file-tree__name', { hasText: /^sub$/ }).click()
    await expect(win.locator('.file-tree__name', { hasText: 'nested.md' })).toBeVisible({
      timeout: 10_000,
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Restore reveal: active tab inside sub/ auto-loads its children on launch.
// ---------------------------------------------------------------------------
test.describe('restore reveal', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeAll(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-lazy-reveal-'))
    const docsDir = buildFixture('reveal')
    const nested = path.join(docsDir, 'sub', 'nested.md')
    fs.writeFileSync(
      path.join(userDataDir, 'settings.json'),
      JSON.stringify({
        lastFolder: docsDir,
        openTabPaths: [nested],
        activeTabPath: nested,
      }),
      'utf8',
    )
    ;({ app, win } = await launch(userDataDir))
  })

  test.afterAll(async () => {
    await app.close()
  })

  test('the active file inside a sub-folder is revealed on restore with no click', async () => {
    // Root level loads as usual.
    await expect(win.locator('.file-tree__name', { hasText: /^sub$/ })).toBeVisible({
      timeout: 10_000,
    })
    // ...and because the restored active tab lives inside sub/, its ancestor
    // dir was auto-revealed and its children auto-loaded: no click required.
    await expect(win.locator('.file-tree__name', { hasText: 'nested.md' })).toBeVisible({
      timeout: 10_000,
    })
  })
})
