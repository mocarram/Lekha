import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { FileTree } from './FileTree'
import { Outline } from './Outline'
import { FolderSearch } from './FolderSearch'
import { SidebarResizer } from './SidebarResizer'

interface SidebarProps {
  /** Called when the user selects a file from the file tree. */
  onSelectFile: (path: string) => void
  /** Called when the user clicks a heading in the outline panel. */
  onJumpToHeading: (pos: number) => void
  /**
   * Called when the user clicks a folder-search result.
   * Opens the file and triggers the in-document find so the editor highlights
   * and navigates to the matching text (open-then-find approach).
   */
  onOpenSearchResult: (filePath: string, query: string, caseSensitive: boolean) => void
  /** Create a new file in `dir` (null = workspace root), then refresh the tree. */
  onNewFile: (dir: string | null) => void | Promise<void>
  /** Create a new folder in `dir` (null = workspace root), then refresh. */
  onNewFolder: (dir: string | null) => void | Promise<void>
  /** Rename `oldPath` to `newName` (same parent dir), then refresh. */
  onRenameEntry: (oldPath: string, newName: string) => void | Promise<void>
  /** Delete (trash) `path`, then refresh. */
  onDeleteEntry: (path: string) => void | Promise<void>
  /** Reveal `path` in the OS file manager. */
  onRevealEntry: (path: string) => void
  /** Current sidebar width in pixels - driven from persisted settings. */
  sidebarWidth: number
  /** Called when the drag handle changes the width (live updates). */
  onSidebarWidthChange: (px: number) => void
}

/**
 * Sidebar renders the left panel of the app.
 *
 * It reads sidebarVisible and sidebarTab from workspaceStore. When
 * sidebarVisible is false, the component renders nothing. Otherwise, it shows
 * the FileTree, Outline, or FolderSearch panel based on the active tab.
 *
 * Three tab buttons at the bottom (WYSIWYG-style) let the user switch between
 * Files, Outline, and Search. The search icon activates the search view.
 * Tab changes are written back to workspaceStore so the state persists.
 */
export function Sidebar({
  onSelectFile,
  onJumpToHeading,
  onOpenSearchResult,
  onNewFile,
  onNewFolder,
  onRenameEntry,
  onDeleteEntry,
  onRevealEntry,
  sidebarWidth,
  onSidebarWidthChange,
}: SidebarProps) {
  const sidebarVisible = useWorkspaceStore((s) => s.sidebarVisible)
  const sidebarTab = useWorkspaceStore((s) => s.sidebarTab)
  const rootFolder = useWorkspaceStore((s) => s.rootFolder)
  const fileTree = useWorkspaceStore((s) => s.fileTree)

  const activePath = useEditorStore((s) => s.path)
  const outline = useEditorStore((s) => s.outline)

  if (!sidebarVisible) return null

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar__content">
        {sidebarTab === 'files' ? (
          <FileTree
            nodes={fileTree}
            activePath={activePath}
            onSelect={onSelectFile}
            onNewFile={onNewFile}
            onNewFolder={onNewFolder}
            onRename={onRenameEntry}
            onDelete={onDeleteEntry}
            onReveal={onRevealEntry}
          />
        ) : sidebarTab === 'outline' ? (
          <Outline items={outline} onJump={onJumpToHeading} />
        ) : (
          <FolderSearch
            rootFolder={rootFolder}
            onOpenResult={onOpenSearchResult}
          />
        )}
      </div>

      {/* Drag handle on the right edge */}
      <SidebarResizer
        currentWidth={sidebarWidth}
        onWidthChange={onSidebarWidthChange}
      />

      {/* Tab switcher at the bottom (WYSIWYG-style) */}
      <div className="sidebar__tabs">
        <button
          type="button"
          className={`sidebar__tab-btn${sidebarTab === 'files' ? ' active' : ''}`}
          onClick={() => { useWorkspaceStore.getState().setSidebarTab('files') }}
        >
          Files
        </button>
        <button
          type="button"
          className={`sidebar__tab-btn${sidebarTab === 'outline' ? ' active' : ''}`}
          onClick={() => { useWorkspaceStore.getState().setSidebarTab('outline') }}
        >
          Outline
        </button>
        <button
          type="button"
          className={`sidebar__tab-btn${sidebarTab === 'search' ? ' active' : ''}`}
          aria-label="Search"
          onClick={() => { useWorkspaceStore.getState().setSidebarTab('search') }}
        >
          Search
        </button>
      </div>
    </aside>
  )
}
