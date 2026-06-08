/**
 * Creating a new document focuses the editor so the caret blinks and the doc is
 * immediately typeable - via both the "+" tab button and the 'new' AppCommand
 * (File menu). Regression for: new file opened but the editor wasn't focused,
 * so no cursor showed until the user clicked into the editor.
 *
 * The e2e tsconfig is node-typed (no DOM lib), so inside win.evaluate callbacks
 * we reach the DOM through a locally-typed globalThis cast rather than the bare
 * `document`/`HTMLElement` globals (same pattern as outlineNav.spec.ts).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')

interface DomGlobal {
  document: {
    activeElement: { classList: { contains(c: string): boolean } } | null
  }
}

let app: ElectronApplication
let win: Page

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-nf-'))
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

/** True when the focused element is the ProseMirror editable surface. */
async function editorIsFocused(): Promise<boolean> {
  return win.evaluate(() => {
    const active = (globalThis as unknown as DomGlobal).document.activeElement
    return active !== null && active.classList.contains('ProseMirror')
  })
}

/** Move focus off the editor so the next assertion is meaningful. */
async function blurActive(): Promise<void> {
  await win.evaluate(() => {
    const active = (globalThis as unknown as { document: { activeElement: { blur?: () => void } | null } })
      .document.activeElement
    active?.blur?.()
  })
}

/** Send a broadcast AppCommand to the window (same path as the native menu). */
async function sendCommand(cmd: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, command) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', command)
  }, cmd)
}

test("the 'new' command focuses the new document editor", async () => {
  await blurActive()
  await expect.poll(editorIsFocused).toBe(false)

  await sendCommand('new')

  await expect.poll(editorIsFocused, { timeout: 5_000 }).toBe(true)

  // The freshly focused editor accepts typing immediately, no click needed.
  await win.keyboard.type('typed into a brand new doc')
  await expect(win.locator('.ProseMirror')).toContainText('typed into a brand new doc')
})

test('the "+" tab button focuses the new document editor', async () => {
  // The "+" button only renders once more than one tab is open; the previous
  // test left a second tab, so it is present here.
  await win.waitForSelector('.tab-bar__new', { state: 'visible', timeout: 5_000 })
  await blurActive()

  await win.locator('.tab-bar__new').click()

  await expect.poll(editorIsFocused, { timeout: 5_000 }).toBe(true)
})
