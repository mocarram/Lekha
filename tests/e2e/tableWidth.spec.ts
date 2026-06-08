/**
 * Regression: a WYSIWYG table fills its container width with no large empty
 * bordered gap on the right. The bug was `display:block` on the <table>, which
 * stretched the bordered block to 100% while the cell grid stayed content-width.
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-table-'))
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

test('WYSIWYG table fills its width with no empty bordered gap', async () => {
  // Build a small table via source mode, then switch to WYSIWYG to render it.
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.cm-editor', { state: 'visible' })
  await win.locator('.cm-content').click()
  await win.keyboard.press('Meta+A')
  await win.keyboard.press('Backspace')
  await win.keyboard.type(
    '# T\n\n| Version | Date | Author | Changes |\n| --- | --- | --- | --- |\n| 0.1 | 2025-10-28 | TokenOps | Initial |\n',
  )
  await win.locator('.status-bar__mode-btn').click()
  await win.waitForSelector('.ProseMirror table', { state: 'visible' })

  const m = await win.evaluate(() => {
    const table = document.querySelector('.ProseMirror table')!
    const wrapper = document.querySelector('.ProseMirror .tableWrapper')!
    const pane = document.querySelector('.editor-pane')!
    const cells = document.querySelectorAll('.ProseMirror table tr:first-child > *')
    const lastCell = cells[cells.length - 1]!
    const t = table.getBoundingClientRect()
    const c = lastCell.getBoundingClientRect()
    return {
      tableWidth: Math.round(t.width),
      paneWidth: Math.round(pane.getBoundingClientRect().width),
      wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
      // Gap between the last cell's right edge and the table's right border.
      rightGap: Math.round(t.right - c.right),
    }
  })
  console.log('TABLE', JSON.stringify(m))

  // No empty bordered area: the cells reach the table's right edge.
  expect(m.rightGap).toBeLessThan(20)
  // Content-sized, not stretched edge-to-edge: this small table is well under
  // the editor width (regression guard against forcing width:100%).
  expect(m.wrapperWidth).toBeLessThan(m.paneWidth - 150)
})
