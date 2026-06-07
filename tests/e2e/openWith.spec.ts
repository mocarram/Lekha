/**
 * "Open With" / double-click support.
 *
 * macOS delivers a file the user opens with Lekha through the `open-file` app
 * event. This test drives the real main-process handler end-to-end: it emits
 * `open-file` on the running app (exactly as the OS would for a running
 * instance) and asserts the file's content lands in the editor. This exercises
 * handleOpenFile -> openFileInApp -> IPC.openPath -> the renderer's open flow.
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
let tmpDir: string

test.beforeAll(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-ow-'))
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-ow-docs-'))
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

test('opening a file via the open-file event loads it into the editor', async () => {
  const filePath = path.join(tmpDir, 'opened-via-finder.md')
  const heading = 'OpenWith Heading 12345'
  fs.writeFileSync(filePath, `# ${heading}\n\nOpened from the OS.\n`, 'utf8')

  // Emit the macOS open-file event exactly as the OS does when a running app is
  // asked to open a document (e.g. via "Open With" or double-click).
  await app.evaluate(({ app }, p) => {
    app.emit('open-file', { preventDefault: () => {} }, p)
  }, filePath)

  // The renderer opens the file and shows its content.
  await expect(win.locator('.ProseMirror h1', { hasText: heading })).toBeVisible({
    timeout: 10_000,
  })
})
