/**
 * Unit tests for the Presentation overlay component.
 *
 * Tests cover:
 *   - Renders nothing when closed (open=false)
 *   - Renders the current slide's HTML content
 *   - Shows slide counter "n / m"
 *   - Right arrow advances to next slide
 *   - Left arrow goes back to previous slide
 *   - Space / PageDown also advance
 *   - PageUp goes back
 *   - Home goes to first slide
 *   - End goes to last slide
 *   - Clamps at first / last (no wrap-around)
 *   - Esc calls onExit
 *   - Clicking the right half advances; clicking left half goes back
 *
 * To avoid async mermaid/katex rendering, the component accepts a `renderSlide`
 * prop (a sync or async function string -> string). In tests we pass a sync stub
 * that returns the markdown wrapped in a <div>.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { Presentation } from '../../../src/renderer/components/Presentation'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Test double: a synchronous renderSlide stub
// ---------------------------------------------------------------------------

/** Render stub: wraps the markdown in a simple div so we can assert content. */
function stubRender(md: string): Promise<string> {
  return Promise.resolve(`<div class="slide-content">${md}</div>`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPresentation(
  slides: string[],
  open = true,
  onExit: () => void = vi.fn(),
) {
  return render(
    <Presentation
      open={open}
      slides={slides}
      renderSlide={stubRender}
      onExit={onExit}
    />,
  )
}

// ---------------------------------------------------------------------------
// Closed state
// ---------------------------------------------------------------------------

describe('Presentation - closed', () => {
  it('renders nothing when open is false', () => {
    const { container } = renderPresentation(['slide one', 'slide two'], false)
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Open state - basic rendering
// ---------------------------------------------------------------------------

describe('Presentation - open', () => {
  it('renders a full-screen overlay when open', async () => {
    const { container } = renderPresentation(['slide one', 'slide two'])
    // Wait for the async render stub to resolve
    await act(async () => {})
    expect(container.firstChild).not.toBeNull()
  })

  it('displays the first slide content initially', async () => {
    renderPresentation(['Hello World', 'Second slide'])
    await act(async () => {})
    expect(document.body.innerHTML).toContain('Hello World')
  })

  it('shows counter "1 / 2" for a 2-slide deck', async () => {
    renderPresentation(['slide A', 'slide B'])
    await act(async () => {})
    // The counter should show current/total
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })

  it('shows counter "1 / 1" for a 1-slide deck', async () => {
    renderPresentation(['only slide'])
    await act(async () => {})
    expect(screen.getByText('1 / 1')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Navigation - keyboard
// ---------------------------------------------------------------------------

describe('Presentation - keyboard navigation', () => {
  it('right arrow advances to slide 2', async () => {
    renderPresentation(['first', 'second'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    expect(screen.getByText('2 / 2')).toBeTruthy()
    expect(document.body.innerHTML).toContain('second')
  })

  it('Space advances to next slide', async () => {
    renderPresentation(['first', 'second'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: ' ' })
    await act(async () => {})
    expect(screen.getByText('2 / 2')).toBeTruthy()
  })

  it('PageDown advances to next slide', async () => {
    renderPresentation(['first', 'second'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'PageDown' })
    await act(async () => {})
    expect(screen.getByText('2 / 2')).toBeTruthy()
  })

  it('left arrow goes back to previous slide', async () => {
    renderPresentation(['first', 'second', 'third'])
    await act(async () => {})
    // Advance twice first
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    expect(screen.getByText('3 / 3')).toBeTruthy()
    // Go back
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    await act(async () => {})
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })

  it('PageUp goes back to previous slide', async () => {
    renderPresentation(['first', 'second'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'PageUp' })
    await act(async () => {})
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })

  it('Home goes to the first slide', async () => {
    renderPresentation(['first', 'second', 'third'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    expect(screen.getByText('3 / 3')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Home' })
    await act(async () => {})
    expect(screen.getByText('1 / 3')).toBeTruthy()
  })

  it('End goes to the last slide', async () => {
    renderPresentation(['first', 'second', 'third'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'End' })
    await act(async () => {})
    expect(screen.getByText('3 / 3')).toBeTruthy()
    expect(document.body.innerHTML).toContain('third')
  })

  it('clamps at first slide (left arrow does nothing on slide 1)', async () => {
    renderPresentation(['only slide'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    await act(async () => {})
    expect(screen.getByText('1 / 1')).toBeTruthy()
  })

  it('clamps at last slide (right arrow does nothing on last slide)', async () => {
    renderPresentation(['first', 'last'])
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    // Now on slide 2 (last)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    // Should still be at slide 2
    expect(screen.getByText('2 / 2')).toBeTruthy()
  })

  it('Esc calls onExit', async () => {
    const onExit = vi.fn()
    render(
      <Presentation
        open
        slides={['slide']}
        renderSlide={stubRender}
        onExit={onExit}
      />,
    )
    await act(async () => {})
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Click zone navigation
// ---------------------------------------------------------------------------

describe('Presentation - click navigation', () => {
  it('clicking the right click zone advances to next slide', async () => {
    const { container } = renderPresentation(['first', 'second'])
    await act(async () => {})
    const rightZone = container.querySelector('.pres__click-next')
    expect(rightZone).not.toBeNull()
    fireEvent.click(rightZone!)
    await act(async () => {})
    expect(screen.getByText('2 / 2')).toBeTruthy()
  })

  it('clicking the left click zone goes back', async () => {
    const { container } = renderPresentation(['first', 'second'])
    await act(async () => {})
    // advance first
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    await act(async () => {})
    const leftZone = container.querySelector('.pres__click-prev')
    expect(leftZone).not.toBeNull()
    fireEvent.click(leftZone!)
    await act(async () => {})
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Edge: empty slides array
// ---------------------------------------------------------------------------

describe('Presentation - edge cases', () => {
  it('handles an empty slides array without crashing', async () => {
    const { container } = renderPresentation([])
    await act(async () => {})
    // Should render something (or nothing) without throwing
    expect(container).toBeTruthy()
  })
})
