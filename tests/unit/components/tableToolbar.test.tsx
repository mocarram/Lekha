/**
 * Tests for the TableToolbar floating component.
 *
 * The toolbar is purely presentational: it renders the table-editing buttons
 * when `show` is true and forwards each click to `onCommand(cmd)`. We mock the
 * callback and assert the right TableCommand fires for each button.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { TableToolbar } from '../../../src/renderer/components/TableToolbar'

afterEach(() => {
  cleanup()
})

const RECT = { top: 100, left: 50, width: 300, height: 80 }

describe('TableToolbar - visibility', () => {
  it('renders nothing when not shown', () => {
    const { container } = render(
      <TableToolbar show={false} rect={RECT} onCommand={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the toolbar buttons when shown', () => {
    render(<TableToolbar show rect={RECT} onCommand={vi.fn()} />)
    expect(screen.getByTitle('Insert row above')).toBeTruthy()
    expect(screen.getByTitle('Insert row below')).toBeTruthy()
    expect(screen.getByTitle('Insert column left')).toBeTruthy()
    expect(screen.getByTitle('Insert column right')).toBeTruthy()
    expect(screen.getByTitle('Delete row')).toBeTruthy()
    expect(screen.getByTitle('Delete column')).toBeTruthy()
    expect(screen.getByTitle('Delete table')).toBeTruthy()
    expect(screen.getByTitle('Align left')).toBeTruthy()
    expect(screen.getByTitle('Align center')).toBeTruthy()
    expect(screen.getByTitle('Align right')).toBeTruthy()
  })
})

describe('TableToolbar - command dispatch', () => {
  it('Insert row below calls onCommand(addRowAfter)', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByTitle('Insert row below'))
    expect(onCommand).toHaveBeenCalledWith('addRowAfter')
  })

  it('Insert row above calls onCommand(addRowBefore)', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByTitle('Insert row above'))
    expect(onCommand).toHaveBeenCalledWith('addRowBefore')
  })

  it('Insert column left/right call the column commands', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByTitle('Insert column left'))
    fireEvent.click(screen.getByTitle('Insert column right'))
    expect(onCommand).toHaveBeenNthCalledWith(1, 'addColumnBefore')
    expect(onCommand).toHaveBeenNthCalledWith(2, 'addColumnAfter')
  })

  it('Delete buttons call the delete commands', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByTitle('Delete row'))
    fireEvent.click(screen.getByTitle('Delete column'))
    fireEvent.click(screen.getByTitle('Delete table'))
    expect(onCommand).toHaveBeenNthCalledWith(1, 'deleteRow')
    expect(onCommand).toHaveBeenNthCalledWith(2, 'deleteColumn')
    expect(onCommand).toHaveBeenNthCalledWith(3, 'deleteTable')
  })

  it('Align buttons call the align commands', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByTitle('Align left'))
    fireEvent.click(screen.getByTitle('Align center'))
    fireEvent.click(screen.getByTitle('Align right'))
    expect(onCommand).toHaveBeenNthCalledWith(1, 'alignLeft')
    expect(onCommand).toHaveBeenNthCalledWith(2, 'alignCenter')
    expect(onCommand).toHaveBeenNthCalledWith(3, 'alignRight')
  })
})
