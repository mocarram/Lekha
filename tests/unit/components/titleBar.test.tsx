/**
 * Tests for TitleBar component.
 *
 * TitleBar reads from useEditorStore and shows the document title with a dirty
 * indicator dot when isDirty is true.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { TitleBar } from '../../../src/renderer/components/TitleBar'
import { useEditorStore } from '../../../src/renderer/store/editorStore'

afterEach(() => {
  cleanup()
  useEditorStore.getState().reset()
})

beforeEach(() => {
  useEditorStore.getState().reset()
})

describe('TitleBar', () => {
  it('renders the document title from the store', () => {
    useEditorStore.getState().openFile('/docs/hello.md', '')
    const { getByText } = render(<TitleBar />)
    expect(getByText(/hello\.md/)).toBeTruthy()
  })

  it('renders "Untitled" when no file is open', () => {
    const { getByText } = render(<TitleBar />)
    expect(getByText(/Untitled/)).toBeTruthy()
  })

  it('shows dirty dot (•) when isDirty is true', () => {
    useEditorStore.getState().openFile('/docs/hello.md', '')
    useEditorStore.getState().markDirty()
    const { container } = render(<TitleBar />)
    const dot = container.querySelector('.title-bar__dirty')
    expect(dot).not.toBeNull()
    expect(dot!.textContent).toBe('•')
  })

  it('does not show dirty dot when isDirty is false', () => {
    useEditorStore.getState().openFile('/docs/hello.md', '')
    // isDirty is false after openFile
    const { container } = render(<TitleBar />)
    const dot = container.querySelector('.title-bar__dirty')
    expect(dot).toBeNull()
  })

  it('has a macOS traffic-light spacer gutter element', () => {
    const { container } = render(<TitleBar />)
    const gutter = container.querySelector('.title-bar__gutter')
    expect(gutter).not.toBeNull()
  })

  it('applies the title-bar class to the root element', () => {
    const { container } = render(<TitleBar />)
    expect(container.firstElementChild!.classList.contains('title-bar')).toBe(true)
  })
})
