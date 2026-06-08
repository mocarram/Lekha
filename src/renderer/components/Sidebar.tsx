import { useState } from 'react'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { FileTree } from './FileTree'
import { Outline } from './Outline'
import { Articles } from './Articles'
import { FolderSearch } from './FolderSearch'
import { SidebarResizer } from './SidebarResizer'
import { classifyDrop, dragMaybeFolder } from './sidebarDrop'

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
  /** Open a folder (by absolute path) as the workspace - used by drag-and-drop. */
  onOpenFolderPath: (dir: string) => void | Promise<void>
  /** Show a brief transient message to the user (e.g. drop feedback). */
  onNotify: (message: string) => void
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
 * Three tab buttons at the bottom (minimalist chrome) let the user switch between
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
  onOpenFolderPath,
  onNotify,
  sidebarWidth,
  onSidebarWidthChange,
}: SidebarProps) {
  const sidebarVisible = useWorkspaceStore((s) => s.sidebarVisible)
  const sidebarTab = useWorkspaceStore((s) => s.sidebarTab)
  const rootFolder = useWorkspaceStore((s) => s.rootFolder)
  const fileTree = useWorkspaceStore((s) => s.fileTree)

  const activePath = useEditorStore((s) => s.path)
  const outline = useEditorStore((s) => s.outline)

  // Drag-and-drop onto the Files panel opens a dropped FOLDER as the workspace.
  // Files are NOT opened here (the tree only shows the open folder's contents);
  // dropping files is handled by the editor area instead. dragActive drives the
  // drop affordance.
  const [dragActive, setDragActive] = useState(false)

  // Only invite the drop for drags that COULD be a folder (the sidebar accepts
  // folders only). A clearly-typed file drag (image/png, application/pdf, ...)
  // gets no glow here; the global guard swallows it so nothing odd happens.
  const handleDragOver = (e: React.DragEvent): void => {
    if (!dragMaybeFolder(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dragActive) setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    // Ignore leave events fired while moving between child elements.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    if (!dragMaybeFolder(e.dataTransfer)) return
    e.preventDefault()
    setDragActive(false)
    const { folders } = classifyDrop(e.dataTransfer)
    if (folders.length > 0) {
      void onOpenFolderPath(folders[0]!)
    } else {
      // A file (not a folder) was dropped on the sidebar: it belongs to the
      // editor. Tell the user instead of silently doing nothing.
      onNotify('Drop files onto the editor to open them as tabs.')
    }
  }

  if (!sidebarVisible) return null

  // Section header label reflects the active tab (minimalist uppercase title).
  const headerLabel =
    sidebarTab === 'files'
      ? 'Files'
      : sidebarTab === 'outline'
        ? 'Outline'
        : sidebarTab === 'articles'
          ? 'Articles'
          : 'Search'

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar__header">{headerLabel}</div>
      <div className="sidebar__content">
        {sidebarTab === 'files' ? (
          <div
            className={`files-panel${dragActive ? ' files-panel--drop' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {rootFolder === null && fileTree.length === 0 ? (
              <div className="files-empty">
                <p className="files-empty__title">No folder open</p>
                <p className="files-empty__hint">
                  Drag a folder here to open it. Drop files onto the editor to open them as tabs.
                </p>
              </div>
            ) : (
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
            )}
            {/* Drag-over overlay hint (shown whether empty or populated). */}
            <div className="files-panel__drop-hint" aria-hidden="true">
              Drop to open
            </div>
          </div>
        ) : sidebarTab === 'outline' ? (
          <Outline items={outline} onJump={onJumpToHeading} />
        ) : sidebarTab === 'articles' ? (
          <Articles
            rootFolder={rootFolder}
            activePath={activePath}
            onSelect={onSelectFile}
          />
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

      {/* Tab switcher at the bottom (minimalist chrome) */}
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
          className={`sidebar__tab-btn${sidebarTab === 'articles' ? ' active' : ''}`}
          onClick={() => { useWorkspaceStore.getState().setSidebarTab('articles') }}
        >
          Articles
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
