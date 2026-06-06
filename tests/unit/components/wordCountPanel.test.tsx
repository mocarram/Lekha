/**
 * Tests for the WordCountPanel popover.
 *
 * The panel takes the current document text plus open/onClose props. When open
 * it renders the six stat rows computed from the text; when closed it renders
 * nothing. Esc and outside-click both call onClose.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { WordCountPanel } from '../../../src/renderer/components/WordCountPanel'

afterEach(() => {
  cleanup()
})

describe('WordCountPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <WordCountPanel open={false} text="Hello world." onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the stat labels and computed values when open', () => {
    render(<WordCountPanel open text="Hello world.\n\nSecond para." onClose={vi.fn()} />)
    expect(screen.getByText('Words')).toBeTruthy()
    expect(screen.getByText('Characters')).toBeTruthy()
    expect(screen.getByText('Characters (no spaces)')).toBeTruthy()
    expect(screen.getByText('Lines')).toBeTruthy()
    expect(screen.getByText('Paragraphs')).toBeTruthy()
    expect(screen.getByText('Reading time')).toBeTruthy()
  })

  it('shows the correct word count for the given text', () => {
    render(<WordCountPanel open text="one two three" onClose={vi.fn()} />)
    // Find the Words row and assert its value cell shows 3.
    const wordsRow = screen.getByText('Words').closest('.wc-panel__row')
    expect(wordsRow).toBeTruthy()
    expect(wordsRow!.textContent).toContain('3')
  })

  it('formats reading time with a "min" suffix', () => {
    render(<WordCountPanel open text="one two three" onClose={vi.fn()} />)
    const row = screen.getByText('Reading time').closest('.wc-panel__row')
    expect(row!.textContent).toContain('min')
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<WordCountPanel open text="hi" onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked (outside click)', () => {
    const onClose = vi.fn()
    const { container } = render(
      <WordCountPanel open text="hi" onClose={onClose} />,
    )
    const backdrop = container.querySelector('.wc-panel__backdrop')
    expect(backdrop).toBeTruthy()
    fireEvent.mouseDown(backdrop!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
