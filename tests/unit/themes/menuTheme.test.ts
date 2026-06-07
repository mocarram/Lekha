// @vitest-environment node
/**
 * Tests for the Theme submenu added to buildMenuTemplate.
 *
 * Verifies:
 *  - The menu includes a "Theme" submenu (top-level or nested)
 *  - All THEMES are listed as items
 *  - The current theme item has checked:true, others have checked:false
 *  - Clicking an item calls the setTheme callback with the correct id
 *  - The existing menu structure (File/Edit/Format/View) is not broken
 *  - Old callers with no themeMenu arg still compile and produce a menu
 */
import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildMenuTemplate } from '../../../src/main/menu'
// Import from shared (not renderer) so this node-environment test doesn't pull
// in renderer modules that depend on the DOM API (document, etc.).
import { THEMES } from '../../../src/shared/types'
import type { ThemeDef } from '../../../src/shared/types'

// ---------------------------------------------------------------------------
// Helpers (mirrors menu.test.ts helpers, intentionally duplicated so each
// file is self-contained and readable without cross-file references)
// ---------------------------------------------------------------------------

function findItem(
  items: MenuItemConstructorOptions[],
  predicate: (item: MenuItemConstructorOptions) => boolean,
): MenuItemConstructorOptions | undefined {
  for (const item of items) {
    if (predicate(item)) return item
    const sub = item.submenu
    if (sub && Array.isArray(sub)) {
      const found = findItem(sub, predicate)
      if (found) return found
    }
  }
  return undefined
}

function findThemeSubmenu(
  template: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] | undefined {
  const themeParent = findItem(template, (i) => i.label === 'Theme')
  if (!themeParent?.submenu) return undefined
  return themeParent.submenu as MenuItemConstructorOptions[]
}

// ---------------------------------------------------------------------------
// Build helpers for the themeMenu arg
// ---------------------------------------------------------------------------

function makeThemeMenu(current: string, themes: ThemeDef[] = THEMES): { themes: ThemeDef[]; current: string } {
  return { themes, current }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - backward compatibility', () => {
  it('works with no themeMenu argument (old callers)', () => {
    const send = vi.fn()
    // Should not throw; existing callers omit the arg.
    const template = buildMenuTemplate(send, [], vi.fn())
    expect(template).toBeDefined()
    expect(template.length).toBeGreaterThan(0)
  })

  it('still contains File, Edit, Format, View with no themeMenu', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const labels = template.map((i) => i.label)
    expect(labels).toContain('File')
    expect(labels).toContain('Edit')
    expect(labels).toContain('Format')
    expect(labels).toContain('View')
  })
})

