/**
 * Tests for StatusBar component.
 *
 * StatusBar reads wordCount, charCount, and mode from useEditorStore,
 * and calls the onToggleSource prop when the mode toggle button is clicked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { StatusBar } from '../../../src/renderer/components/StatusBar'
import { useEditorStore } from '../../../src/renderer/store/editorStore'

afterEach(() => {
  cleanup()
  useEditorStore.getState().reset()
})

beforeEach(() => {
  useEditorStore.getState().reset()
})

describe('StatusBar', () => {
  it('shows word count from store', () => {
    useEditorStore.getState().setCounts({ words: 42, chars: 200 })
    const { getByText } = render(<StatusBar onToggleSource={() => {}} />)
    expect(getByText(/42 words/)).toBeTruthy()
  })

  it('shows character count from store', () => {
    useEditorStore.getState().setCounts({ words: 42, chars: 200 })
    const { getByText } = render(<StatusBar onToggleSource={() => {}} />)
    expect(getByText(/200 chars/)).toBeTruthy()
  })

  it('shows 0 words and 0 chars when store is at defaults', () => {
    const { getByText } = render(<StatusBar onToggleSource={() => {}} />)
    expect(getByText(/0 words/)).toBeTruthy()
    expect(getByText(/0 chars/)).toBeTruthy()
  })

  it('shows "WYSIWYG" label when mode is wysiwyg', () => {
    useEditorStore.getState().setMode('wysiwyg')
    const { getByRole } = render(<StatusBar onToggleSource={() => {}} />)
    const btn = getByRole('button')
    expect(btn.textContent).toContain('WYSIWYG')
  })

  it('shows "Source" label when mode is source', () => {
    useEditorStore.getState().setMode('source')
    const { getByRole } = render(<StatusBar onToggleSource={() => {}} />)
    const btn = getByRole('button')
    expect(btn.textContent).toContain('Source')
  })

  it('calls onToggleSource when toggle button is clicked', () => {
    const onToggle = vi.fn()
    const { getByRole } = render(<StatusBar onToggleSource={onToggle} />)
    fireEvent.click(getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('applies the status-bar class to the root element', () => {
    const { container } = render(<StatusBar onToggleSource={() => {}} />)
    expect(container.firstElementChild!.classList.contains('status-bar')).toBe(true)
  })
})
