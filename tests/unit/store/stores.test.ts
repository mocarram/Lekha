/**
 * Unit tests for editorStore and workspaceStore.
 *
 * Store state is reset in beforeEach so tests are fully isolated.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../../src/renderer/store/editorStore'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import type { FileNode } from '../../../src/shared/types'

// ---------------------------------------------------------------------------
// editorStore
// ---------------------------------------------------------------------------

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  it('starts with default initial state', () => {
    const s = useEditorStore.getState()
    expect(s.path).toBeNull()
    expect(s.title).toBe('Untitled')
    expect(s.isDirty).toBe(false)
    expect(s.mode).toBe('wysiwyg')
    expect(s.markdown).toBe('')
    expect(s.outline).toEqual([])
    expect(s.wordCount).toBe(0)
    expect(s.charCount).toBe(0)
  })

  describe('openFile', () => {
    it('sets path, derives title from basename, clears dirty flag', () => {
      useEditorStore.getState().openFile('/home/user/notes/hello.md', '# Hello')
      const s = useEditorStore.getState()
      expect(s.path).toBe('/home/user/notes/hello.md')
      expect(s.title).toBe('hello.md')
      expect(s.isDirty).toBe(false)
      expect(s.markdown).toBe('# Hello')
      expect(s.mode).toBe('wysiwyg')
    })

    it('derives title as Untitled when path is null', () => {
      useEditorStore.getState().openFile(null, '')
      expect(useEditorStore.getState().title).toBe('Untitled')
      expect(useEditorStore.getState().path).toBeNull()
    })

    it('handles Windows-style backslash path separators', () => {
      useEditorStore.getState().openFile('C:\\Users\\user\\doc.md', '')
      expect(useEditorStore.getState().title).toBe('doc.md')
    })
  })

  describe('markDirty / markClean', () => {
    it('markDirty sets isDirty to true', () => {
      useEditorStore.getState().markDirty()
      expect(useEditorStore.getState().isDirty).toBe(true)
    })

    it('markClean sets isDirty to false after markDirty', () => {
      useEditorStore.getState().markDirty()
      useEditorStore.getState().markClean()
      expect(useEditorStore.getState().isDirty).toBe(false)
    })
  })

  describe('setCounts', () => {
    it('updates wordCount and charCount', () => {
      useEditorStore.getState().setCounts({ words: 42, chars: 200 })
      const s = useEditorStore.getState()
      expect(s.wordCount).toBe(42)
      expect(s.charCount).toBe(200)
    })
  })

  describe('setOutline', () => {
    it('replaces the outline array', () => {
      const items = [
        { level: 1, text: 'Intro', pos: 0 },
        { level: 2, text: 'Body', pos: 10 },
      ]
      useEditorStore.getState().setOutline(items)
      expect(useEditorStore.getState().outline).toEqual(items)
    })
  })

  describe('setMode', () => {
    it('switches mode to source', () => {
      useEditorStore.getState().setMode('source')
      expect(useEditorStore.getState().mode).toBe('source')
    })

    it('switches mode back to wysiwyg', () => {
      useEditorStore.getState().setMode('source')
      useEditorStore.getState().setMode('wysiwyg')
      expect(useEditorStore.getState().mode).toBe('wysiwyg')
    })
  })

  describe('setMarkdown', () => {
    it('updates the markdown string', () => {
      useEditorStore.getState().setMarkdown('## Updated')
      expect(useEditorStore.getState().markdown).toBe('## Updated')
    })
  })

  describe('setPath', () => {
    it('updates path and re-derives title', () => {
      useEditorStore.getState().setPath('/docs/readme.md')
      const s = useEditorStore.getState()
      expect(s.path).toBe('/docs/readme.md')
      expect(s.title).toBe('readme.md')
    })

    it('sets title to Untitled when path is null', () => {
      useEditorStore.getState().setPath(null)
      expect(useEditorStore.getState().title).toBe('Untitled')
    })
  })

  describe('newFile', () => {
    it('resets document state to blank', () => {
      useEditorStore.getState().openFile('/some/file.md', '# Content')
      useEditorStore.getState().markDirty()
      useEditorStore.getState().setCounts({ words: 10, chars: 50 })
      useEditorStore.getState().setOutline([{ level: 1, text: 'X', pos: 0 }])

      useEditorStore.getState().newFile()

      const s = useEditorStore.getState()
      expect(s.path).toBeNull()
      expect(s.title).toBe('Untitled')
      expect(s.markdown).toBe('')
      expect(s.isDirty).toBe(false)
      expect(s.mode).toBe('wysiwyg')
      expect(s.outline).toEqual([])
      expect(s.wordCount).toBe(0)
      expect(s.charCount).toBe(0)
    })
  })

  describe('reset', () => {
    it('returns store to initial defaults', () => {
      useEditorStore.getState().openFile('/x/y.md', '# Y')
      useEditorStore.getState().markDirty()
      useEditorStore.getState().setMode('source')

      useEditorStore.getState().reset()

      const s = useEditorStore.getState()
      expect(s.path).toBeNull()
      expect(s.title).toBe('Untitled')
      expect(s.isDirty).toBe(false)
      expect(s.mode).toBe('wysiwyg')
      expect(s.markdown).toBe('')
      expect(s.outline).toEqual([])
      expect(s.wordCount).toBe(0)
      expect(s.charCount).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// workspaceStore
// ---------------------------------------------------------------------------

const WORKSPACE_INITIAL = {
  rootFolder: null,
  fileTree: [] as FileNode[],
  recentFiles: [] as string[],
  sidebarVisible: true,
  sidebarTab: 'files' as const,
}

describe('workspaceStore', () => {
  beforeEach(() => {
    // Reset workspace store to defaults manually (no reset action needed)
    useWorkspaceStore.setState(WORKSPACE_INITIAL)
  })

  it('starts with default initial state', () => {
    const s = useWorkspaceStore.getState()
    expect(s.rootFolder).toBeNull()
    expect(s.fileTree).toEqual([])
    expect(s.recentFiles).toEqual([])
    expect(s.sidebarVisible).toBe(true)
    expect(s.sidebarTab).toBe('files')
  })

  describe('toggleSidebar', () => {
    it('flips sidebarVisible from true to false', () => {
      useWorkspaceStore.getState().toggleSidebar()
      expect(useWorkspaceStore.getState().sidebarVisible).toBe(false)
    })

    it('flips sidebarVisible from false back to true', () => {
      useWorkspaceStore.getState().toggleSidebar()
      useWorkspaceStore.getState().toggleSidebar()
      expect(useWorkspaceStore.getState().sidebarVisible).toBe(true)
    })
  })

  describe('setSidebarVisible', () => {
    it('sets sidebarVisible to an explicit value', () => {
      useWorkspaceStore.getState().setSidebarVisible(false)
      expect(useWorkspaceStore.getState().sidebarVisible).toBe(false)
      useWorkspaceStore.getState().setSidebarVisible(true)
      expect(useWorkspaceStore.getState().sidebarVisible).toBe(true)
    })
  })

  describe('setRootFolder', () => {
    it('updates rootFolder path', () => {
      useWorkspaceStore.getState().setRootFolder('/projects/notes')
      expect(useWorkspaceStore.getState().rootFolder).toBe('/projects/notes')
    })
  })

  describe('setFileTree', () => {
    it('replaces the file tree', () => {
      const tree: FileNode[] = [
        { name: 'readme.md', path: '/p/readme.md', isDirectory: false },
        { name: 'src', path: '/p/src', isDirectory: true, children: [] },
      ]
      useWorkspaceStore.getState().setFileTree(tree)
      expect(useWorkspaceStore.getState().fileTree).toEqual(tree)
    })
  })

  describe('setRecentFiles', () => {
    it('replaces the recent files list', () => {
      const list = ['/a.md', '/b.md']
      useWorkspaceStore.getState().setRecentFiles(list)
      expect(useWorkspaceStore.getState().recentFiles).toEqual(list)
    })
  })

  describe('setSidebarTab', () => {
    it('switches to outline tab', () => {
      useWorkspaceStore.getState().setSidebarTab('outline')
      expect(useWorkspaceStore.getState().sidebarTab).toBe('outline')
    })

    it('switches back to files tab', () => {
      useWorkspaceStore.getState().setSidebarTab('outline')
      useWorkspaceStore.getState().setSidebarTab('files')
      expect(useWorkspaceStore.getState().sidebarTab).toBe('files')
    })
  })
})
