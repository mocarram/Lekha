/**
 * Tests for the CommandPalette modal.
 *
 * The palette has two modes driven by the `mode` prop:
 *   - 'commands': fuzzy list of CommandDef entries; Enter / click run onRun(id).
 *   - 'files':    fuzzy list of workspace files; Enter / click run onOpenFile.
 *
 * Shared behaviour: autofocused filter input, arrow keys move (and wrap) the
 * selection, Enter activates the selected row, Esc calls onClose, and typing
 * filters the list via the fuzzy matcher.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import {
  CommandPalette,
  type PaletteFileEntry,
} from '../../../src/renderer/components/CommandPalette'
import type { CommandDef } from '../../../src/renderer/commands/registry'

afterEach(() => {
  cleanup()
})

const commands: CommandDef[] = [
  { id: 'save', label: 'Save', group: 'File', shortcut: 'Cmd+S' },
  { id: 'open', label: 'Open', group: 'File', shortcut: 'Cmd+O' },
  { id: 'bold', label: 'Bold', group: 'Format', shortcut: 'Cmd+B' },
]

const files: PaletteFileEntry[] = [
  { path: '/root/notes/todo.md', name: 'todo.md', dir: 'notes' },
  { path: '/root/readme.md', name: 'readme.md', dir: '' },
  { path: '/root/docs/spec.md', name: 'spec.md', dir: 'docs' },
]

function renderCommands(
  overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {},
) {
  const onRun = vi.fn()
  const onOpenFile = vi.fn()
  const onClose = vi.fn()
  render(
    <CommandPalette
      open
      mode="commands"
      commands={commands}
      files={files}
      hasFolder
      onRun={onRun}
      onOpenFile={onOpenFile}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onRun, onOpenFile, onClose }
}

describe('CommandPalette - closed / open', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CommandPalette
        open={false}
        mode="commands"
        commands={commands}
        files={files}
        hasFolder
        onRun={vi.fn()}
        onOpenFile={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a dialog with an autofocused input when open', () => {
    renderCommands()
    expect(screen.getByRole('dialog')).toBeTruthy()
    const input = screen.getByRole('combobox')
    expect(document.activeElement).toBe(input)
  })
})

describe('CommandPalette - commands mode', () => {
  it('lists all commands initially', () => {
    renderCommands()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByText('Bold')).toBeTruthy()
  })

  it('filters the list as the user types', () => {
    renderCommands()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bold' } })
    expect(screen.getByText('Bold')).toBeTruthy()
    expect(screen.queryByText('Save')).toBeNull()
  })

  it('runs the selected command on Enter', () => {
    const { onRun } = renderCommands()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bold' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(onRun).toHaveBeenCalledWith('bold')
  })

  it('runs a command when its row is clicked', () => {
    const { onRun } = renderCommands()
    fireEvent.click(screen.getByText('Open'))
    expect(onRun).toHaveBeenCalledWith('open')
  })

  it('moves selection with arrow keys and runs the new selection on Enter', () => {
    const { onRun } = renderCommands()
    const input = screen.getByRole('combobox')
    // First row (Save) is selected initially; ArrowDown -> Open.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).toHaveBeenCalledWith('open')
  })

  it('wraps selection from the first item to the last on ArrowUp', () => {
    const { onRun } = renderCommands()
    const input = screen.getByRole('combobox')
    // ArrowUp from the first row wraps to the last (Bold).
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).toHaveBeenCalledWith('bold')
  })

  it('calls onClose on Escape', () => {
    const { onClose } = renderCommands()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the shortcut hint for a command', () => {
    renderCommands()
    expect(screen.getByText('Cmd+S')).toBeTruthy()
  })
})

describe('CommandPalette - files mode', () => {
  function renderFiles(
    overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {},
  ) {
    const onRun = vi.fn()
    const onOpenFile = vi.fn()
    const onClose = vi.fn()
    render(
      <CommandPalette
        open
        mode="files"
        commands={commands}
        files={files}
        hasFolder
        onRun={onRun}
        onOpenFile={onOpenFile}
        onClose={onClose}
        {...overrides}
      />,
    )
    return { onRun, onOpenFile, onClose }
  }

  it('lists all files by basename', () => {
    renderFiles()
    expect(screen.getByText('todo.md')).toBeTruthy()
    expect(screen.getByText('readme.md')).toBeTruthy()
    expect(screen.getByText('spec.md')).toBeTruthy()
  })

  it('opens the clicked file', () => {
    const { onOpenFile } = renderFiles()
    fireEvent.click(screen.getByText('spec.md'))
    expect(onOpenFile).toHaveBeenCalledWith('/root/docs/spec.md')
  })

  it('opens the selected file on Enter after filtering', () => {
    const { onOpenFile } = renderFiles()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'todo' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(onOpenFile).toHaveBeenCalledWith('/root/notes/todo.md')
  })

  it('shows an empty state when no folder is open', () => {
    renderFiles({ hasFolder: false, files: [] })
    expect(screen.getByText(/no folder/i)).toBeTruthy()
  })
})
