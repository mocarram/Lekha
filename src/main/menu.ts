/**
 * menu.ts - Native application menu template builder.
 *
 * Uses TYPE-ONLY imports from electron so this module is unit-testable in a
 * plain Node environment without the Electron runtime. The actual
 * Menu.buildFromTemplate / Menu.setApplicationMenu calls live in index.ts
 * which is the runtime entry point.
 */
import { basename } from 'node:path'
import type { MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '@shared/commands'

// ---------------------------------------------------------------------------
// DRY helpers
// ---------------------------------------------------------------------------

/** Build a non-role menu item that calls send(cmd) on click. */
function item(
  label: string,
  accelerator: string | undefined,
  cmd: AppCommand,
  send: (cmd: AppCommand) => void,
): MenuItemConstructorOptions {
  return {
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => { send(cmd) },
  }
}

/** A separator entry. */
const sep: MenuItemConstructorOptions = { type: 'separator' }

// ---------------------------------------------------------------------------
// buildOpenRecentSubmenu
// ---------------------------------------------------------------------------

/** Maximum number of recent files shown in the Open Recent submenu. */
const MAX_RECENT_MENU = 10

/**
 * Build the "Open Recent" submenu items.
 *
 * Each item shows the basename of the path as the label and calls
 * openPath(fullPath) when clicked. If there are no recent files, a single
 * disabled "No Recent Files" item is shown instead.
 */
function buildOpenRecentSubmenu(
  recentFiles: string[],
  openPath: (path: string) => void,
): MenuItemConstructorOptions[] {
  const shown = recentFiles.slice(0, MAX_RECENT_MENU)

  if (shown.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }]
  }

  return shown.map((filePath) => ({
    label: basename(filePath),
    click: () => { openPath(filePath) },
  }))
}

// ---------------------------------------------------------------------------
// buildMenuTemplate
// ---------------------------------------------------------------------------

/**
 * Build the full application menu template.
 *
 * @param send        - Called with an AppCommand whenever the user activates a
 *   command menu item. In production this is
 *   `(cmd) => win.webContents.send(IPC.command, cmd)`. In tests it is a
 *   vi.fn() so click callbacks can be asserted without a live Electron instance.
 * @param recentFiles - Current list of recently-opened file paths (most-recent
 *   first). Used to populate the Open Recent submenu. Defaults to empty.
 * @param openPath    - Called with the full path when the user picks a recent
 *   file. In production this sends IPC.openPath to the renderer. Defaults to
 *   a no-op so callers can omit it when they don't need recents (e.g. tests
 *   that only care about the command items).
 */
export function buildMenuTemplate(
  send: (cmd: AppCommand) => void,
  recentFiles: string[] = [],
  openPath: (path: string) => void = () => { /* no-op - no recents caller */ },
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = []

  // -------------------------------------------------------------------------
  // App menu (macOS only)
  // -------------------------------------------------------------------------
  if (process.platform === 'darwin') {
    template.push({
      label: 'Lekha',
      submenu: [
        { role: 'about' },
        sep,
        { role: 'services' },
        sep,
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        sep,
        { role: 'quit' },
      ],
    })
  }

  // -------------------------------------------------------------------------
  // File menu
  // -------------------------------------------------------------------------
  template.push({
    label: 'File',
    submenu: [
      item('New',           'CmdOrCtrl+N',       'new',        send),
      item('Open…',         'CmdOrCtrl+O',       'open',       send),
      item('Open Folder…',  'CmdOrCtrl+Shift+O', 'openFolder', send),
      {
        label: 'Open Recent',
        submenu: buildOpenRecentSubmenu(recentFiles, openPath),
      },
      sep,
      item('Save',          'CmdOrCtrl+S',       'save',       send),
      item('Save As…',      'CmdOrCtrl+Shift+S', 'saveAs',     send),
      sep,
      {
        label: 'Export',
        submenu: [
          item('Export to HTML…', undefined, 'exportHtml', send),
          item('Export to PDF…',  undefined, 'exportPdf',  send),
          // Word export requires pandoc. The menu item is always shown;
          // if pandoc is absent the IPC handler throws a friendly error
          // that useCommands surfaces to the user. This keeps buildMenuTemplate
          // synchronous (no async pandoc detection needed at menu-build time).
          item('Export to Word (docx)…', undefined, 'exportDocx', send),
        ],
      },
    ],
  })

  // -------------------------------------------------------------------------
  // Edit menu
  // -------------------------------------------------------------------------
  template.push({
    label: 'Edit',
    submenu: [
      item('Undo',   'CmdOrCtrl+Z',       'undo',    send),
      item('Redo',   'CmdOrCtrl+Shift+Z', 'redo',    send),
      sep,
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      sep,
      item('Find',    'CmdOrCtrl+F',       'find',    send),
      item('Replace', 'CmdOrCtrl+Alt+F',   'replace', send),
    ],
  })

  // -------------------------------------------------------------------------
  // Format menu
  // -------------------------------------------------------------------------
  template.push({
    label: 'Format',
    submenu: [
      item('Bold',          'CmdOrCtrl+B',       'bold',          send),
      item('Italic',        'CmdOrCtrl+I',       'italic',        send),
      item('Strikethrough', undefined,            'strikethrough', send),
      item('Code',          undefined,            'inlineCode',    send),
      sep,
      // Headings 1-6
      ...(([1, 2, 3, 4, 5, 6] as const).map((level) =>
        item(
          `Heading ${level}`,
          `CmdOrCtrl+Alt+${level}`,
          `heading${level}`,
          send,
        ),
      )),
      item('Paragraph',    'CmdOrCtrl+Alt+0', 'paragraph', send),
      sep,
      item('Bullet List',      undefined, 'bulletList',     send),
      item('Ordered List',     undefined, 'orderedList',    send),
      item('Task List',        undefined, 'taskList',       send),
      item('Blockquote',       undefined, 'blockquote',     send),
      item('Code Block',       undefined, 'codeBlock',      send),
      item('Horizontal Rule',  undefined, 'horizontalRule', send),
    ],
  })

  // -------------------------------------------------------------------------
  // View menu
  // -------------------------------------------------------------------------
  template.push({
    label: 'View',
    submenu: [
      item('Toggle Sidebar',     'CmdOrCtrl+\\',    'toggleSidebar', send),
      item('Toggle Source Mode', 'CmdOrCtrl+Alt+S', 'toggleSource',  send),
      sep,
      { role: 'reload' },
      { role: 'toggleDevTools' },
      sep,
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      sep,
      { role: 'togglefullscreen' },
    ],
  })

  return template
}
