/**
 * registry.ts - the single source of truth for the command palette.
 *
 * Each CommandDef pairs an AppCommand id with the human label and (optional)
 * keyboard-shortcut hint shown in the palette. Labels mirror the native menu
 * (src/main/menu.ts) so the two stay recognisable; shortcuts use the macOS
 * glyph style since that is the primary target.
 *
 * The palette runs the selected command through useCommands' shared
 * `dispatch`, so this file only describes commands - it never routes them.
 *
 * NOTE: `commandPalette` and `quickOpen` are intentionally absent. They are the
 * palette's own entry points; listing them would let the palette invoke itself.
 */
import type { AppCommand } from '@shared/commands'

export interface CommandDef {
  id: AppCommand
  label: string
  group?: string
  shortcut?: string
}

export const COMMANDS: CommandDef[] = [
  // File
  { id: 'new', label: 'New', group: 'File', shortcut: '⌘N' },
  { id: 'newFromTemplate', label: 'New from Template…', group: 'File', shortcut: '⌘⌥N' },
  { id: 'newWindow', label: 'New Window', group: 'File', shortcut: '⌘⇧N' },
  { id: 'open', label: 'Open…', group: 'File', shortcut: '⌘O' },
  { id: 'openFolder', label: 'Open Folder…', group: 'File', shortcut: '⌘⇧O' },
  { id: 'save', label: 'Save', group: 'File', shortcut: '⌘S' },
  { id: 'saveAs', label: 'Save As…', group: 'File', shortcut: '⌘⇧S' },
  { id: 'duplicateFile', label: 'Duplicate', group: 'File' },
  { id: 'renameFile', label: 'Rename…', group: 'File' },
  { id: 'moveFileTo', label: 'Move To…', group: 'File' },
  { id: 'revertToSaved', label: 'Revert to Saved', group: 'File' },
  { id: 'deleteFile', label: 'Move to Trash…', group: 'File' },
  { id: 'getInfo', label: 'Get Info', group: 'File' },
  { id: 'revealInLibrary', label: 'Reveal in Library', group: 'File' },
  { id: 'revealInFileTree', label: 'Reveal in File Tree', group: 'File' },
  { id: 'showInFinder', label: 'Open File Location', group: 'File' },
  { id: 'print', label: 'Print…', group: 'File' },
  { id: 'share', label: 'Share…', group: 'File' },

  // View
  { id: 'presentation', label: 'Enter Presentation', group: 'View', shortcut: 'F5' },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', group: 'View', shortcut: '⌘\\' },
  { id: 'toggleStatusBar', label: 'Toggle Status Bar', group: 'View' },
  { id: 'toggleAlwaysOnTop', label: 'Always on Top', group: 'View' },
  { id: 'toggleSource', label: 'Toggle Source Mode', group: 'View', shortcut: '⌘⌥S' },
  { id: 'toggleFocusMode', label: 'Focus Mode', group: 'View', shortcut: 'F8' },
  { id: 'toggleTypewriterMode', label: 'Typewriter Mode', group: 'View', shortcut: 'F9' },

  // Edit
  { id: 'undo', label: 'Undo', group: 'Edit', shortcut: '⌘Z' },
  { id: 'redo', label: 'Redo', group: 'Edit', shortcut: '⌘⇧Z' },
  { id: 'find', label: 'Find', group: 'Edit', shortcut: '⌘F' },
  { id: 'replace', label: 'Replace', group: 'Edit', shortcut: '⌘⌥F' },
  { id: 'copyAsHtml', label: 'Copy as HTML', group: 'Edit', shortcut: '⌘⇧C' },
  { id: 'copyAsMarkdown', label: 'Copy as Markdown', group: 'Edit' },
  { id: 'copyAsPlainText', label: 'Copy as Plain Text', group: 'Edit' },
  { id: 'copyWithoutStyling', label: 'Copy without Theme Styling', group: 'Edit' },
  { id: 'pasteAsPlainText', label: 'Paste as Plain Text', group: 'Edit', shortcut: '⌘⇧V' },
  { id: 'jumpToTop', label: 'Jump to Top', group: 'Edit' },
  { id: 'jumpToBottom', label: 'Jump to Bottom', group: 'Edit' },
  { id: 'eolLf', label: 'Line Endings: LF', group: 'Edit' },
  { id: 'eolCrlf', label: 'Line Endings: CRLF', group: 'Edit' },

  // Format - inline
  { id: 'bold', label: 'Bold', group: 'Format', shortcut: '⌘B' },
  { id: 'italic', label: 'Italic', group: 'Format', shortcut: '⌘I' },
  { id: 'underline', label: 'Underline', group: 'Format', shortcut: '⌘U' },
  { id: 'strikethrough', label: 'Strikethrough', group: 'Format' },
  { id: 'inlineCode', label: 'Inline Code', group: 'Format' },
  { id: 'highlight', label: 'Highlight', group: 'Format', shortcut: '⌘⇧H' },
  { id: 'superscript', label: 'Superscript', group: 'Format' },
  { id: 'subscript', label: 'Subscript', group: 'Format' },
  { id: 'clearFormatting', label: 'Clear Formatting', group: 'Format', shortcut: '⌘⌥\\' },
  { id: 'link', label: 'Insert Link…', group: 'Format', shortcut: '⌘K' },
  { id: 'insertImage', label: 'Insert Image…', group: 'Format', shortcut: '⌘⇧I' },

  // Format - blocks
  { id: 'heading1', label: 'Heading 1', group: 'Format', shortcut: '⌘1' },
  { id: 'heading2', label: 'Heading 2', group: 'Format', shortcut: '⌘2' },
  { id: 'heading3', label: 'Heading 3', group: 'Format', shortcut: '⌘3' },
  { id: 'heading4', label: 'Heading 4', group: 'Format', shortcut: '⌘4' },
  { id: 'heading5', label: 'Heading 5', group: 'Format', shortcut: '⌘5' },
  { id: 'heading6', label: 'Heading 6', group: 'Format', shortcut: '⌘6' },
  { id: 'paragraph', label: 'Paragraph', group: 'Format', shortcut: '⌘0' },
  { id: 'bulletList', label: 'Bullet List', group: 'Format' },
  { id: 'orderedList', label: 'Ordered List', group: 'Format' },
  { id: 'taskList', label: 'Task List', group: 'Format' },
  { id: 'blockquote', label: 'Blockquote', group: 'Format' },
  { id: 'codeBlock', label: 'Code Block', group: 'Format' },
  { id: 'horizontalRule', label: 'Horizontal Rule', group: 'Format' },

  // Export
  { id: 'exportHtml', label: 'Export to HTML…', group: 'Export' },
  { id: 'exportPdf', label: 'Export to PDF…', group: 'Export' },
  { id: 'exportDocx', label: 'Export to Word (docx)…', group: 'Export' },
  { id: 'exportEpub', label: 'Export to ePub…', group: 'Export' },
  { id: 'exportRtf', label: 'Export to RTF…', group: 'Export' },
  { id: 'exportLatex', label: 'Export to LaTeX…', group: 'Export' },
  { id: 'exportOpml', label: 'Export to OPML…', group: 'Export' },

  // App
  { id: 'preferences', label: 'Preferences…', group: 'App', shortcut: '⌘,' },
]
