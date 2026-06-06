/**
 * Lekha end-to-end tests — Playwright Electron support.
 *
 * Flows tested:
 *   1. Window opens: ProseMirror editor visible, welcome-doc h1 present.
 *   2. Type renders: typing "# Hello E2E" produces an h1 via input rule.
 *   3. Source toggle: click status-bar button shows CodeMirror (.cm-editor);
 *      toggle back shows ProseMirror again.
 *   4. Find: open overlay by sending 'find' AppCommand via IPC (same path as
 *      the native menu Cmd+F -> main process -> webContents.send). Type a
 *      query present in the welcome doc; assert match count >= 1 and a
 *      .find-match highlight appears in the DOM.
 *   5. Save round-trip: skipped — requires a native file dialog that Playwright
 *      cannot drive. Save/write logic is covered by unit tests (tests/unit/).
 *
 * --- How commands are triggered ---
 *
 * Source toggle (test 3):
 *   We click the `.status-bar__mode-btn` button in the status bar. This is the
 *   same handler that Cmd+Alt+S routes to. The click is reliable in headless
 *   Electron because it's a DOM interaction, not a menu accelerator.
 *
 * Find (test 4):
 *   Meta+F sends the accelerator to the native macOS menu, but in headless
 *   Playwright-Electron the menu bar may not have OS focus to relay the
 *   keypress. Instead we use `app.evaluate` to call
 *   `BrowserWindow.getAllWindows()[0].webContents.send('app:command', 'find')`
 *   — the exact same IPC path the native menu click uses — which triggers
 *   useCommands > onFind() > React setState to open the overlay.
 *
 * --- Status-bar mode text note ---
 *
 *   The mode button text (WYSIWYG / Source) is driven by `useEditorStore`.
 *   toggleMode() now returns the new mode synchronously, so the store is
 *   updated with the correct value immediately - no stale-read lag.
 *   Tests assert both the DOM editor presence AND the button text label.
 *
 * Screenshots (written to tests/e2e/screenshots/) are artifacts for human
 * visual review of the GitHub-theme WYSIWYG look.
 */

import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// ESM-compatible __dirname (project uses "type": "module")
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROJECT_ROOT = path.resolve(__dirname, '../..')
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots')

// ---------------------------------------------------------------------------
// IPC channel constant — mirrors src/shared/ipc-channels.ts
// ---------------------------------------------------------------------------
const IPC_COMMAND = 'app:command'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure the screenshots directory exists before any test runs. */
function ensureScreenshotsDir(): void {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
}

/** Launch the built Electron app and return the app + first window. */
async function launchApp(): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: PROJECT_ROOT,
    // Keep NODE_ENV as 'production' so the app loads out/renderer/index.html
    // rather than attempting to connect to a dev server.
    // LEKHA_DISABLE_QUIT_GUARD disables the unsaved-changes dialog so
    // ElectronApplication.close() in afterAll does not hang waiting on a
    // native prompt. This flag must never be set in a real user launch.
    env: {
      ...process.env,
      NODE_ENV: 'production',
      LEKHA_DISABLE_QUIT_GUARD: '1',
    },
    timeout: 30_000,
  })

  const win = await app.firstWindow()

  // Wait for the renderer to finish its initial render. The ProseMirror
  // element is the last thing to appear — once it is visible the app is ready.
  await win.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })

  return { app, win }
}

/**
 * Send an AppCommand to the renderer via the same IPC path the native menu
 * uses: BrowserWindow.webContents.send(IPC_COMMAND, cmd).
 *
 * This is needed for menu-routed commands (find, replace, toggleSource)
 * because macOS native menu accelerators may not fire reliably in headless
 * Electron / Playwright.
 */
async function sendCommand(app: ElectronApplication, cmd: string): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { channel, command }) => {
      const wins = BrowserWindow.getAllWindows()
      wins[0]?.webContents.send(channel, command)
    },
    { channel: IPC_COMMAND, command: cmd },
  )
}

// ---------------------------------------------------------------------------
// Shared app instance — launched once for the whole file.
// Each test that mutates state restores a clean baseline via explicit steps.
// ---------------------------------------------------------------------------

