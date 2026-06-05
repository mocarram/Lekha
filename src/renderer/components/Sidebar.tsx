import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { FileTree } from './FileTree'
import { Outline } from './Outline'

interface SidebarProps {
  /** Called when the user selects a file from the file tree. */
  onSelectFile: (path: string) => void
  /** Called when the user clicks a heading in the outline panel. */
  onJumpToHeading: (pos: number) => void
}

/**
 * Sidebar renders the left panel of the app.
 *
 * It reads sidebarVisible and sidebarTab from workspaceStore. When
 * sidebarVisible is false, the component renders nothing. Otherwise, it shows
 * the FileTree or Outline panel based on the active tab.
 *
 * Two tab buttons at the bottom (WYSIWYG-style) let the user switch between
 * the Files and Outline tabs. Tab changes are written back to workspaceStore
 * so the state persists across re-renders.
 */
export function Sidebar({ onSelectFile, onJumpToHeading }: SidebarProps) {
  const sidebarVisible = useWorkspaceStore((s) => s.sidebarVisible)
  const sidebarTab = useWorkspaceStore((s) => s.sidebarTab)
  const fileTree = useWorkspaceStore((s) => s.fileTree)

  const activePath = useEditorStore((s) => s.path)
  const outline = useEditorStore((s) => s.outline)

  if (!sidebarVisible) return null

  return (
    <aside className="sidebar">
      <div className="sidebar__content">
        {sidebarTab === 'files' ? (
          <FileTree
            nodes={fileTree}
            activePath={activePath}
            onSelect={onSelectFile}
          />
        ) : (
          <Outline items={outline} onJump={onJumpToHeading} />
        )}
      </div>

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
      </div>
    </aside>
  )
}
