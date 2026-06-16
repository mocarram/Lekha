/**
 * Site screenshots - captures the marketing screenshots for the GitHub Pages
 * landing site from the BUILT app, driven against a synthetic sample workspace
 * (tests/e2e/fixtures/site-workspace). Nothing here touches real user files:
 * the workspace is copied to a throwaway temp dir and every launch uses an
 * isolated --user-data-dir, so the shots are fully reproducible and contain
 * zero personal data.
 *
 * Each shot launches a fresh app with a seeded settings.json (theme, open tabs,
 * window color, window bounds), waits for the relevant content to render, and
 * writes a PNG to tests/e2e/screenshots/site/. Run with the app already built:
 *   npm run build && npx playwright test siteScreenshots
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const FIXTURES = path.join(__dirname, 'fixtures', 'site-workspace')
const OUT_DIR = path.join(__dirname, 'screenshots', 'site')

// The workspace is copied to a temp dir whose final segment is a presentable
// name, because the sidebar header shows the open folder's basename.
const WORKSPACE = path.join(os.tmpdir(), 'lekha-site-workspace', 'Field Notes')
const GETTING_STARTED = path.join(WORKSPACE, 'Getting Started.md')
const MARKDOWN_REF = path.join(WORKSPACE, 'Markdown Reference.md')
const MATH = path.join(WORKSPACE, 'Math & Diagrams.md')
const ROADMAP = path.join(WORKSPACE, 'Roadmap.md')

/** Window content size for every shot - a roomy, crisp landing-page size. */
const BOUNDS = { x: 40, y: 40, width: 1480, height: 940 }

test.beforeAll(() => {
  fs.rmSync(WORKSPACE, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(WORKSPACE), { recursive: true })
  fs.cpSync(FIXTURES, WORKSPACE, { recursive: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
})

/** Launch the built app with a seeded settings.json (merged over sane defaults). */
async function launchWith(
  settings: Record<string, unknown>,
): Promise<{ app: ElectronApplication; win: Page }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lekha-site-ud-'))
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({
      lastFolder: WORKSPACE,
      sidebarVisible: true,
      sidebarTab: 'files',
      sidebarWidth: 270,
      fontSize: 17,
      windowBounds: BOUNDS,
      ...settings,
    }),
    'utf8',
  )
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: PROJECT_ROOT,
    env: { ...process.env, NODE_ENV: 'production', LEKHA_DISABLE_QUIT_GUARD: '1' },
    timeout: 30_000,
  })
  const win = await app.firstWindow()
  await win.waitForSelector('.ProseMirror', { state: 'visible', timeout: 20_000 })
  await win.waitForSelector('.file-tree__name', { state: 'visible', timeout: 15_000 })
  return { app, win }
}

/** The resolved --window-color CSS var (empty string when unset). */
function windowColorVar(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--window-color').trim(),
  )
}

/**
 * Paint macOS traffic-light dots at the window's reserved position. Playwright
 * captures only the web contents, so the native traffic lights are absent and
 * the app leaves an empty gap at the top-left for them (BrowserWindow
 * trafficLightPosition { x: 16, y: 15 }). We draw faithful dots into that gap -
 * 12px circles, 20px apart - so each shot reads as a real Lekha window.
 */
