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

  it('File submenu contains New, New Window, Open, Open Folder, Save, Save As items', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const file = template.find((t) => t.label === 'File')
    expect(file).toBeDefined()
    const fileItems = file!.submenu as unknown as MenuItemConstructorOptions[]
    const fileLabels = fileItems.map((i: MenuItemConstructorOptions) => i.label)
    expect(fileLabels).toContain('New')
    expect(fileLabels).toContain('New Window')
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

  it('Format submenu contains inline formatting commands', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const format = template.find((t) => t.label === 'Format')
    expect(format).toBeDefined()
    const formatItems = format!.submenu as MenuItemConstructorOptions[]
    const formatLabels = formatItems.map((i) => i.label)
    expect(formatLabels).toContain('Bold')
    expect(formatLabels).toContain('Italic')
    expect(formatLabels).toContain('Strikethrough')
    expect(formatLabels).toContain('Insert Link…')
    // Block-level items now live in the dedicated Paragraph menu.
    expect(formatLabels).not.toContain('Heading 2')
    expect(formatLabels).not.toContain('Bullet List')
  })

  it('Paragraph submenu contains block-level structure commands', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const para = template.find((t) => t.label === 'Paragraph')
    expect(para).toBeDefined()
    const paraItems = para!.submenu as MenuItemConstructorOptions[]
    const paraLabels = paraItems.map((i) => i.label)
    expect(paraLabels).toContain('Heading 2')
    expect(paraLabels).toContain('Paragraph')
    expect(paraLabels).toContain('Increase Heading Level')
    expect(paraLabels).toContain('Decrease Heading Level')
    expect(paraLabels).toContain('Bullet List')
    expect(paraLabels).toContain('Code Block')
    expect(paraLabels).toContain('Indent')
    expect(paraLabels).toContain('Outdent')
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

  it('Window submenu contains tab-navigation commands', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)

    const win = template.find((t) => t.label === 'Window')
    expect(win).toBeDefined()
    const winItems = win!.submenu as MenuItemConstructorOptions[]
    const winLabels = winItems.map((i) => i.label)
    expect(winLabels).toContain('Next Tab')
    expect(winLabels).toContain('Previous Tab')
    expect(winLabels).toContain('Close Tab')
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

describe('buildMenuTemplate - New Window', () => {
  it('has a New Window item with CmdOrCtrl+Shift+N accelerator', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'New Window')
    expect(item).toBeDefined()
    expect(item?.accelerator).toBe('CmdOrCtrl+Shift+N')
  })

  it('clicking New Window invokes onNewWindow (not the renderer send channel)', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const onNewWindow = vi.fn()
    // onNewWindow is the 6th positional arg; recents/openPath/themeMenu/setTheme
    // keep their defaults.
    const template = buildMenuTemplate(send, [], undefined, undefined, undefined, onNewWindow)
    const item = findItem(template, (i) => i.label === 'New Window')
    expect(item).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    item!.click()
    expect(onNewWindow).toHaveBeenCalledTimes(1)
    // New Window opens a window directly in main; it must NOT route through the
    // focused-window renderer command channel.
    expect(send).not.toHaveBeenCalled()
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

// ---------------------------------------------------------------------------
// Open Recent submenu tests
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - Open Recent submenu', () => {
  /**
   * Find the "Open Recent" submenu from the File menu.
   */
  function findOpenRecentSubmenu(
    template: MenuItemConstructorOptions[],
  ): MenuItemConstructorOptions[] | undefined {
    const fileMenu = template.find((t) => t.label === 'File')
    if (!fileMenu) return undefined
    const fileItems = fileMenu.submenu as MenuItemConstructorOptions[]
    const openRecent = fileItems.find((i) => i.label === 'Open Recent')
    if (!openRecent?.submenu) return undefined
    return openRecent.submenu as MenuItemConstructorOptions[]
  }

  it('File menu contains an "Open Recent" submenu', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn())
    const fileMenu = template.find((t) => t.label === 'File')
    expect(fileMenu).toBeDefined()
    const fileItems = fileMenu!.submenu as MenuItemConstructorOptions[]
    const labels = fileItems.map((i) => i.label)
    expect(labels).toContain('Open Recent')
  })

  it('shows "No Recent Files" (disabled) when recentFiles is empty', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send, [], vi.fn())
    const items = findOpenRecentSubmenu(template)
    expect(items).toBeDefined()
    expect(items).toHaveLength(1)
    expect(items![0]!.label).toBe('No Recent Files')
    expect(items![0]!.enabled).toBe(false)
  })

  it('lists recent files by basename when recentFiles are provided', () => {
    const send = vi.fn()
    const recentFiles = ['/home/user/docs/note.md', '/home/user/projects/readme.md']
    const template = buildMenuTemplate(send, recentFiles, vi.fn())
    const items = findOpenRecentSubmenu(template)
    expect(items).toBeDefined()
    expect(items).toHaveLength(2)
    expect(items![0]!.label).toBe('note.md')
    expect(items![1]!.label).toBe('readme.md')
  })

  it('clicking a recent item calls openPath with the full path', () => {
    const send = vi.fn()
    const openPath = vi.fn()
    const recentFiles = ['/home/user/docs/note.md', '/home/user/projects/readme.md']
    const template = buildMenuTemplate(send, recentFiles, openPath)
    const items = findOpenRecentSubmenu(template)
    expect(items).toBeDefined()

    // Click the first item (note.md -> full path /home/user/docs/note.md)
    // @ts-expect-error calling with no args is safe - handler ignores Electron args
    items![0]!.click()
    expect(openPath).toHaveBeenCalledWith('/home/user/docs/note.md')
    expect(send).not.toHaveBeenCalled()
  })

  it('clicking the second recent item calls openPath with that full path', () => {
    const send = vi.fn()
    const openPath = vi.fn()
    const recentFiles = ['/a/first.md', '/b/second.md', '/c/third.md']
    const template = buildMenuTemplate(send, recentFiles, openPath)
    const items = findOpenRecentSubmenu(template)
    expect(items).toBeDefined()

    // @ts-expect-error calling with no args is safe
    items![1]!.click()
    expect(openPath).toHaveBeenCalledWith('/b/second.md')
  })

  it('caps the Open Recent list at 10 entries', () => {
    const send = vi.fn()
    const recentFiles = Array.from({ length: 15 }, (_, i) => `/files/file${i}.md`)
    const template = buildMenuTemplate(send, recentFiles, vi.fn())
    const items = findOpenRecentSubmenu(template)
    expect(items).toBeDefined()
    expect(items!.length).toBe(10)
  })

  it('does not call send when a recent item is clicked (separate channel)', () => {
    const send = vi.fn()
    const openPath = vi.fn()
    const template = buildMenuTemplate(send, ['/docs/note.md'], openPath)
    const items = findOpenRecentSubmenu(template)
    // @ts-expect-error calling with no args is safe
    items![0]!.click()
    expect(send).not.toHaveBeenCalled()
    expect(openPath).toHaveBeenCalledWith('/docs/note.md')
  })
})

