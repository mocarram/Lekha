// @vitest-environment node
/**
 * Unit tests for Focus Mode and Typewriter Mode items in the View menu.
 *
 * These are plain command items (like Toggle Sidebar) that send AppCommands
 * to the renderer, which owns the checked/toggle state. The menu items do not
 * use Electron's checkbox type - the renderer applies the mode class/attr and
 * persists the flag. This is the simplest approach and keeps buildMenuTemplate
 * synchronous (same pattern as Toggle Sidebar / Toggle Source Mode).
 */
import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildMenuTemplate } from '../../../src/main/menu'
import type { AppCommand } from '../../../src/shared/commands'

// ---------------------------------------------------------------------------
// Helpers (duplicated from menu.test.ts to keep tests isolated)
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

function clickItem(menuItem: MenuItemConstructorOptions): void {
  if (menuItem.click) {
    // @ts-expect-error calling with no args is safe for our generated handlers
    menuItem.click()
  }
}

function getViewSubmenu(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  const view = template.find((t) => t.label === 'View')
  return (view?.submenu as MenuItemConstructorOptions[]) ?? []
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - View menu Focus/Typewriter Mode items', () => {
  it('View menu contains a Focus Mode item', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const viewItems = getViewSubmenu(template)
    const labels = viewItems.map((i) => i.label)
    expect(labels).toContain('Focus Mode')
  })

  it('View menu contains a Typewriter Mode item', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const viewItems = getViewSubmenu(template)
    const labels = viewItems.map((i) => i.label)
    expect(labels).toContain('Typewriter Mode')
  })

  it('Focus Mode item sends "toggleFocusMode" command when clicked', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Focus Mode')
    expect(item).toBeDefined()
    clickItem(item!)
    expect(send).toHaveBeenCalledWith('toggleFocusMode')
  })

  it('Typewriter Mode item sends "toggleTypewriterMode" command when clicked', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Typewriter Mode')
    expect(item).toBeDefined()
    clickItem(item!)
    expect(send).toHaveBeenCalledWith('toggleTypewriterMode')
  })

  it('Focus Mode has F8 accelerator', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Focus Mode')
    expect(item?.accelerator).toBe('F8')
  })

  it('Typewriter Mode has F9 accelerator', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Typewriter Mode')
    expect(item?.accelerator).toBe('F9')
  })
})