let sharedApp: ElectronApplication
let sharedWin: Page

test.beforeAll(async () => {
  ensureScreenshotsDir()
  const { app, win } = await launchApp()
  sharedApp = app
  sharedWin = win
})

test.afterAll(async () => {
  await sharedApp.close()
})

// ---------------------------------------------------------------------------
// Test 1: Window opens
// ---------------------------------------------------------------------------

test('window opens with ProseMirror editor and welcome document heading', async () => {
  const win = sharedWin

  // The WYSIWYG editor div must be visible.
  await expect(win.locator('.ProseMirror')).toBeVisible()

  // The welcome document starts with "# Welcome to Lekha"
  await expect(win.locator('.ProseMirror h1').first()).toContainText('Welcome to Lekha')

  // Status bar is present (confirms full layout rendered)
  await expect(win.locator('.status-bar')).toBeVisible()

  // Bug 1 fix: the status bar must show non-zero word count on initial load.
  // Before the fix, the count was "0 words" because the mount effect was missing.
  const countEl = win.locator('.status-bar__counts')
  await expect(countEl).toBeVisible()
  const countText = await countEl.textContent()
  // Extract the word count number from e.g. "42 words · 180 chars"
  const wordMatch = /(\d+) words/.exec(countText ?? '')
  expect(wordMatch).not.toBeNull()
  const wordCount = parseInt(wordMatch?.[1] ?? '0', 10)
  expect(wordCount).toBeGreaterThan(0)

  // Capture the main welcome screenshot.
  await win.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'main-welcome.png'),
    fullPage: false,
  })
})

// ---------------------------------------------------------------------------
// Test 2: Typing triggers h1 input rule
// ---------------------------------------------------------------------------

test('typing "# Hello E2E" in the editor produces an h1 heading', async () => {
  const win = sharedWin

  // Ensure WYSIWYG mode. If the source editor is visible, switch back.
  if (await win.locator('.cm-editor').isVisible()) {
    await win.locator('.status-bar__mode-btn').click()
    await expect(win.locator('.ProseMirror')).toBeVisible()
  }

  // Click at the end of the editor content to position the cursor.
  const editor = win.locator('.ProseMirror')
  await editor.click()

  // Move to end of document, then type the new heading.
  // "# " at the start of a new line fires the ProseMirror heading input rule.
  await win.keyboard.press('Meta+End')        // cursor to very end of doc
  await win.keyboard.type('\n\n# Hello E2E ') // trailing space triggers input rule

  // The input rule converts "# " at line start into an h1 node.
  await expect(win.locator('.ProseMirror h1', { hasText: 'Hello E2E' })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Test 3: Source mode toggle
// ---------------------------------------------------------------------------

test('source mode toggle shows CodeMirror editor and toggles back to WYSIWYG', async () => {
  const win = sharedWin

  // Ensure WYSIWYG mode to start.
  if (await win.locator('.cm-editor').isVisible()) {
    await win.locator('.status-bar__mode-btn').click()
    await expect(win.locator('.ProseMirror')).toBeVisible()
  }

  // Click the mode toggle button to switch to source mode.
  const modeBtn = win.locator('.status-bar__mode-btn')
  await expect(modeBtn).toBeVisible()
  await modeBtn.click()

  // CodeMirror editor must be visible; ProseMirror must be gone.
  await expect(win.locator('.cm-editor')).toBeVisible()
  await expect(win.locator('.ProseMirror')).not.toBeVisible()

  // Bug 2 fix: status bar label must immediately show "Source" (no lag).
  // Before the fix, getMode() was called after toggleMode() but before React
  // re-rendered, so the label stayed "WYSIWYG" after switching to source.
  await expect(modeBtn).toHaveText('Source')

  // Capture source-mode screenshot.
  await win.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'source-mode.png'),
    fullPage: false,
  })

  // Toggle back to WYSIWYG by clicking the button again.
  await modeBtn.click()

  await expect(win.locator('.ProseMirror')).toBeVisible()
  await expect(win.locator('.cm-editor')).not.toBeVisible()

  // Mode label must revert to "WYSIWYG" immediately.
  await expect(modeBtn).toHaveText('WYSIWYG')
})