// ---------------------------------------------------------------------------
// Export submenu tests
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - Export submenu', () => {
  function findExportSubmenu(
    template: MenuItemConstructorOptions[],
  ): MenuItemConstructorOptions[] | undefined {
    const fileMenu = template.find((t) => t.label === 'File')
    if (!fileMenu) return undefined
    const fileItems = fileMenu.submenu as MenuItemConstructorOptions[]
    const exportItem = fileItems.find((i) => i.label === 'Export')
    if (!exportItem?.submenu) return undefined
    return exportItem.submenu as MenuItemConstructorOptions[]
  }

  it('File menu contains an Export submenu', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const fileMenu = template.find((t) => t.label === 'File')
    const fileItems = fileMenu!.submenu as MenuItemConstructorOptions[]
    const labels = fileItems.map((i) => i.label)
    expect(labels).toContain('Export')
  })

  it('Export submenu has HTML, PDF, and Word items', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    expect(items).toBeDefined()
    const labels = items!.map((i) => i.label)
    expect(labels).toContain('Export to HTML…')
    expect(labels).toContain('Export to PDF…')
    expect(labels).toContain('Export to Word (docx)…')
  })

  it('Export to HTML… fires send("exportHtml")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    const htmlItem = items!.find((i) => i.label === 'Export to HTML…')
    expect(htmlItem).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    htmlItem!.click()
    expect(send).toHaveBeenCalledWith('exportHtml')
  })

  it('Export to PDF… fires send("exportPdf")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    const pdfItem = items!.find((i) => i.label === 'Export to PDF…')
    expect(pdfItem).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    pdfItem!.click()
    expect(send).toHaveBeenCalledWith('exportPdf')
  })

  it('Export to Word (docx)… fires send("exportDocx")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    const docxItem = items!.find((i) => i.label === 'Export to Word (docx)…')
    expect(docxItem).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    docxItem!.click()
    expect(send).toHaveBeenCalledWith('exportDocx')
  })

  it('Export submenu has the pandoc formats (ePub/RTF/LaTeX/OPML)', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    const labels = items!.map((i) => i.label)
    expect(labels).toContain('Export to ePub…')
    expect(labels).toContain('Export to RTF…')
    expect(labels).toContain('Export to LaTeX…')
    expect(labels).toContain('Export to OPML…')
  })

  const pandocMenuCases: { label: string; cmd: AppCommand }[] = [
    { label: 'Export to ePub…', cmd: 'exportEpub' },
    { label: 'Export to RTF…', cmd: 'exportRtf' },
    { label: 'Export to LaTeX…', cmd: 'exportLatex' },
    { label: 'Export to OPML…', cmd: 'exportOpml' },
  ]

  for (const { label, cmd } of pandocMenuCases) {
    it(`${label} fires send("${cmd}")`, () => {
      const send = vi.fn<(c: AppCommand) => void>()
      const template = buildMenuTemplate(send)
      const items = findExportSubmenu(template)
      const found = items!.find((i) => i.label === label)
      expect(found).toBeDefined()
      // @ts-expect-error calling with no args is safe for our generated handlers
      found!.click()
      expect(send).toHaveBeenCalledWith(cmd)
    })
  }
})

