/**
 * Unit tests for useFolderWatcher.
 *
 * window.lekha is stubbed via vi.stubGlobal (matching the repo's other hook
 * tests), exposing just the two bridge methods this hook uses. The
 * onFolderChanged stub captures the registered callback so a test can drive a
 * folderChanged event, and its returned unsubscribe clears that capture so the
 * unmount test can assert teardown ran.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFolderWatcher } from '../../../src/renderer/hooks/useFolderWatcher'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import type { FileNode } from '../../../src/shared/types'

let folderChangedCb: ((payload: { dirs: string[] }) => void) | null = null

function makeLekha() {
  return {
    watchFolder: vi.fn(() => Promise.resolve()),
    onFolderChanged: vi.fn((cb: (p: { dirs: string[] }) => void) => {
      folderChangedCb = cb
      return () => {
        folderChangedCb = null
      }
    }),
  }
}

beforeEach(() => {
  folderChangedCb = null
  useWorkspaceStore.setState({ rootFolder: null, fileTree: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useFolderWatcher', () => {
  it('tells main to watch the open root when it changes', () => {
    const lekha = makeLekha()
    vi.stubGlobal('lekha', lekha)
    const loadChildren = vi.fn(() => Promise.resolve())

    renderHook(() => useFolderWatcher({ loadChildren }))
    expect(lekha.watchFolder).toHaveBeenCalledWith(null) // no folder yet

    act(() => {
      useWorkspaceStore.getState().setRootFolder('/proj')
    })
    expect(lekha.watchFolder).toHaveBeenCalledWith('/proj')
  })

  it('re-reads a changed dir only when it is currently loaded', () => {
    const lekha = makeLekha()
    vi.stubGlobal('lekha', lekha)
    const loadChildren = vi.fn(() => Promise.resolve())
    const tree: FileNode[] = [
      { name: 'sub', path: '/proj/sub', isDirectory: true, children: [] },
      { name: 'other', path: '/proj/other', isDirectory: true }, // unloaded (children omitted)
    ]
    useWorkspaceStore.setState({ rootFolder: '/proj', fileTree: tree })

    renderHook(() => useFolderWatcher({ loadChildren }))

    act(() => {
      folderChangedCb!({ dirs: ['/proj/sub', '/proj/other', '/proj'] })
    })

    expect(loadChildren).toHaveBeenCalledWith('/proj/sub')
    expect(loadChildren).toHaveBeenCalledWith('/proj')
    expect(loadChildren).not.toHaveBeenCalledWith('/proj/other')
  })

  it('ignores folderChanged when no folder is open', () => {
    const lekha = makeLekha()
    vi.stubGlobal('lekha', lekha)
    const loadChildren = vi.fn(() => Promise.resolve())
    useWorkspaceStore.setState({ rootFolder: null, fileTree: [] })

    renderHook(() => useFolderWatcher({ loadChildren }))
    act(() => {
      folderChangedCb!({ dirs: ['/proj'] })
    })
    expect(loadChildren).not.toHaveBeenCalled()
  })

  it('unsubscribes from folderChanged on unmount', () => {
    const lekha = makeLekha()
    vi.stubGlobal('lekha', lekha)
    const loadChildren = vi.fn(() => Promise.resolve())
    const { unmount } = renderHook(() => useFolderWatcher({ loadChildren }))
    expect(folderChangedCb).not.toBeNull()
    unmount()
    expect(folderChangedCb).toBeNull() // unsubscribe ran
  })
})
