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
    expect(screen.getByLabelText('Insert row above')).toBeTruthy()
    expect(screen.getByLabelText('Insert row below')).toBeTruthy()
    expect(screen.getByLabelText('Insert column left')).toBeTruthy()
    expect(screen.getByLabelText('Insert column right')).toBeTruthy()
    expect(screen.getByLabelText('Delete row')).toBeTruthy()
    expect(screen.getByLabelText('Delete column')).toBeTruthy()
    expect(screen.getByLabelText('Delete table')).toBeTruthy()
    expect(screen.getByLabelText('Align left')).toBeTruthy()
    expect(screen.getByLabelText('Align center')).toBeTruthy()
    expect(screen.getByLabelText('Align right')).toBeTruthy()
  })
})

describe('TableToolbar - positioning', () => {
  it('clamps left so a far-right table does not overflow the window', () => {
    const farRight = { top: 100, left: 5000, width: 200, height: 80 }
    render(<TableToolbar show rect={farRight} onCommand={vi.fn()} />)
    const bar = screen.getByRole('toolbar')
    const left = parseFloat((bar as HTMLElement).style.left)
    expect(left).toBeLessThanOrEqual(window.innerWidth)
    expect(left).toBeGreaterThanOrEqual(8)
  })

  it('hides when the table is scrolled out of the editor viewport', () => {
    const pane = document.createElement('div')
    pane.className = 'editor-pane'
    pane.getBoundingClientRect = () =>
      ({ top: 80, bottom: 800, left: 0, right: 1000, width: 1000, height: 720, x: 0, y: 80, toJSON() {} }) as DOMRect
    document.body.appendChild(pane)

    // Table sits entirely above the pane's visible top -> toolbar hidden.
    const above = { top: -300, left: 50, width: 300, height: 50 }
    const { container } = render(<TableToolbar show rect={above} onCommand={vi.fn()} />)
    const bar = container.querySelector('.table-toolbar') as HTMLElement
    expect(bar.style.visibility).toBe('hidden')

    document.body.removeChild(pane)
  })

  it('stays visible and below the chrome for a table in view', () => {
    const pane = document.createElement('div')
    pane.className = 'editor-pane'
    pane.getBoundingClientRect = () =>
      ({ top: 80, bottom: 800, left: 0, right: 1000, width: 1000, height: 720, x: 0, y: 80, toJSON() {} }) as DOMRect
    document.body.appendChild(pane)

    const inView = { top: 300, left: 50, width: 300, height: 80 }
    render(<TableToolbar show rect={inView} onCommand={vi.fn()} />)
    const bar = screen.getByRole('toolbar') as HTMLElement
    expect(bar.style.visibility).toBe('visible')
    // Never above the editor content top (pane.top + 4 = 84).
    expect(parseFloat(bar.style.top)).toBeGreaterThanOrEqual(84)

    document.body.removeChild(pane)
  })
})

describe('TableToolbar - command dispatch', () => {
  it('Insert row below calls onCommand(addRowAfter)', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByLabelText('Insert row below'))
    expect(onCommand).toHaveBeenCalledWith('addRowAfter')
  })

  it('Insert row above calls onCommand(addRowBefore)', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByLabelText('Insert row above'))
    expect(onCommand).toHaveBeenCalledWith('addRowBefore')
  })

  it('Insert column left/right call the column commands', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByLabelText('Insert column left'))
    fireEvent.click(screen.getByLabelText('Insert column right'))
    expect(onCommand).toHaveBeenNthCalledWith(1, 'addColumnBefore')
    expect(onCommand).toHaveBeenNthCalledWith(2, 'addColumnAfter')
  })

  it('Delete buttons call the delete commands', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByLabelText('Delete row'))
    fireEvent.click(screen.getByLabelText('Delete column'))
    fireEvent.click(screen.getByLabelText('Delete table'))
    expect(onCommand).toHaveBeenNthCalledWith(1, 'deleteRow')
    expect(onCommand).toHaveBeenNthCalledWith(2, 'deleteColumn')
    expect(onCommand).toHaveBeenNthCalledWith(3, 'deleteTable')
  })

  it('Align buttons call the align commands', () => {
    const onCommand = vi.fn()
    render(<TableToolbar show rect={RECT} onCommand={onCommand} />)
    fireEvent.click(screen.getByLabelText('Align left'))
    fireEvent.click(screen.getByLabelText('Align center'))
    fireEvent.click(screen.getByLabelText('Align right'))
    expect(onCommand).toHaveBeenNthCalledWith(1, 'alignLeft')
    expect(onCommand).toHaveBeenNthCalledWith(2, 'alignCenter')
    expect(onCommand).toHaveBeenNthCalledWith(3, 'alignRight')
  })
})