// ---------------------------------------------------------------------------
// Insert Link / Insert Image menu items
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - Insert Link / Insert Image', () => {
  it('Format submenu contains Insert Link and Insert Image', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const format = template.find((t) => t.label === 'Format')
    const items = format!.submenu as MenuItemConstructorOptions[]
    const labels = items.map((i) => i.label)
    expect(labels).toContain('Insert Link…')
    expect(labels).toContain('Insert Image…')
  })

  it('Insert Link… fires send("link") and has CmdOrCtrl+K accelerator', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Insert Link…')
    expect(found).toBeDefined()
    expect(found?.accelerator).toBe('CmdOrCtrl+K')
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('link')
  })

  it('Insert Image… fires send("insertImage") and has CmdOrCtrl+Shift+I accelerator', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Insert Image…')
    expect(found).toBeDefined()
    expect(found?.accelerator).toBe('CmdOrCtrl+Shift+I')
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('insertImage')
  })

  it('Preferences… fires send("preferences") and has CmdOrCtrl+, accelerator', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Preferences…')
    expect(found).toBeDefined()
    expect(found?.accelerator).toBe('CmdOrCtrl+,')
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('preferences')
  })

  it('on macOS the Preferences item lives in the app (Lekha) menu', () => {
    if (process.platform !== 'darwin') return
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const appMenu = template.find((t) => t.label === 'Lekha')
    expect(appMenu).toBeDefined()
    const items = appMenu!.submenu as MenuItemConstructorOptions[]
    expect(items.map((i) => i.label)).toContain('Preferences…')
  })
})

// ---------------------------------------------------------------------------
// Check for Updates menu item
//
// The full update flow (electron-updater) is verified manually on a packaged
// build; here we only assert the menu item exists and wires to the
// onCheckForUpdates callback (run directly in main, not the renderer channel).
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - Copy as HTML / Markdown', () => {
  it('Edit submenu contains Copy as HTML and Copy as Markdown', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const edit = template.find((t) => t.label === 'Edit')
    const items = edit!.submenu as MenuItemConstructorOptions[]
    const labels = items.map((i) => i.label)
    expect(labels).toContain('Copy as HTML')
    expect(labels).toContain('Copy as Markdown')
  })

  it('Copy as HTML fires send("copyAsHtml") and has CmdOrCtrl+Shift+C accelerator', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Copy as HTML')
    expect(found).toBeDefined()
    expect(found?.accelerator).toBe('CmdOrCtrl+Shift+C')
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('copyAsHtml')
  })

  it('Copy as Markdown fires send("copyAsMarkdown")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const found = findItem(template, (i) => i.label === 'Copy as Markdown')
    expect(found).toBeDefined()
    clickItem(found!)
    expect(send).toHaveBeenCalledWith('copyAsMarkdown')
  })
})

