/**
 * Window-level dirtiness: a dirty BACKGROUND tab must keep the window marked
 * "edited" (and therefore guarded on close) even when the ACTIVE tab is clean.
 *
 * The close guard itself shows a native modal that Playwright cannot click, and
 * the e2e harness bypasses it via LEKHA_DISABLE_QUIT_GUARD. But the same
 * window-level signal also drives the macOS edited dot via setWindowDirty, so we
 * assert on BrowserWindow.isDocumentEdited() - the renderer subscription -> IPC
 * -> main path, end to end. (macOS-only; the dot is a macOS feature.)
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-wd-'))
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

/** The OS "edited" flag for the window - driven by the window-level dirty IPC. */
function windowEdited(): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isDocumentEdited() ?? false,
  )
}

async function sendCommand(cmd: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, c) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', c)
  }, cmd)
}

test.skip(process.platform !== 'darwin', 'isDocumentEdited is a macOS-only flag')

test('a dirty background tab keeps the window edited while the active tab is clean', async () => {
  // Start clean.
  await expect.poll(windowEdited).toBe(false)

  // Dirty the current (first) tab.
  await win.locator('.ProseMirror').click()
  await win.keyboard.type('unsaved work in tab one')
  await expect.poll(windowEdited).toBe(true)

  // Open a fresh tab. It becomes the ACTIVE tab and is clean; tab one is now a
  // dirty BACKGROUND tab. The window must STILL report edited (window-level),
  // even though the active document is clean.
  await sendCommand('new')
  await expect.poll(() => win.locator('.tab-bar__new').count()).toBeGreaterThan(0)

  // The active editor is the new, empty doc - confirm it is clean...
  await expect(win.locator('.ProseMirror')).toHaveText('')
  // ...yet the window stays edited because tab one is still dirty in the
  // background. (Pre-fix this was false: the guard/dot tracked only the active
  // tab, so the dirty background tab could be lost on close without a prompt.)
  await expect.poll(windowEdited).toBe(true)
})

test('closing the last tab right after typing leaves the window clean', async () => {
  // Auto-answer the unsaved-changes dialog with "Don't Save" (button 1) so the
  // discard path runs without a native modal blocking the test.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = () => Promise.resolve({ response: 1, checkboxChecked: false })
  })

  // Clear the two tabs left by the previous test, then start one fresh tab.
  await win.locator('.tab').first().click({ button: 'right' })
  await win.locator('.tab-menu').getByRole('menuitem', { name: 'Close All', exact: true }).click()
  await expect(win.locator('.tab')).toHaveCount(0)
  await sendCommand('new')
  await expect(win.locator('.tab')).toHaveCount(1)

  // Type and close the tab IMMEDIATELY - inside the editor's ~150ms trailing
  // serialize debounce. Pre-fix, the pane's unmount flush then fired with the
  // CLOSED document's content and re-marked the empty window dirty (stale
  // edited dot + a save prompt on quit with nothing open).
  await win.locator('.ProseMirror').click()
  await win.keyboard.type('zap', { delay: 10 })
  await win.locator('.tab__close').click({ force: true })
  await expect(win.locator('.tab')).toHaveCount(0)

  // Let any pending debounce/unmount flush fire, then assert clean.
  await win.waitForTimeout(400)
  await expect.poll(windowEdited).toBe(false)
  const title = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getTitle() ?? '')
  expect(title).toBe('')
})

test('switching tabs right after typing does not dirty the target tab', async () => {
  // Two fresh tabs; the SECOND is active.
  await sendCommand('new')
  await sendCommand('new')
  await expect(win.locator('.tab')).toHaveCount(2)

  // Type in the FIRST tab, then switch to the second within the debounce
  // window. Pre-fix the pending trailing flush fired AFTER the switch,
  // pushing the first tab's markdown into the store and marking the freshly
  // loaded (clean) tab dirty.
  await win.locator('.tab').first().click()
  await win.locator('.ProseMirror').click()
  await win.keyboard.type('fast', { delay: 10 })
  await win.locator('.tab').nth(1).click()
  await win.waitForTimeout(400)

  // The first tab carries the typing (dirty); the second must stay clean and
  // its editor empty.
  await expect(win.locator('.tab').first()).toHaveClass(/tab--dirty/)
  await expect(win.locator('.tab').nth(1)).not.toHaveClass(/tab--dirty/)
  await expect(win.locator('.ProseMirror')).toHaveText('')
})
