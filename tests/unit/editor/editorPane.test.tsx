/**
 * Tests for EditorPane - orchestrates WYSIWYG (ProseMirror) and source
 * (CodeMirror) modes with lossless round-trip content hand-off.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { createRef } from 'react'
import {
  EditorPane,
  type EditorPaneHandle,
} from '../../../src/renderer/editor/EditorPane'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import { parseMarkdown } from '../../../src/renderer/editor/parser'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_MD = '# Hello\n\n- a\n- b'

/** Canonical markdown for the sample, determined by parse->serialize. */
function canonical(md: string): string {
  return serializeMarkdown(parseMarkdown(md))
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('EditorPane component', () => {
  it('starts in wysiwyg mode', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)
    expect(ref.current!.getMode()).toBe('wysiwyg')
  })

  it('getMarkdown() returns serialized content in wysiwyg mode', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)
    const md = ref.current!.getMarkdown()
    expect(md).toBe(canonical(SAMPLE_MD))
  })

  it('toggleMode() switches from wysiwyg to source', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)

    act(() => {
      ref.current!.toggleMode()
    })

    expect(ref.current!.getMode()).toBe('source')
  })

  it('toggleMode() switches from source back to wysiwyg', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)

    act(() => {
      ref.current!.toggleMode()
    })
    expect(ref.current!.getMode()).toBe('source')

    act(() => {
      ref.current!.toggleMode()
    })
    expect(ref.current!.getMode()).toBe('wysiwyg')
  })

  it('round-trip: wysiwyg -> source preserves markdown content', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)

    const beforeToggle = ref.current!.getMarkdown()

    act(() => {
      ref.current!.toggleMode()
    })

    // In source mode, getMarkdown() returns the raw CM text
    const inSource = ref.current!.getMarkdown()
    expect(inSource).toBe(beforeToggle)
  })

  it('round-trip: source -> wysiwyg preserves markdown content', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)

    // Capture initial canonical markdown
    const initial = ref.current!.getMarkdown()

    // Go to source
    act(() => {
      ref.current!.toggleMode()
    })
    expect(ref.current!.getMode()).toBe('source')

    // Go back to wysiwyg
    act(() => {
      ref.current!.toggleMode()
    })
    expect(ref.current!.getMode()).toBe('wysiwyg')

    // Content must be unchanged after round-trip
    expect(ref.current!.getMarkdown()).toBe(initial)
  })

  it('wysiwyg DOM shows heading after round-trip back to wysiwyg', () => {
    const ref = createRef<EditorPaneHandle>()
    const { container } = render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)

    // Verify heading present initially
    expect(container.querySelector('h1')).not.toBeNull()

    // Toggle to source
    act(() => {
      ref.current!.toggleMode()
    })

    // Toggle back to wysiwyg
    act(() => {
      ref.current!.toggleMode()
    })

    // Heading must be present again
    expect(container.querySelector('h1')).not.toBeNull()
    expect(container.querySelector('h1')!.textContent).toBe('Hello')
  })

  it('setMarkdown() replaces content in wysiwyg mode', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)

    act(() => {
      ref.current!.setMarkdown('## World')
    })

    expect(ref.current!.getMarkdown().trim()).toBe('## World')
  })

  it('focus() can be called without throwing in wysiwyg mode', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)
    expect(() => ref.current!.focus()).not.toThrow()
  })

  it('focus() can be called without throwing in source mode', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)

    act(() => {
      ref.current!.toggleMode()
    })

    expect(() => ref.current!.focus()).not.toThrow()
  })

  it('scrollToPos() can be called without throwing in wysiwyg mode', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)
    expect(() => ref.current!.scrollToPos(0)).not.toThrow()
  })

  it('scrollToPos() is a no-op (no throw) in source mode', () => {
    const ref = createRef<EditorPaneHandle>()
    render(<EditorPane initialMarkdown={SAMPLE_MD} ref={ref} />)
    act(() => {
      ref.current!.toggleMode()
    })
    expect(() => ref.current!.scrollToPos(0)).not.toThrow()
  })

  it('onChange fires on construction from initial markdown state', () => {
    // onChange should NOT fire on mount (no change happened yet), only on edits
    const onChange = vi.fn()
    render(<EditorPane initialMarkdown={SAMPLE_MD} onChange={onChange} />)
    // No user interaction - onChange must not fire on mount
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts a className prop', () => {
    const { container } = render(
      <EditorPane initialMarkdown="hello" className="pane-class" />,
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('pane-class')
  })
})
