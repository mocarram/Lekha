/**
 * Tests for the ImageDialog modal.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { ImageDialog } from '../../../src/renderer/components/ImageDialog'

afterEach(() => {
  cleanup()
})

function noop(): void {
  /* default no-op callback */
}

describe('ImageDialog - rendering', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ImageDialog
        open={false}
        initial={{ src: '', alt: '' }}
        onSubmit={noop}
        onClose={noop}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Image URL and Alt text inputs when open', () => {
    render(
      <ImageDialog
        open
        initial={{ src: '', alt: '' }}
        onSubmit={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByLabelText('Image URL')).toBeTruthy()
    expect(screen.getByLabelText('Alt text')).toBeTruthy()
  })
})

describe('ImageDialog - interactions', () => {
  it('Insert calls onSubmit with src and alt', () => {
    const onSubmit = vi.fn()
    render(
      <ImageDialog
        open
        initial={{ src: '', alt: '' }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    )
    fireEvent.change(screen.getByLabelText('Image URL'), {
      target: { value: 'https://e.com/x.png' },
    })
    fireEvent.change(screen.getByLabelText('Alt text'), {
      target: { value: 'a cat' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const arg = onSubmit.mock.calls[0]?.[0] as { src: string; alt: string }
    expect(arg.src).toBe('https://e.com/x.png')
    expect(arg.alt).toBe('a cat')
  })

  it('Cancel calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ImageDialog
        open
        initial={{ src: '', alt: '' }}
        onSubmit={noop}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ImageDialog
        open
        initial={{ src: '', alt: '' }}
        onSubmit={noop}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('Image URL'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Enter confirms (calls onSubmit)', () => {
    const onSubmit = vi.fn()
    render(
      <ImageDialog
        open
        initial={{ src: 'https://e.com/x.png', alt: '' }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('Image URL'), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