// ---------------------------------------------------------------------------
// Test 4: Find overlay
// ---------------------------------------------------------------------------

test('find overlay opens via IPC command, highlights matches, and shows count', async () => {
  const win = sharedWin

  // Ensure WYSIWYG mode — find highlights only work in WYSIWYG.
  if (await win.locator('.cm-editor').isVisible()) {
    await win.locator('.status-bar__mode-btn').click()
    await expect(win.locator('.ProseMirror')).toBeVisible()
  }

  // Close any lingering find overlay from a previous run.
  if (await win.locator('.find-replace-overlay').isVisible()) {
    await win.keyboard.press('Escape')
    await expect(win.locator('.find-replace-overlay')).not.toBeVisible()
  }

  // Send the 'find' AppCommand via the same IPC path as the native menu.
  // This is more reliable than firing a keyboard accelerator in headless Electron
  // where the macOS native menu bar may not have OS-level focus.
  await sendCommand(sharedApp, 'find')

  // The find overlay should appear.
  await expect(win.locator('.find-replace-overlay')).toBeVisible()

  // Type a search term that is guaranteed to appear in the welcome document.
  // "Lekha" appears in the h1 and in paragraph text.
  const findInput = win.locator('.find-replace-input').first()
  await expect(findInput).toBeVisible()
  await findInput.fill('Lekha')

  // Wait for the match count label to reflect the results.
  // Format is either "No matches" or "X / Y".
  const countSpan = win.locator('.find-replace-count')
  await expect(countSpan).toBeVisible()
  await expect(countSpan).not.toHaveText('No matches', { timeout: 5_000 })

  // At least one .find-match decoration should be present in the DOM.
  await expect(win.locator('.find-match').first()).toBeVisible()

  // Capture find-overlay screenshot.
  await win.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'find-overlay.png'),
    fullPage: false,
  })

  // Close the overlay cleanly via Escape.
  await win.keyboard.press('Escape')
  await expect(win.locator('.find-replace-overlay')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Test 5: New Window - multi-window support
// ---------------------------------------------------------------------------
//
// Triggers the 'newWindow' AppCommand on the focused window via the same IPC
// path the native menu/keyboard uses. This exercises the full multi-window
// chain: renderer dispatch (useCommands) -> preload window.lekha.newWindow()
// -> IPC window:new -> main openNewWindow() -> a second BrowserWindow.
//
// We assert a SECOND window appears and that it has its own independent
// ProseMirror editor. The extra window is closed at the end so the shared
// app teardown stays clean. (LEKHA_DISABLE_QUIT_GUARD is set, so closing a
// dirty window never blocks on a native dialog.)

test('New Window opens a second independent window with its own editor', async () => {
  // Sanity: start from a single window.
  expect(sharedApp.windows().length).toBe(1)

  // Trigger 'newWindow' on the first window via the IPC command path.
  await sendCommand(sharedApp, 'newWindow')

  // Wait for the second window to appear.
  const secondWin = await sharedApp.waitForEvent('window', { timeout: 10_000 })
  await secondWin.waitForLoadState('domcontentloaded')

  // Two windows are now open.
  expect(sharedApp.windows().length).toBe(2)

  // The new window has its OWN ProseMirror editor (independent document).
  await secondWin.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })
  await expect(secondWin.locator('.ProseMirror')).toBeVisible()
  await expect(secondWin.locator('.ProseMirror h1').first()).toContainText('Welcome to Lekha')

  // The original window still has its own editor (windows are independent).
  await expect(sharedWin.locator('.ProseMirror')).toBeVisible()

  // Close the extra window so the shared-app teardown is left with one window.
  await secondWin.close()
  await expect.poll(() => sharedApp.windows().length, { timeout: 10_000 }).toBe(1)
})

// ---------------------------------------------------------------------------
// Test 6: Save round-trip - SKIPPED
// ---------------------------------------------------------------------------
// The save flow opens a native OS file-picker dialog that Playwright cannot
// drive. Save/write logic (IPC handlers, file writing) is fully covered by
// unit tests in tests/unit/main/.
//
// test.skip('save round-trip', ...)
