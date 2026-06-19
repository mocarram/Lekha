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
    await expect(win.locator('.file-tree__name', { hasText: /^root\.md$/ })).toBeVisible({
      timeout: 10_000,
    })
    await expect(win.locator('.file-tree__name', { hasText: /^sub$/ })).toBeVisible()
    await expect(win.locator('.file-tree__name', { hasText: /^other$/ })).toBeVisible()
    // The sub-folder's child has not been loaded into the DOM yet (lazy).
    await expect(win.locator('.file-tree__name', { hasText: /^nested\.md$/ })).toHaveCount(0, {
      timeout: 2_000, // must be absent right after the root level renders, not a retry target
    })
  })

  test('expanding a sub-folder loads and shows its children', async () => {
    await win.locator('.file-tree__name', { hasText: /^sub$/ }).click()
    await expect(win.locator('.file-tree__name', { hasText: /^nested\.md$/ })).toBeVisible({
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
    await expect(win.locator('.file-tree__name', { hasText: /^nested\.md$/ })).toBeVisible({
      timeout: 10_000,
    })
  })
})

// ---------------------------------------------------------------------------
// 3. In-app create refreshes ONLY the affected sub-folder (merge-preserve).
//
// Spec Phase 1: an in-app create inside a sub-folder re-reads just that folder
// (fileOps.loadChildren -> setChildren) WITHOUT collapsing or dropping its
// already-loaded descendants. We drive the real UI: expand sub/, then use the
// row context menu (right-click row -> "New File") to create an entry inside
// sub/, then rename it via the inline input. The new file must appear under
// sub/ AND nested.md must remain visible - proving sub/ was patched in place.
// ---------------------------------------------------------------------------
test.describe('in-app create refreshes only the subfolder', () => {
  let app: ElectronApplication
  let win: Page

  test.beforeAll(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-lazy-create-'))
    const docsDir = buildFixture('create')
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

  test('creating a file inside sub/ keeps nested.md visible (in-place refresh)', async () => {
    // The sub/ row's <name> span. The row itself carries the context menu and
    // the click handler, so we act on the enclosing row.
    const subName = win.locator('.file-tree__name', { hasText: /^sub$/ })
    const subRow = win.locator('.file-tree__row--dir', { has: subName })
    await expect(subName).toBeVisible({ timeout: 10_000 })

    // 1. Expand sub/ so its child is lazily loaded into the DOM.
    await subRow.click()
    const nested = win.locator('.file-tree__name', { hasText: /^nested\.md$/ })
    await expect(nested).toBeVisible({ timeout: 10_000 })

    // 2. Right-click the sub/ row to open the context menu, then "New File".
    //    Wait for the menu to be visible before clicking its item.
    await subRow.click({ button: 'right' })
    const menu = win.locator('.filetree-menu')
    await expect(menu).toBeVisible({ timeout: 10_000 })
    const newFileItem = menu.locator('.filetree-menu__item', { hasText: /^New File$/ })
    await expect(newFileItem).toBeVisible()
    await newFileItem.click()

    // The default-named entry is created inside sub/ and opened. It appears as a
    // sibling of nested.md - and crucially nested.md is STILL there.
    const untitled = win.locator('.file-tree__name', { hasText: /^Untitled\.md$/ })
    await expect(untitled).toBeVisible({ timeout: 10_000 })
    await expect(nested).toBeVisible()

    // 3. Rename Untitled.md -> created.md via the row menu + inline input.
    const untitledRow = win.locator('.file-tree__row--file', { has: untitled })
    await untitledRow.click({ button: 'right' })
    await expect(menu).toBeVisible({ timeout: 10_000 })
    const renameItem = menu.locator('.filetree-menu__item', { hasText: /^Rename$/ })
    await expect(renameItem).toBeVisible()
    await renameItem.click()

    const renameInput = win.locator('.file-tree__rename-input')
    await expect(renameInput).toBeVisible({ timeout: 10_000 })
    // Replace the whole name (the input pre-selects the basename; select-all is
    // belt-and-suspenders so the extension is replaced too) and commit.
    await renameInput.fill('created.md')
    await renameInput.press('Enter')

    // 4. The renamed file appears UNDER sub/, and nested.md is STILL visible -
    //    sub/ was refreshed IN PLACE (merge-preserve), not collapsed/dropped.
    await expect(win.locator('.file-tree__name', { hasText: /^created\.md$/ })).toBeVisible({
      timeout: 10_000,
    })
    await expect(nested).toBeVisible({ timeout: 10_000 })
  })
})