describe('buildMenuTemplate - Theme submenu', () => {
  it('includes a "Theme" submenu when themeMenu is provided', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), setTheme)
    const themeItem = findItem(template, (i) => i.label === 'Theme')
    expect(themeItem).toBeDefined()
    expect(themeItem!.submenu).toBeDefined()
  })

  it('Theme submenu lists all THEMES from the registry', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), setTheme)
    const items = findThemeSubmenu(template)
    expect(items).toBeDefined()
    const labels = items!.map((i) => i.label)
    for (const theme of THEMES) {
      expect(labels).toContain(theme.label)
    }
  })

  it('current theme item has checked:true', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('night'), setTheme)
    const items = findThemeSubmenu(template)
    expect(items).toBeDefined()
    const nightItem = items!.find((i) => i.label === 'Night')
    expect(nightItem).toBeDefined()
    expect(nightItem!.checked).toBe(true)
  })

  it('non-current theme items have checked:false', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('night'), setTheme)
    const items = findThemeSubmenu(template)
    expect(items).toBeDefined()
    const githubItem = items!.find((i) => i.label === 'GitHub')
    const sepiaItem = items!.find((i) => i.label === 'Sepia')
    expect(githubItem!.checked).toBe(false)
    expect(sepiaItem!.checked).toBe(false)
  })

  it('clicking a theme item calls setTheme with its id', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), setTheme)
    const items = findThemeSubmenu(template)
    expect(items).toBeDefined()
    const nightItem = items!.find((i) => i.label === 'Night')
    expect(nightItem).toBeDefined()
    // @ts-expect-error calling click with no args is safe - handler ignores Electron args
    nightItem!.click()
    expect(setTheme).toHaveBeenCalledWith('night')
  })

  it('clicking "GitHub" theme item calls setTheme("github")', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('night'), setTheme)
    const items = findThemeSubmenu(template)
    const githubItem = items!.find((i) => i.label === 'GitHub')
    expect(githubItem).toBeDefined()
    // @ts-expect-error calling with no args is safe
    githubItem!.click()
    expect(setTheme).toHaveBeenCalledWith('github')
  })

  it('clicking "Sepia" theme item calls setTheme("sepia")', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), setTheme)
    const items = findThemeSubmenu(template)
    const sepiaItem = items!.find((i) => i.label === 'Sepia')
    expect(sepiaItem).toBeDefined()
    // @ts-expect-error calling with no args is safe
    sepiaItem!.click()
    expect(setTheme).toHaveBeenCalledWith('sepia')
  })

  it('clicking a theme item does NOT call the send(AppCommand) callback', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), setTheme)
    const items = findThemeSubmenu(template)
    const nightItem = items!.find((i) => i.label === 'Night')
    // @ts-expect-error calling with no args is safe
    nightItem!.click()
    expect(send).not.toHaveBeenCalled()
  })

  it('built-in theme items use type "radio"', () => {
    const send = vi.fn()
    const setTheme = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), setTheme)
    const items = findThemeSubmenu(template)
    expect(items).toBeDefined()
    const radios = items!.filter((i) => i.type === 'radio')
    expect(radios.length).toBe(THEMES.length)
    // Every built-in theme is represented by a radio item.
    const radioLabels = radios.map((i) => i.label)
    for (const t of THEMES) expect(radioLabels).toContain(t.label)
  })
})

describe('buildMenuTemplate - Theme submenu actions + user themes', () => {
  it('includes "Open Theme Folder" and "Reload Themes" action items', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), vi.fn())
    const labels = findThemeSubmenu(template)!.map((i) => i.label)
    expect(labels).toContain('Open Theme Folder')
    expect(labels).toContain('Reload Themes')
  })

  it('"Open Theme Folder" sends the openThemeFolder command', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn(), makeThemeMenu('github'), vi.fn())
    const item = findThemeSubmenu(template)!.find((i) => i.label === 'Open Theme Folder')
    expect(item).toBeDefined()
    // @ts-expect-error calling with no args is safe
    item!.click()
    expect(send).toHaveBeenCalledWith('openThemeFolder')
  })

  it('"Reload Themes" invokes the onReloadThemes callback', () => {
    const send = vi.fn()
    const onReload = vi.fn()
    const template = buildMenuTemplate(
      send, [], vi.fn(), makeThemeMenu('github'), vi.fn(),
      undefined, undefined, undefined, onReload,
    )
    const item = findThemeSubmenu(template)!.find((i) => i.label === 'Reload Themes')
    expect(item).toBeDefined()
    // @ts-expect-error calling with no args is safe
    item!.click()
    expect(onReload).toHaveBeenCalledOnce()
  })

  it('lists user themes after the built-ins as radios', () => {
    const send = vi.fn()
    const themeMenu = {
      themes: [...THEMES, { id: 'abyss', label: 'Abyss' }, { id: 'zen', label: 'Zen' }],
      current: 'abyss',
      userThemeCount: 2,
    }
    const template = buildMenuTemplate(send, [], vi.fn(), themeMenu, vi.fn())
    const items = findThemeSubmenu(template)!
    const radios = items.filter((i) => i.type === 'radio')
    expect(radios.map((i) => i.label)).toContain('Abyss')
    expect(radios.map((i) => i.label)).toContain('Zen')
    // The active user theme is checked.
    expect(radios.find((i) => i.label === 'Abyss')!.checked).toBe(true)
  })
})
