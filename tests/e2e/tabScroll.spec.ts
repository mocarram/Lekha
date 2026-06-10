/**
 * Tab strip overflow - end-to-end with real layout (the unit tests stub
 * layout metrics; this proves the CSS actually produces the VS Code behavior):
 * with many tabs, each keeps its minimum width so the strip OVERFLOWS and
 * scrolls horizontally instead of squashing titles into slivers, and the
 * active tab is auto-scrolled into view when activation changes.
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

const TAB_COUNT = 14

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-tabs-'))
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'production', LEKHA_DISABLE_QUIT_GUARD: '1' },
    timeout: 30_000,
  })
  win = await app.firstWindow()
  await win.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })

  // Open enough blank tabs to overflow the strip (same IPC path as the menu).
  for (let i = 0; i < TAB_COUNT - 1; i++) {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', 'new')
    })
  }
  await expect(win.locator('.tab')).toHaveCount(TAB_COUNT)
})

test.afterAll(async () => {
  await app.close()
})

test('many tabs keep their minimum width and overflow the strip horizontally', async () => {
  const metrics = await win.evaluate(() => {
    const strip = document.querySelector('.tab-bar__tabs')!
    const widths = Array.from(strip.querySelectorAll('.tab')).map(
      (t) => t.getBoundingClientRect().width,
    )
    return {
      overflows: strip.scrollWidth > strip.clientWidth,
      minTabWidth: Math.min(...widths),
    }
  })
  // Tabs never squash below the minimum (100px) - the strip scrolls instead.
  expect(metrics.minTabWidth).toBeGreaterThanOrEqual(100)
  expect(metrics.overflows).toBe(true)
})

test('activating an off-screen tab scrolls it into view', async () => {
  // Scroll the strip fully right (the last tab is active), then jump to the
  // FIRST tab via nextTab wraparound... simpler: click is impossible while
  // off-screen, so activate via the keyboard command path App uses.
  const firstVisibleBefore = await win.evaluate(() => {
    const strip = document.querySelector('.tab-bar__tabs')!
    strip.scrollLeft = strip.scrollWidth // park the strip at the far right
    const tab = strip.querySelector('.tab')!
    const tabBox = tab.getBoundingClientRect()
    const stripBox = strip.getBoundingClientRect()
    return tabBox.right > stripBox.left && tabBox.left < stripBox.right
  })
  expect(firstVisibleBefore).toBe(false)

  // nextTab from the last tab wraps to the first (off-screen) tab.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', 'nextTab')
  })
  await expect(win.locator('.tab').first()).toHaveAttribute('aria-selected', 'true')

  // The auto-reveal effect brought it into the strip's viewport.
  await expect
    .poll(() =>
      win.evaluate(() => {
        const strip = document.querySelector('.tab-bar__tabs')!
        const tab = strip.querySelector('.tab')!
        const tabBox = tab.getBoundingClientRect()
        const stripBox = strip.getBoundingClientRect()
        return tabBox.left >= stripBox.left - 1 && tabBox.right <= stripBox.right + 1
      }),
    )
    .toBe(true)
})

test('wheel scrolling moves the strip horizontally', async () => {
  // Reset to the far left, then wheel over the strip.
  await win.evaluate(() => {
    document.querySelector('.tab-bar__tabs')!.scrollLeft = 0
  })
  const strip = win.locator('.tab-bar__tabs')
  await strip.hover()
  await win.mouse.wheel(0, 120) // vertical wheel -> horizontal scroll
  await expect
    .poll(() => win.evaluate(() => document.querySelector('.tab-bar__tabs')!.scrollLeft))
    .toBeGreaterThan(0)
})
