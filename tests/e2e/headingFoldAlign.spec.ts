/**
 * The heading fold chevron must sit on the optical center of the heading's FIRST
 * line - including when the heading wraps to multiple lines. Regression for the
 * chevron sitting ~9px too high (it inherited the heading's unitless line-height
 * as a number and shrank with its own 0.6em font, so its centering box was half
 * a heading line too short).
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-hfa-'))
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

/** Signed px offset of the fold chevron's center from the heading first line's center. */
async function chevronDeltaY(selector: string): Promise<number | null> {
  return win.evaluate((sel) => {
    const h = document.querySelector(sel)
    const t = h?.querySelector('.heading-fold-toggle')
    if (!(h instanceof HTMLElement) || !(t instanceof HTMLElement)) return null
    const hr = h.getBoundingClientRect()
    const tr = t.getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(h).lineHeight)
    const firstLineCenter = hr.top + lineHeight / 2
    const toggleCenter = tr.top + tr.height / 2
    return Math.round(toggleCenter - firstLineCenter)
  }, selector)
}

test('fold chevron is centered on the first line of a wrapped and a single-line heading', async () => {
  await win.locator('.ProseMirror').click()
  await win.keyboard.press('Meta+A')
  await win.keyboard.press('Backspace')
  // A long h1 that wraps to two lines, then a short h2.
  await win.keyboard.type('# Active Vesting Contracts - TVL (Total Value Locked) (2026-06-08)')
  await win.keyboard.press('Enter')
  await win.keyboard.press('Enter')
  await win.keyboard.type('## Chains covered (11)')
  await win.waitForSelector('.ProseMirror h1', { state: 'visible' })

  // The chevron is hover-revealed; force it visible so it can be measured.
  await win.addStyleTag({ content: '.heading-fold-toggle{opacity:1 !important;}' })

  // Centered to within 2px of the first line's center, even when wrapped.
  expect(Math.abs((await chevronDeltaY('.ProseMirror h1')) ?? 999)).toBeLessThanOrEqual(2)
  expect(Math.abs((await chevronDeltaY('.ProseMirror h2')) ?? 999)).toBeLessThanOrEqual(2)
})
