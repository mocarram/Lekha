/**
 * Zoom-compensated chrome - end-to-end.
 *
 * Page zoom scales CSS pixels, but the macOS traffic lights are OS-drawn at
 * fixed NATIVE pixels (window.ts trafficLightPosition x:16 y:15; buttons end
 * ~x:68). The sidebar toggle must stay glued to them at every zoom level, so
 * its CSS geometry divides by the zoom factor: CSS px x factor = native px,
 * which is what these tests assert. Zoom commands travel the real path:
 * menu command -> renderer dispatch -> zoom:adjust IPC -> compensation var.
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-zoom-'))
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

/** Dispatch a zoom AppCommand through the same channel the menu uses. */
async function sendZoom(cmd: 'zoomIn' | 'zoomOut' | 'zoomReset'): Promise<void> {
  await app.evaluate(({ BrowserWindow }, c) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', c)
  }, cmd)
}

function currentZoomFactor(): Promise<number> {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor(),
  )
}

/** The toggle's geometry in NATIVE pixels (CSS box x zoom factor). */
async function toggleNativeBox(): Promise<{ left: number; centerY: number }> {
  const factor = await currentZoomFactor()
  const box = (await win.locator('.sidebar-toggle').boundingBox())!
  return { left: box.x * factor, centerY: (box.y + box.height / 2) * factor }
}

test('the sidebar toggle stays clear of the traffic lights when zoomed out', async () => {
  // Baseline at 100%: left edge ~80 native px, centered on the lights row (y21).
  const before = await toggleNativeBox()
  expect(before.left).toBeGreaterThan(70)
  expect(Math.abs(before.centerY - 21)).toBeLessThan(2)

  // Two zoom-out steps via the real menu command path.
  await sendZoom('zoomOut')
  await sendZoom('zoomOut')
  await expect.poll(currentZoomFactor).toBeLessThan(0.85)

  // The compensation var followed the factor...
  const cssVar = await win.evaluate(() =>
    document.documentElement.style.getPropertyValue('--zoom-factor'),
  )
  expect(Number(cssVar)).toBeCloseTo(await currentZoomFactor(), 3)

  // ...and the toggle still occupies the SAME native position: right of the
  // lights (which end ~x:68) and vertically centered on their row.
  const after = await toggleNativeBox()
  expect(after.left).toBeGreaterThan(70)
  expect(Math.abs(after.left - before.left)).toBeLessThan(2)
  expect(Math.abs(after.centerY - 21)).toBeLessThan(2)
})

test('zoom reset restores the 100% geometry', async () => {
  await sendZoom('zoomReset')
  await expect.poll(currentZoomFactor).toBe(1)
  const box = await toggleNativeBox()
  expect(box.left).toBeGreaterThan(70)
  expect(Math.abs(box.centerY - 21)).toBeLessThan(2)
})

test('the zoom factor persists to settings for the startup restore', async () => {
  await sendZoom('zoomIn')
  await expect.poll(currentZoomFactor).toBeGreaterThan(1)
  const factor = await currentZoomFactor()
  // The write is async behind the IPC; poll it through the settings bridge.
  await expect
    .poll(async () => (await win.evaluate(() => window.lekha.getSettings())).zoomFactor)
    .toBeCloseTo(factor, 3)
  await sendZoom('zoomReset')
})
