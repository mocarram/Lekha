import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { Articles } from '../../../src/renderer/components/Articles'
import type { ArticleEntry } from '../../../src/shared/types'

afterEach(() => cleanup())

const ENTRIES: ArticleEntry[] = [
  { path: '/root/Downloads/notes.md', title: 'My Notes', mtimeMs: Date.now(), sizeBytes: 100, preview: 'hello world' },
  { path: '/root/spec.md', title: 'Spec', mtimeMs: Date.now() - 1000, sizeBytes: 50, preview: '' },
]

beforeEach(() => {
  vi.stubGlobal('lekha', { listArticles: vi.fn(() => Promise.resolve(ENTRIES)) })
})

describe('Articles', () => {
  it('shows "No folder open" when there is no root', () => {
    render(<Articles rootFolder={null} activePath={null} onSelect={vi.fn()} />)
    expect(screen.getByText('No folder open')).toBeTruthy()
  })

  it('loads and lists articles with title, source and preview', async () => {
    render(<Articles rootFolder="/root" activePath={null} onSelect={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('My Notes')).toBeTruthy())
    expect(screen.getByText('Spec')).toBeTruthy()
    expect(screen.getByText('Downloads')).toBeTruthy()
    expect(screen.getByText('hello world')).toBeTruthy()
  })

  it('calls onSelect with the path when a row is clicked', async () => {
    const onSelect = vi.fn()
    render(<Articles rootFolder="/root" activePath={null} onSelect={onSelect} />)
    await waitFor(() => expect(screen.getByText('My Notes')).toBeTruthy())
    fireEvent.click(screen.getByText('My Notes'))
    expect(onSelect).toHaveBeenCalledWith('/root/Downloads/notes.md')
  })
})
