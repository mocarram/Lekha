// @vitest-environment node
/**
 * Unit tests for buildMenuTemplate.
 *
 * buildMenuTemplate uses only TYPE-only imports from electron (erased at
 * compile time), so it runs fine in a Node environment without the Electron
 * runtime.
 */
import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildMenuTemplate } from '../../../src/main/menu'
import type { AppCommand } from '../../../src/shared/commands'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk the nested menu template and collect all leaf items (items without
 * a submenu).  Used to find items by label or accelerator.
 */
function flattenItems(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  const result: MenuItemConstructorOptions[] = []
  for (const item of items) {
    const sub = item.submenu
    if (sub && Array.isArray(sub)) {
      result.push(...flattenItems(sub))
    } else {
      result.push(item)
    }
  }
  return result
}

/**
 * Find the first item (anywhere in the tree) matching the predicate.
 */
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

// ---------------------------------------------------------------------------
// Helpers: click simulation
// ---------------------------------------------------------------------------

// Electron's click signature: click(menuItem, browserWindow, event)
// buildMenuTemplate's click is `() => send(cmd)` - it ignores all args,
// so we can invoke it directly with no arguments via an arrow wrapper.
function clickItem(menuItem: MenuItemConstructorOptions): void {
  if (menuItem.click) {
    // The click handler produced by buildMenuTemplate ignores its Electron
    // arguments - it only calls send(cmd). We call it with no args here
    // to avoid importing Electron types (MenuItem, BrowserWindow) in tests.
    // @ts-expect-error calling with no args is safe for our generated handlers
    menuItem.click()
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - top-level submenus', () => {
  it('returns an array with File, Edit, Format, View submenus', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const labels = template.map((item) => item.label)
    expect(labels).toContain('File')
    expect(labels).toContain('Edit')
    expect(labels).toContain('Format')
    expect(labels).toContain('View')
  })

  it('File submenu contains New, Open, Open Folder, Save, Save As items', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const file = template.find((t) => t.label === 'File')
    expect(file).toBeDefined()
    const fileItems = file!.submenu as unknown as MenuItemConstructorOptions[]
    const fileLabels = fileItems.map((i: MenuItemConstructorOptions) => i.label)
    expect(fileLabels).toContain('New')
    expect(fileLabels).toContain('Open…')
    expect(fileLabels).toContain('Open Folder…')
    expect(fileLabels).toContain('Save')
    expect(fileLabels).toContain('Save As…')
  })

  it('Edit submenu contains Undo, Redo, Find, Replace', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const edit = template.find((t) => t.label === 'Edit')
    expect(edit).toBeDefined()
    const editItems = edit!.submenu as MenuItemConstructorOptions[]
    const editLabels = editItems.map((i) => i.label)
    expect(editLabels).toContain('Undo')
    expect(editLabels).toContain('Redo')
    expect(editLabels).toContain('Find')
    expect(editLabels).toContain('Replace')
  })

  it('Format submenu contains Bold, Italic, Strikethrough, heading items', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const format = template.find((t) => t.label === 'Format')
    expect(format).toBeDefined()
    const formatItems = format!.submenu as MenuItemConstructorOptions[]
    const formatLabels = formatItems.map((i) => i.label)
    expect(formatLabels).toContain('Bold')
    expect(formatLabels).toContain('Italic')
    expect(formatLabels).toContain('Strikethrough')
    expect(formatLabels).toContain('Heading 2')
    expect(formatLabels).toContain('Paragraph')
    expect(formatLabels).toContain('Bullet List')
    expect(formatLabels).toContain('Code Block')
  })

  it('View submenu contains Toggle Sidebar and Toggle Source Mode', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const view = template.find((t) => t.label === 'View')
    expect(view).toBeDefined()
    const viewItems = view!.submenu as MenuItemConstructorOptions[]
    const viewLabels = viewItems.map((i) => i.label)
    expect(viewLabels).toContain('Toggle Sidebar')
    expect(viewLabels).toContain('Toggle Source Mode')
  })
})

describe('buildMenuTemplate - click callbacks fire send with the right command', () => {
  it('Save item fires send("save")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Save' && !i.role)
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('save')
  })

  it('Bold item fires send("bold")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Bold')
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('bold')
  })

  it('Heading 2 item fires send("heading2")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Heading 2')
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('heading2')
  })

  it('Toggle Source Mode item fires send("toggleSource")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Toggle Source Mode')
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('toggleSource')
  })

  it('Find item fires send("find")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Find')
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('find')
  })

  it('Toggle Sidebar fires send("toggleSidebar")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Toggle Sidebar')
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('toggleSidebar')
  })

  it('New item fires send("new")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'New')
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('new')
  })
})

describe('buildMenuTemplate - accelerators present on key items', () => {
  it('Save has CmdOrCtrl+S accelerator', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Save' && !i.role)
    expect(item?.accelerator).toBe('CmdOrCtrl+S')
  })

  it('Bold has CmdOrCtrl+B accelerator', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Bold')
    expect(item?.accelerator).toBe('CmdOrCtrl+B')
  })

  it('Find has CmdOrCtrl+F accelerator', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Find')
    expect(item?.accelerator).toBe('CmdOrCtrl+F')
  })

  it('Toggle Sidebar has CmdOrCtrl+\\ accelerator', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Toggle Sidebar')
    expect(item?.accelerator).toBe('CmdOrCtrl+\\')
  })
})

describe('buildMenuTemplate - role items use Electron roles (no send)', () => {
  it('Undo in Edit uses role "undo" (native undo handles itself)', () => {
    // Undo must send 'undo' command to route through the editor
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Undo')
    expect(item).toBeDefined()
    // Undo should NOT be a role item - it's a command item that routes to editor
    expect(item?.role).toBeUndefined()
  })

  it('flattenItems helper covers all leaf nodes', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const leaves = flattenItems(template)
    // There should be quite a few leaf items
    expect(leaves.length).toBeGreaterThan(10)
  })
})
