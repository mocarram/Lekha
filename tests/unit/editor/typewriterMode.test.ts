/**
 * Unit tests for the typewriterPlugin.
 *
 * IMPORTANT NOTE ON SCOPE: The actual caret-centering scroll behavior is
 * layout-dependent and requires a real browser rendering engine. happy-dom
 * (used in the test environment) provides no real layout engine, so
 * coordsAtPos() returns zeros and scrollTop changes cannot be verified.
 *
 * These tests verify:
 *   1. The plugin is constructable.
 *   2. The plugin has a `view` spec (meaning it registers a view lifecycle).
 *   3. The plugin does NOT throw when update() is called in a layout-less
 *      environment (e.g., coordsAtPos returns {top:0, bottom:0}).
 *   4. The plugin reads the typewriter-active state via data-typewriter="on"
 *      on the scroll container - documented here for manual verification.
 *
 * Real centering is verified manually by running the app and confirming the
 * caret stays vertically centered as you type.
 */
import { describe, it, expect } from 'vitest'
import type { EditorView } from 'prosemirror-view'
import type { EditorState } from 'prosemirror-state'
import { typewriterPlugin } from '../../../src/renderer/editor/plugins/typewriter'

// ---------------------------------------------------------------------------
// Minimal mock types for the EditorView and EditorState shapes needed
// ---------------------------------------------------------------------------

interface MockCoords {
  top: number
  bottom: number
  left: number
  right: number
}

interface MockEditorView {
  dom: HTMLElement
  state: { selection: { head: number } }
  coordsAtPos: (pos: number) => MockCoords
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock EditorView. The typewriter plugin's view.update()
 * only calls: view.dom.closest(), view.coordsAtPos(), and view.state.selection.
 */
function makeMockView(opts: {
  domClosest?: ((selector: string) => Element | null) | null
  coords?: MockCoords
  head?: number
}): MockEditorView {
  const coords = opts.coords ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const head = opts.head ?? 0
  const mockDom = {
    closest: opts.domClosest ?? (() => null),
  } as unknown as HTMLElement

  return {
    dom: mockDom,
    state: { selection: { head } },
    coordsAtPos: () => coords,
  }
}

/**
 * Call the plugin's view spec factory and return the view lifecycle object.
 * The returned object always has an `update` method (our plugin guarantees this).
 */
function makeViewObj(mockView: MockEditorView): { update: (view: EditorView, prevState: EditorState) => void } {
  const plugin = typewriterPlugin()
  // Cast through unknown to satisfy strict TypeScript - we only implement the
  // subset of EditorView that the plugin actually uses.
  const viewObj = plugin.spec.view!(mockView as unknown as EditorView)
  // Our typewriterPlugin always returns an object with an update method.
  return viewObj as { update: (view: EditorView, prevState: EditorState) => void }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('typewriterPlugin', () => {
  it('is constructable and returns a Plugin', () => {
    const plugin = typewriterPlugin()
    expect(plugin).toBeDefined()
  })

  it('has a view spec (registers a ProseMirror view lifecycle)', () => {
    const plugin = typewriterPlugin()
    expect(typeof plugin.spec.view).toBe('function')
  })

  it('creates a view object with an update method when view spec is called', () => {
    const mockView = makeMockView({})
    const viewObj = makeViewObj(mockView)
    expect(viewObj).toBeDefined()
    expect(typeof viewObj.update).toBe('function')
  })

  it('no-ops gracefully when called with zero coords (test env guard)', () => {
    // Zero coords means no real layout - the plugin must skip the scroll.
    const mockView = makeMockView({ coords: { top: 0, bottom: 0, left: 0, right: 0 }, head: 1 })
    const viewObj = makeViewObj(mockView)
    // Should not throw even with zero coords
    expect(() => {
      viewObj.update(
        mockView as unknown as EditorView,
        mockView.state as unknown as EditorState,
      )
    }).not.toThrow()
  })

  it('no-ops gracefully when no scroll container is found', () => {
    // Simulate DOM with no scroll container ancestor
    const mockView = makeMockView({
      domClosest: () => null,
      coords: { top: 100, bottom: 116, left: 0, right: 0 },
      head: 5,
    })
    const viewObj = makeViewObj(mockView)
    expect(() => {
      viewObj.update(
        mockView as unknown as EditorView,
        mockView.state as unknown as EditorState,
      )
    }).not.toThrow()
  })

  it('no-ops when typewriter mode is not active (no data-typewriter="on" attr)', () => {
    // Simulate a scroll container WITHOUT data-typewriter="on"
    const scrollContainer = {
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
      scrollTop: 0,
    }

    // closest('[data-typewriter="on"]') returns null -> typewriter is off
    const mockView = makeMockView({
      domClosest: (selector: string) => {
        if (selector === '[data-typewriter="on"]') return null
        return scrollContainer as unknown as Element
      },
      coords: { top: 100, bottom: 116, left: 0, right: 0 },
      head: 5,
    })

    const originalScrollTop = scrollContainer.scrollTop
    const viewObj = makeViewObj(mockView)
    viewObj.update(
      mockView as unknown as EditorView,
      mockView.state as unknown as EditorState,
    )
    // scrollTop should be unchanged since typewriter is not active
    expect(scrollContainer.scrollTop).toBe(originalScrollTop)
  })

  it('skips scroll when prevState equals current state (no-op on no-change)', () => {
    // The plugin should only scroll when selection.head changed.
    // Calling update with the same view.state and prevState should be a no-op
    // (prevHead tracking).
    const scrollContainer = {
      getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }),
      scrollTop: 0,
    }

    const mockView = makeMockView({
      domClosest: (selector: string) => {
        if (selector === '[data-typewriter="on"]') return scrollContainer as unknown as Element
        return null
      },
      coords: { top: 300, bottom: 316, left: 0, right: 0 },
      head: 5,
    })

    const viewObj = makeViewObj(mockView)

    // First call: processes and records head=5 (but coords.top is 300, not 0
    // so it WOULD scroll - but scrollContainer.scrollTop adjustment happens)
    viewObj.update(
      mockView as unknown as EditorView,
      mockView.state as unknown as EditorState,
    )

    // Record scrollTop after first update
    const scrollAfterFirst = scrollContainer.scrollTop

    // Second call with same state: prevHead === head so should be a no-op
    viewObj.update(
      mockView as unknown as EditorView,
      mockView.state as unknown as EditorState,
    )

    // scrollTop should not change on the second call
    expect(scrollContainer.scrollTop).toBe(scrollAfterFirst)
  })
})
