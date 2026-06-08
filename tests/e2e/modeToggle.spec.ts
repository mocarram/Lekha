/**
 * Toggling between WYSIWYG and source must preserve the reader's scroll position
 * and leave the editor focused, so the writing flow is not interrupted. (The
 * view remounts on toggle, which previously reset scrollTop to 0 and dropped
 * focus.)
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-mt-'))
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

const paneScrollTop = () => win.evaluate(() => document.querySelector('.editor-pane')?.scrollTop ?? -1)
const editorFocused = () =>
  win.evaluate(() => {
    const a = document.activeElement
    return a instanceof HTMLElement && (a.classList.contains('ProseMirror') || a.classList.contains('cm-content'))
  })

test('mode toggle preserves scroll position and keeps the editor focused', async () => {
  // Build a tall document so there is somewhere to scroll.
  const lines: string[] = []
  for (let i = 0; i < 200; i++) lines.push(i % 6 === 0 ? `## Section ${i}` : `Paragraph ${i} with enough text to take up a full line in the editor view.`)
  const big = lines.join('\n\n')
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.cm-editor', { state: 'visible' })
  await win.locator('.cm-content').click()
  await win.keyboard.press('Meta+A')
  await win.keyboard.press('Backspace')
  await win.keyboard.insertText(big)
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.ProseMirror h2', { state: 'visible', timeout: 20_000 })

  // Scroll the WYSIWYG editor well down.
  await win.evaluate(() => {
    const el = document.querySelector('.editor-pane')
    if (el) el.scrollTop = 800
  })
  await expect.poll(paneScrollTop).toBeGreaterThan(600)
  const before = await paneScrollTop()

  // Toggle to source and back.
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.cm-editor', { state: 'visible' })
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.ProseMirror', { state: 'visible' })

  // Scroll position is restored (not reset to 0), within a reasonable tolerance.
  await expect
    .poll(paneScrollTop, { timeout: 5_000 })
    .toBeGreaterThan(before * 0.7)
  // And the editor is focused so typing continues immediately.
  await expect.poll(editorFocused, { timeout: 5_000 }).toBe(true)
})
