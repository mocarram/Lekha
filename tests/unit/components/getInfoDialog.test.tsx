import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { GetInfoDialog, type GetInfoData } from '../../../src/renderer/components/GetInfoDialog'

afterEach(() => cleanup())

const DATA: GetInfoData = {
  path: '/docs/notes.md',
  sizeBytes: 2048,
  birthtimeMs: 0,
  mtimeMs: 0,
  words: 12,
  chars: 80,
}

describe('GetInfoDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<GetInfoDialog open={false} data={DATA} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when data is null', () => {
    const { container } = render(<GetInfoDialog open data={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the name, human-readable size and counts', () => {
    render(<GetInfoDialog open data={DATA} onClose={vi.fn()} />)
    expect(screen.getByText('notes.md')).toBeTruthy()
    expect(screen.getByText('2.0 KB')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('80')).toBeTruthy()
  })
})