async function injectTrafficLights(win: Page): Promise<void> {
  await win.evaluate(() => {
    if (document.getElementById('__traffic-lights')) return
    const bar = document.createElement('div')
    bar.id = '__traffic-lights'
    bar.style.cssText =
      'position:fixed;top:15px;left:16px;display:flex;gap:8px;z-index:2147483647;pointer-events:none;'
    const colors = ['#ff5f57', '#febc2e', '#28c840']
    for (const color of colors) {
      const dot = document.createElement('span')
      dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};`
      bar.appendChild(dot)
    }
    document.body.appendChild(bar)
  })
}

/** Full-window shot with traffic lights painted in. */
async function shoot(win: Page, name: string): Promise<void> {
  await injectTrafficLights(win)
  await win.screenshot({ path: path.join(OUT_DIR, name), fullPage: false })
}

/** Cropped shot of a specific region (CSS px) - used for the theme corner tiles. */
async function shootClip(
  win: Page,
  name: string,
  clip: { x: number; y: number; width: number; height: number },
): Promise<void> {
  await injectTrafficLights(win)
  await win.screenshot({ path: path.join(OUT_DIR, name), clip })
}

// ---------------------------------------------------------------------------
// Primary - the hero shot: full app, midnight theme, a few tabs, showcase doc.
// ---------------------------------------------------------------------------
test('primary (hero)', async () => {
  const { app, win } = await launchWith({
    theme: 'midnight',
    openTabPaths: [GETTING_STARTED, MARKDOWN_REF, MATH],
    activeTabPath: GETTING_STARTED,
  })
  await expect(win.locator('.ProseMirror h1').first()).toContainText('Getting started')
  await win.waitForTimeout(500)
  await shoot(win, 'primary.png')
  await app.close()
})

// ---------------------------------------------------------------------------
// Sidebar / folders / tabs - Topics subfolder expanded, multiple tabs.
// ---------------------------------------------------------------------------
test('sidebar, folders & tabs', async () => {
  const { app, win } = await launchWith({
    theme: 'midnight',
    openTabPaths: [GETTING_STARTED, ROADMAP, MARKDOWN_REF],
    activeTabPath: GETTING_STARTED,
  })
  await win.locator('.file-tree__row--dir', { hasText: 'Topics' }).click()
  await expect(win.locator('.file-tree__name', { hasText: 'Architecture.md' })).toBeVisible({
    timeout: 10_000,
  })
  await win.waitForTimeout(400)
  await shoot(win, 'sidebar.png')
  await app.close()
})

// ---------------------------------------------------------------------------
// Themes gallery - all nine themes, each cropped to the top-left corner
// (sidebar + heading), where a theme's colors read most clearly. These tiles
// are stacked into a cascade on the site, so only the relevant area is shown.
// ---------------------------------------------------------------------------
// Ordered light -> dark so the cascade reads as a gradient.
const THEME_IDS = [
  'github',
  'sepia',
  'solarized-light',
  'nord',
  'solarized-dark',
  'night',
  'graphite',
  'midnight',
  'high-contrast',
] as const
// Sidebar (270px) + the editor heading/intro; tall enough for the title row,
// the h1, and the first lines - the most theme-distinguishing region.
const THEME_CROP = { x: 0, y: 0, width: 880, height: 300 }

for (const theme of THEME_IDS) {
  test(`theme: ${theme}`, async () => {
    const { app, win } = await launchWith({
      theme,
      openTabPaths: [GETTING_STARTED],
      activeTabPath: GETTING_STARTED,
    })
    await expect(win.locator('.ProseMirror h1').first()).toContainText('Getting started')
    await win.waitForTimeout(500)
    await shootClip(win, `theme-${theme}.png`, THEME_CROP)
    await app.close()
  })
}

// ---------------------------------------------------------------------------
// Math & diagrams - wait for KaTeX and a rendered Mermaid SVG before shooting.
// ---------------------------------------------------------------------------
test('math & diagrams', async () => {
  const { app, win } = await launchWith({
    theme: 'midnight',
    openTabPaths: [MATH, GETTING_STARTED],
    activeTabPath: MATH,
  })
  await win.waitForSelector('.katex', { state: 'visible', timeout: 15_000 })
  await win.waitForSelector('.diagram-preview svg', { state: 'visible', timeout: 15_000 })
  await win.waitForTimeout(700)
  await shoot(win, 'math.png')
  await app.close()
})

// ---------------------------------------------------------------------------
// Window colors - two windows tinted differently, one shot each (side by side
// on the site). Seeded folderColors paints the --window-color rail on launch.
// ---------------------------------------------------------------------------
for (const [color, file] of [
  ['#0d9488', 'window-color-teal.png'],
  ['#d9730d', 'window-color-amber.png'],
] as const) {
  test(`window color: ${color}`, async () => {
    const { app, win } = await launchWith({
      theme: 'midnight',
      openTabPaths: [GETTING_STARTED],
      activeTabPath: GETTING_STARTED,
      folderColors: { [WORKSPACE]: color },
    })
    await expect.poll(() => windowColorVar(win)).toBe(color)
    await win.waitForTimeout(400)
    await shoot(win, file)
    await app.close()
  })
}
