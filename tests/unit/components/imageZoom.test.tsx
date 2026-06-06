/**
 * Unit tests for the ImageZoom lightbox component.
 *
 * Tests cover:
 *   - Renders nothing when closed (open=false)
 *   - Renders the image with the given src when open
 *   - Clicking the backdrop calls onClose
 *   - Pressing Escape calls onClose
 *   - The image click does NOT propagate to the backdrop (does not close)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { ImageZoom } from '../../../src/renderer/components/ImageZoom'

afterEach(() => {
  cleanup()
})

describe('ImageZoom - when closed', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <ImageZoom
        open={false}
        src="https://example.com/photo.jpg"
        alt="A photo"
        onClose={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('ImageZoom - when open', () => {
  it('renders the image with the correct src', () => {
    render(
      <ImageZoom
        open
        src="https://example.com/photo.jpg"
        alt="A photo"
        onClose={vi.fn()}
      />,
    )
    const img = screen.getByRole('img')
    expect(img).toBeTruthy()
    expect((img as HTMLImageElement).src).toBe('https://example.com/photo.jpg')
  })

  it('renders the image with the correct alt text', () => {
    render(
      <ImageZoom
        open
        src="https://example.com/photo.jpg"
        alt="A mountain view"
        onClose={vi.fn()}
      />,
    )
    const img = screen.getByAltText('A mountain view')
    expect(img).toBeTruthy()
  })

  it('renders with empty alt when alt is not provided', () => {
    const { container } = render(
      <ImageZoom
        open
        src="https://example.com/photo.jpg"
        onClose={vi.fn()}
      />,
    )
    // Images with alt="" are considered decorative (role=presentation in ARIA).
    // Use querySelector to find the img element directly.
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.alt).toBe('')
  })

  it('has role=dialog on the overlay element', () => {
    render(
      <ImageZoom
        open
        src="https://example.com/photo.jpg"
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeTruthy()
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ImageZoom
        open
        src="https://example.com/photo.jpg"
        onClose={onClose}
      />,
    )
    // The outermost element is the backdrop
    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ImageZoom
        open
        src="https://example.com/photo.jpg"
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicking the image does NOT call onClose (stopPropagation)', () => {
    const onClose = vi.fn()
    render(
      <ImageZoom
        open
        src="https://example.com/photo.jpg"
        alt="test image"
        onClose={onClose}
      />,
    )
    // alt="test image" is non-empty so the img has role="img"
    const img = screen.getByRole('img')
    fireEvent.click(img)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ImageZoom - src varieties', () => {
  it('renders with an assets/ relative path as src', () => {
    const { container } = render(
      <ImageZoom
        open
        src="assets/diagram.png"
        onClose={vi.fn()}
      />,
    )
    // Use querySelector to bypass ARIA role issues with empty alt.
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    // In JSDOM, relative src gets resolved against the base URL.
    // We just confirm the img is rendered and has a non-empty src attribute.
    expect(img.getAttribute('src')).toBe('assets/diagram.png')
  })

  it('renders with a file:// absolute path as src', () => {
    const { container } = render(
      <ImageZoom
        open
        src="file:///Users/user/images/photo.png"
        onClose={vi.fn()}
      />,
    )
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe('file:///Users/user/images/photo.png')
  })
})
