/**
 * Unit tests for editorStore focus/typewriter mode additions.
 *
 * Verifies:
 *   - Default state: focusMode and typewriterMode start as false
 *   - toggleFocusMode() flips the focusMode flag
 *   - toggleTypewriterMode() flips the typewriterMode flag
 *   - setFocusMode(b) sets to an explicit value
 *   - setTypewriterMode(b) sets to an explicit value
 *   - reset() restores both to false
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../../src/renderer/store/editorStore'

describe('editorStore - focusMode / typewriterMode', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  it('starts with focusMode = false', () => {
    expect(useEditorStore.getState().focusMode).toBe(false)
  })

  it('starts with typewriterMode = false', () => {
    expect(useEditorStore.getState().typewriterMode).toBe(false)
  })

  describe('toggleFocusMode', () => {
    it('flips focusMode from false to true', () => {
      useEditorStore.getState().toggleFocusMode()
      expect(useEditorStore.getState().focusMode).toBe(true)
    })

    it('flips focusMode from true back to false', () => {
      useEditorStore.getState().toggleFocusMode()
      useEditorStore.getState().toggleFocusMode()
      expect(useEditorStore.getState().focusMode).toBe(false)
    })
  })

  describe('toggleTypewriterMode', () => {
    it('flips typewriterMode from false to true', () => {
      useEditorStore.getState().toggleTypewriterMode()
      expect(useEditorStore.getState().typewriterMode).toBe(true)
    })

    it('flips typewriterMode from true back to false', () => {
      useEditorStore.getState().toggleTypewriterMode()
      useEditorStore.getState().toggleTypewriterMode()
      expect(useEditorStore.getState().typewriterMode).toBe(false)
    })
  })

  describe('setFocusMode', () => {
    it('sets focusMode to true explicitly', () => {
      useEditorStore.getState().setFocusMode(true)
      expect(useEditorStore.getState().focusMode).toBe(true)
    })

    it('sets focusMode to false explicitly', () => {
      useEditorStore.getState().setFocusMode(true)
      useEditorStore.getState().setFocusMode(false)
      expect(useEditorStore.getState().focusMode).toBe(false)
    })
  })

  describe('setTypewriterMode', () => {
    it('sets typewriterMode to true explicitly', () => {
      useEditorStore.getState().setTypewriterMode(true)
      expect(useEditorStore.getState().typewriterMode).toBe(true)
    })

    it('sets typewriterMode to false explicitly', () => {
      useEditorStore.getState().setTypewriterMode(true)
      useEditorStore.getState().setTypewriterMode(false)
      expect(useEditorStore.getState().typewriterMode).toBe(false)
    })
  })

  describe('reset', () => {
    it('returns focusMode to false', () => {
      useEditorStore.getState().setFocusMode(true)
      useEditorStore.getState().reset()
      expect(useEditorStore.getState().focusMode).toBe(false)
    })

    it('returns typewriterMode to false', () => {
      useEditorStore.getState().setTypewriterMode(true)
      useEditorStore.getState().reset()
      expect(useEditorStore.getState().typewriterMode).toBe(false)
    })
  })
})
