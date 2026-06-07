import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { RenameDialog } from '../../../src/renderer/components/RenameDialog'

afterEach(() => cleanup())

describe('RenameDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <RenameDialog open={false} initial="a.md" onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('prefills the input with the current name', () => {
    render(<RenameDialog open initial="notes.md" onSubmit={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByLabelText<HTMLInputElement>('New name')
    expect(input.value).toBe('notes.md')
  })

  it('submits the trimmed new name', () => {
    const onSubmit = vi.fn()
    render(<RenameDialog open initial="old.md" onSubmit={onSubmit} onClose={vi.fn()} />)
    const input = screen.getByLabelText<HTMLInputElement>('New name')
    fireEvent.change(input, { target: { value: '  new.md  ' } })
    fireEvent.click(screen.getByText('Rename'))
    expect(onSubmit).toHaveBeenCalledWith('new.md')
  })

  it('closes (no submit) when the name is unchanged', () => {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    render(<RenameDialog open initial="same.md" onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.click(screen.getByText('Rename'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
