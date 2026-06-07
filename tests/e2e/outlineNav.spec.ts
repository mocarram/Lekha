/**
 * Regression: clicking an Outline item scrolls the editor to that heading.
 *
 * Guards the bug where the selection moved to the heading but the editor pane
 * never scrolled (the transaction scrollIntoView did not take effect through the
 * custom dispatchTransaction, so scrollToPos now scrolls the node DOM directly).
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-e2e-outline-'))
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

// The e2e tsconfig is node-only (no DOM lib), so reach the page DOM through a
// locally-typed globalThis instead of the global `document`/`HTMLElement` names.
type DomGlobal = {
  document: { querySelector(sel: string): { scrollTop: number } | null }
}

function paneScrollTop(): Promise<number> {
  return win.evaluate(() => {
    const el = (globalThis as unknown as DomGlobal).document.querySelector('.editor-pane')
    return el ? el.scrollTop : -1
  })
}

test('clicking an outline item scrolls the editor to that heading', async () => {
  // Replace the welcome doc with a tall, multi-heading document.
  await win.locator('.ProseMirror').click()
  await win.keyboard.press('Meta+A')
  await win.keyboard.press('Backspace')

  const filler = 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '
  const headings = ['Alpha Section', 'Bravo Section', 'Charlie Section', 'Delta Section']
  for (const heading of headings) {
    await win.keyboard.type(`# ${heading}`)
    await win.keyboard.press('Enter')
    for (let i = 0; i < 12; i++) {
      await win.keyboard.type(filler)
      await win.keyboard.press('Enter')
    }
  }

  // Switch the sidebar to the Outline tab and confirm it lists the headings.
  await win.locator('.sidebar__tab-btn', { hasText: 'Outline' }).click()
  await win.waitForSelector('.outline__item', { state: 'visible' })
  const items = win.locator('.outline__item')
  await expect(items).toHaveCount(4)

  // Start at the top so the jump has somewhere to scroll to.
  await win.evaluate(() => {
    const el = (globalThis as unknown as DomGlobal).document.querySelector('.editor-pane')
    if (el) el.scrollTop = 0
  })
  const before = await paneScrollTop()
  expect(before).toBe(0)

  // Click the last heading - it is well below the viewport.
  await items.nth(3).click()

  // The editor pane should scroll down to bring that heading into view.
  await expect.poll(paneScrollTop, { timeout: 3000 }).toBeGreaterThan(500)

  // The jump must NOT shift the app shell: the outline stays visible with all
  // its items, and the window root never scrolls (regression: scrollIntoView
  // bubbled to outer containers, shifting the title bar and hiding the outline).
  await expect(items).toHaveCount(4)
  await expect(items.nth(3)).toBeVisible()
  const appScroll = await win.evaluate(() => {
    const se = (globalThis as unknown as { document: { scrollingElement: { scrollTop: number } | null } })
      .document.scrollingElement
    return se ? se.scrollTop : 0
  })
  expect(appScroll).toBe(0)

  // Clicking the first heading scrolls back near the top.
  await items.nth(0).click()
  await expect.poll(paneScrollTop, { timeout: 3000 }).toBeLessThan(200)
})
