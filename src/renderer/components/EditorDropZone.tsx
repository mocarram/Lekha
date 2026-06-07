import { useRef, useState, type ReactNode } from 'react'
import { classifyDrop, dragIsOpenType, openableFiles } from './sidebarDrop'

/** Basename of an absolute path (for user-facing feedback). */
function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] ?? p
}

interface EditorDropZoneProps {
  /** Open a dropped folder as the workspace. */
  onOpenFolder: (dir: string) => void
  /** Open dropped openable (text/markdown) file paths as tabs. */
  onOpenFiles: (paths: string[]) => void
  /** Show a brief transient message (e.g. unsupported file feedback). */
  onNotify: (message: string) => void
  children: ReactNode
}

/**
 * The `.editor-area` wrapper that accepts drag-and-drop of folders (open as
 * workspace) and markdown files (open as tabs), with a "Drop to open" overlay.
 *
 * Handling runs in the CAPTURE phase so an "open" drag (a folder or a non-image
 * file) is intercepted BEFORE it reaches the ProseMirror editor - we stop it so
 * the editor never tries to insert the file's contents. Image drags are left
 * alone (dragIsOpenType is false), so dropping an image into the editor still
 * inserts it as before.
 */
export function EditorDropZone({ onOpenFolder, onOpenFiles, onNotify, children }: EditorDropZoneProps) {
  const [dropActive, setDropActive] = useState(false)
  // Depth counter: dragenter/leave fire for every child, so we only clear the
  // overlay when the count returns to zero (the pointer truly left the area).
  const depth = useRef(0)

  const handleDragOver = (e: React.DragEvent): void => {
    if (!dragIsOpenType(e.dataTransfer)) return // image/other -> let the editor handle it
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    if (!dropActive) setDropActive(true)
  }

  const handleDragEnter = (e: React.DragEvent): void => {
    if (!dragIsOpenType(e.dataTransfer)) return
    depth.current += 1
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    if (!dragIsOpenType(e.dataTransfer)) return
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDropActive(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    if (!dragIsOpenType(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    depth.current = 0
    setDropActive(false)
    const { folders, files } = classifyDrop(e.dataTransfer)
    if (folders.length > 0) onOpenFolder(folders[0]!)
    const openable = openableFiles(files)
    if (openable.length > 0) onOpenFiles(openable)
    // A non-image file we cannot open as text (e.g. .pdf, .docx) was dropped:
    // tell the user instead of silently doing nothing.
    if (folders.length === 0 && openable.length === 0 && files.length > 0) {
      const name = baseName(files[0]!)
      onNotify(`Can't open "${name}" - only folders and text/markdown files.`)
    }
  }

  return (
    <div
      className="editor-area"
      onDragEnterCapture={handleDragEnter}
      onDragOverCapture={handleDragOver}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
    >
      {children}
      {dropActive && (
        <div className="editor-drop-overlay" aria-hidden="true">
          <span>Drop to open</span>
        </div>
      )}
    </div>
  )
}