describe('buildMenuTemplate - Check for Updates', () => {
  it('exposes a "Check for Updates…" item somewhere in the menu', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const item = findItem(template, (i) => i.label === 'Check for Updates…')
    expect(item).toBeDefined()
  })

  it('clicking "Check for Updates…" invokes onCheckForUpdates (not the renderer send channel)', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const onCheckForUpdates = vi.fn()
    // onCheckForUpdates is the 7th positional arg; the earlier optional args
    // (recents/openPath/themeMenu/setTheme/onNewWindow) keep their defaults.
    const template = buildMenuTemplate(
      send,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      onCheckForUpdates,
    )
    const item = findItem(template, (i) => i.label === 'Check for Updates…')
    expect(item).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    item!.click()
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('buildMenuTemplate - Auto Save checkable item', () => {
  // autoSave is the 10th positional arg; setAutoSave the 11th. The earlier
  // optional args keep their defaults.
  function buildWith(autoSave: boolean, setAutoSave: (v: boolean) => void) {
    const send = vi.fn<(cmd: AppCommand) => void>()
    return buildMenuTemplate(
      send,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      autoSave,
      setAutoSave,
    )
  }

  it('renders a File-menu "Auto Save" checkbox item', () => {
    const template = buildWith(false, vi.fn())
    const item = findItem(template, (i) => i.label === 'Auto Save')
    expect(item).toBeDefined()
    expect(item!.type).toBe('checkbox')
  })

  it('checked reflects the passed autoSave value (true and false)', () => {
    const on = findItem(buildWith(true, vi.fn()), (i) => i.label === 'Auto Save')
    const off = findItem(buildWith(false, vi.fn()), (i) => i.label === 'Auto Save')
    expect(on!.checked).toBe(true)
    expect(off!.checked).toBe(false)
  })

  it('clicking it calls setAutoSave with the negated value', () => {
    const setAutoSaveOff = vi.fn<(v: boolean) => void>()
    const offItem = findItem(buildWith(false, setAutoSaveOff), (i) => i.label === 'Auto Save')
    clickItem(offItem!)
    expect(setAutoSaveOff).toHaveBeenCalledWith(true)

    const setAutoSaveOn = vi.fn<(v: boolean) => void>()
    const onItem = findItem(buildWith(true, setAutoSaveOn), (i) => i.label === 'Auto Save')
    clickItem(onItem!)
    expect(setAutoSaveOn).toHaveBeenCalledWith(false)
  })
})

describe('buildMenuTemplate - Toggle Sidebar checkable item', () => {
  // sidebarVisible is the 12th positional arg; earlier optional args default.
  function buildWith(sidebarVisible: boolean) {
    const send = vi.fn<(cmd: AppCommand) => void>()
    return buildMenuTemplate(
      send,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined, // autoSave
      undefined, // setAutoSave
      sidebarVisible,
    )
  }

  it('renders the View "Toggle Sidebar" item as a checkbox', () => {
    const item = findItem(buildWith(true), (i) => i.label === 'Toggle Sidebar')
    expect(item).toBeDefined()
    expect(item!.type).toBe('checkbox')
  })

  it('checked reflects the passed sidebarVisible value (true and false)', () => {
    const shown = findItem(buildWith(true), (i) => i.label === 'Toggle Sidebar')
    const hidden = findItem(buildWith(false), (i) => i.label === 'Toggle Sidebar')
    expect(shown!.checked).toBe(true)
    expect(hidden!.checked).toBe(false)
  })

  it('still dispatches send("toggleSidebar") on click and keeps its accelerator', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const item = findItem(buildMenuTemplate(send), (i) => i.label === 'Toggle Sidebar')
    expect(item!.accelerator).toBe('CmdOrCtrl+\\')
    clickItem(item!)
    expect(send).toHaveBeenCalledWith('toggleSidebar')
  })
})
