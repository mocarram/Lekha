/**
 * Tests for the TemplatePicker modal.
 *
 * Verifies:
 *   - Renders nothing when closed
 *   - Renders template list when open
 *   - Filter narrows the list via fuzzy match
 *   - Enter key calls onSelect with the highlighted template
 *   - Click calls onSelect with the clicked template
 *   - Esc calls onClose
 *   - Arrow keys move the selection
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { TemplatePicker } from '../../../src/renderer/components/TemplatePicker'
import type { Template } from '../../../src/renderer/templates/registry'

afterEach(() => {
  cleanup()
})

const TEMPLATES: Template[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'A template for meeting notes',
    content: '# Meeting Notes\n\nDate: ...',
  },
  {
    id: 'daily-note',
    name: 'Daily Note',
    description: 'A daily journal template',
    content: '# {{date}}\n\nToday...',
  },
  {
    id: 'blog-post',
    name: 'Blog Post',
    description: 'A blog post starter',
    content: '# Blog Post\n\nIntro...',
  },
]

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof TemplatePicker>> = {},
) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <TemplatePicker
      open
      templates={TEMPLATES}
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSelect, onClose }
}

describe('TemplatePicker - closed state', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <TemplatePicker
        open={false}
        templates={TEMPLATES}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('TemplatePicker - open state', () => {
  it('renders a dialog when open', () => {
    renderPicker()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('renders all template names', () => {
    renderPicker()
    expect(screen.getByText('Meeting Notes')).toBeTruthy()
    expect(screen.getByText('Daily Note')).toBeTruthy()
    expect(screen.getByText('Blog Post')).toBeTruthy()
  })

  it('autofocuses the filter input', () => {
    renderPicker()
    const input = screen.getByRole('combobox')
    expect(document.activeElement).toBe(input)
  })

  it('renders template descriptions when provided', () => {
    renderPicker()
    expect(screen.getByText('A template for meeting notes')).toBeTruthy()
  })
})

describe('TemplatePicker - filtering', () => {
  it('narrows the list as the user types', () => {
    renderPicker()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'meeting' } })
    // After filtering, only Meeting Notes should appear. The label may be split
    // across highlight <mark> and <span> elements, so use a listbox query.
    const list = screen.getByRole('listbox')
    expect(list.children.length).toBe(1)
    const option = list.children[0] as HTMLElement
    expect(option.textContent).toContain('Meeting Notes')
  })

  it('shows all templates when the filter is cleared', () => {
    renderPicker()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'blog' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getByText('Meeting Notes')).toBeTruthy()
    expect(screen.getByText('Daily Note')).toBeTruthy()
    expect(screen.getByText('Blog Post')).toBeTruthy()
  })

  it('shows empty state when no templates match', () => {
    renderPicker()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzzz' } })
    expect(screen.getByText(/no matches/i)).toBeTruthy()
  })
})

describe('TemplatePicker - selection', () => {
  it('calls onSelect with the template when a row is clicked', () => {
    const { onSelect } = renderPicker()
    fireEvent.click(screen.getByText('Daily Note'))
    expect(onSelect).toHaveBeenCalledWith(TEMPLATES[1])
  })

  it('calls onSelect with the highlighted template on Enter', () => {
    const { onSelect } = renderPicker()
    // First row is selected by default (Meeting Notes)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(TEMPLATES[0])
  })

  it('moves selection down with ArrowDown then selects on Enter', () => {
    const { onSelect } = renderPicker()
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(TEMPLATES[1])
  })

  it('wraps selection from first to last on ArrowUp', () => {
    const { onSelect } = renderPicker()
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(TEMPLATES[2])
  })
})

describe('TemplatePicker - closing', () => {
  it('calls onClose on Escape', () => {
    const { onClose } = renderPicker()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking the backdrop', () => {
    const { onClose } = renderPicker()
    // The backdrop element has the class 'cmdk__backdrop'
    const backdrop = document.querySelector('.cmdk__backdrop') as HTMLElement
    expect(backdrop).toBeTruthy()
    fireEvent.mouseDown(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('TemplatePicker - empty templates', () => {
  it('shows empty state when no templates are provided', () => {
    renderPicker({ templates: [] })
    expect(screen.getByText(/no matches/i)).toBeTruthy()
  })
})
