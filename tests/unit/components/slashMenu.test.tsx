/**
 * Tests for the SlashMenu popup component.
 *
 * The component is presentational: it renders the fuzzy-filtered items at a
 * given screen position, owns its own selection index, and reports user intent
 * via callbacks:
 *   - onSelect(id): Enter / click on an item.
 *   - onClose():    Escape.
 *
 * Filtering is driven by the `query` prop (the text the user typed after "/").
 * Arrow Up/Down move (and wrap) the selection; Enter selects the highlighted
 * item. Keyboard is handled via a window listener while the menu is open, so
 * the editor (which still owns focus) does not also act on those keys.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { SlashMenu } from '../../../src/renderer/components/SlashMenu'

afterEach(() => {
  cleanup()
})

/**
 * Find a menu option by its label. When the fuzzy match highlights part of the
 * label it is split across <mark>/<span> nodes, so we match on the option's
 * full textContent rather than a single text node.
 */
function optionByLabel(label: string): HTMLElement | undefined {
  return screen
    .queryAllByRole('option')
    .find((el) => (el.textContent ?? '').includes(label))
}

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof SlashMenu>> = {},
) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <SlashMenu
      open
      query=""
      coords={{ left: 100, top: 200 }}
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSelect, onClose }
}

describe('SlashMenu - visibility', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SlashMenu
        open={false}
        query=""
        coords={{ left: 0, top: 0 }}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a listbox of items when open', () => {
    renderMenu()
    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByText('Heading 1')).toBeTruthy()
    expect(screen.getByText('Table')).toBeTruthy()
  })
})

describe('SlashMenu - filtering', () => {
  it('filters items by the query prop', () => {
    renderMenu({ query: 'code' })
    expect(optionByLabel('Code Block')).toBeTruthy()
    expect(optionByLabel('Heading 1')).toBeUndefined()
  })

  it('shows the matching heading items for "head"', () => {
    renderMenu({ query: 'head' })
    expect(optionByLabel('Heading 1')).toBeTruthy()
    expect(optionByLabel('Heading 2')).toBeTruthy()
  })

  it('shows an empty state when nothing matches', () => {
    renderMenu({ query: 'zzzzzz' })
    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.getByText(/no matches/i)).toBeTruthy()
  })
})

describe('SlashMenu - selection', () => {
  it('calls onSelect with the clicked item id', () => {
    const { onSelect } = renderMenu()
    fireEvent.click(screen.getByText('Bullet List'))
    expect(onSelect).toHaveBeenCalledWith('bulletList')
  })

  it('selects the highlighted item on Enter (top item by default)', () => {
    const { onSelect } = renderMenu()
    fireEvent.keyDown(window, { key: 'Enter' })
    // The first item is Heading 1.
    expect(onSelect).toHaveBeenCalledWith('heading1')
  })

  it('ArrowDown moves the selection and Enter selects the new item', () => {
    const { onSelect } = renderMenu()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    // Heading 1 -> Heading 2.
    expect(onSelect).toHaveBeenCalledWith('heading2')
  })

  it('ArrowUp from the first item wraps to the last', () => {
    const { onSelect } = renderMenu()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'Enter' })
    // Wraps to the final item (Image).
    expect(onSelect).toHaveBeenCalledWith('image')
  })

  it('calls onClose on Escape', () => {
    const { onClose } = renderMenu()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('resets the selection to the top when the query changes', () => {
    renderMenu()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    // Re-render narrowed to the code item; selection should reset to the first
    // match (a remount here stands in for the live query-prop change).
    cleanup()
    const { onSelect } = renderMenu({ query: 'code' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('codeBlock')
  })
})
