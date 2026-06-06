/**
 * Tests for the LinkDialog modal.
 *
 * Callbacks are mocked (vi.fn()). The dialog is purely controlled by props so
 * we can exercise insert mode, edit mode, submit, remove, open and cancel.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { LinkDialog } from '../../../src/renderer/components/LinkDialog'

afterEach(() => {
  cleanup()
})

function noop(): void {
  /* default no-op callback */
}

describe('LinkDialog - rendering', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <LinkDialog
        open={false}
        mode="insert"
        initial={{ text: '', href: '' }}
        onSubmit={noop}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders Text and URL inputs when open', () => {
    render(
      <LinkDialog
        open
        mode="insert"
        initial={{ text: 'hello', href: '' }}
        onSubmit={noop}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByLabelText('Text')).toBeTruthy()
    expect(screen.getByLabelText('URL')).toBeTruthy()
  })

  it('shows Insert label in insert mode and no Remove button', () => {
    render(
      <LinkDialog
        open
        mode="insert"
        initial={{ text: '', href: '' }}
        onSubmit={noop}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Insert' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull()
  })

  it('shows Update label and Remove/Open buttons in edit mode', () => {
    render(
      <LinkDialog
        open
        mode="edit"
        initial={{ text: 'x', href: 'https://e.com' }}
        onSubmit={noop}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove link' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })
})

describe('LinkDialog - interactions', () => {
  it('Insert calls onSubmit with the current text and href', () => {
    const onSubmit = vi.fn()
    render(
      <LinkDialog
        open
        mode="insert"
        initial={{ text: 'hi', href: 'https://e.com' }}
        onSubmit={onSubmit}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const arg = onSubmit.mock.calls[0]?.[0] as {
      text: string
      href: string
    }
    expect(arg.text).toBe('hi')
    expect(arg.href).toBe('https://e.com')
  })

  it('typing updates the value submitted', () => {
    const onSubmit = vi.fn()
    render(
      <LinkDialog
        open
        mode="insert"
        initial={{ text: '', href: '' }}
        onSubmit={onSubmit}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Lekha' },
    })
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'https://lekha.app' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Insert' }))
    const arg = onSubmit.mock.calls[0]?.[0] as { text: string; href: string }
    expect(arg.text).toBe('Lekha')
    expect(arg.href).toBe('https://lekha.app')
  })

  it('Remove calls onRemove', () => {
    const onRemove = vi.fn()
    render(
      <LinkDialog
        open
        mode="edit"
        initial={{ text: 'x', href: 'https://e.com' }}
        onSubmit={noop}
        onRemove={onRemove}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('Open calls onOpenUrl with the current href', () => {
    const onOpenUrl = vi.fn()
    render(
      <LinkDialog
        open
        mode="edit"
        initial={{ text: 'x', href: 'https://e.com' }}
        onSubmit={noop}
        onRemove={noop}
        onOpenUrl={onOpenUrl}
        onClose={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(onOpenUrl).toHaveBeenCalledWith('https://e.com')
  })

  it('Cancel calls onClose', () => {
    const onClose = vi.fn()
    render(
      <LinkDialog
        open
        mode="insert"
        initial={{ text: '', href: '' }}
        onSubmit={noop}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(
      <LinkDialog
        open
        mode="insert"
        initial={{ text: '', href: '' }}
        onSubmit={noop}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('URL'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Enter in a field confirms (calls onSubmit)', () => {
    const onSubmit = vi.fn()
    render(
      <LinkDialog
        open
        mode="insert"
        initial={{ text: 'hi', href: 'https://e.com' }}
        onSubmit={onSubmit}
        onRemove={noop}
        onOpenUrl={noop}
        onClose={noop}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('URL'), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
