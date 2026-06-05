/**
 * ProseMirror editor props for pasting and drag-dropping images.
 *
 * Both handlePaste and handleDrop follow the same async pattern:
 *   1. Detect image files in the clipboard / drag event.
 *   2. Snapshot the insertion position BEFORE the async IPC call.
 *   3. Read each file as an ArrayBuffer, call window.lekha.saveImage.
 *   4. After the save completes, check the view is still mounted.
 *   5. Dispatch a transaction inserting an `image` node at the snapshotted
 *      position (advancing it by the number of nodes already inserted so that
 *      multiple images land in order rather than on top of each other).
 *
 * Returning `true` from either handler tells ProseMirror the event was fully
 * consumed; returning `false` lets the default paste/drop logic run.
 */

import type { EditorView } from 'prosemirror-view'
import { schema } from './schema'
import { extFromMime } from '@shared/image'

// ---------------------------------------------------------------------------
// Minimal typed interfaces for clipboard / dataTransfer items.
// These narrow the browser globals we actually use, avoiding `any`.
// ---------------------------------------------------------------------------

interface ImageFile {
  /** MIME type, e.g. "image/png" */
  type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const IMAGE_MIME = /^image\//

/** Extract image files from a FileList (e.g. from drag-drop dataTransfer.files). */
function collectFromFileList(list: FileList | null | undefined): ImageFile[] {
  if (!list) return []
  const files: ImageFile[] = []
  for (let i = 0; i < list.length; i++) {
    const f = list.item(i) ?? list[i]
    if (f && IMAGE_MIME.test(f.type)) {
      files.push(f)
    }
  }
  return files
}

/** Extract image files from a DataTransferItemList (e.g. from clipboard paste). */
function collectFromDTItems(items: DataTransferItemList | null | undefined): ImageFile[] {
  if (!items) return []
  const files: ImageFile[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    if (item.kind === 'file' && IMAGE_MIME.test(item.type)) {
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  return files
}

/**
 * Insert an image node into the ProseMirror document at `pos`.
 * Guards against the view being destroyed between the async IPC call and this
 * point: if `view.isDestroyed`, the dispatch is skipped silently.
 */
function insertImageAt(view: EditorView, pos: number, src: string): void {
  if ((view as EditorView & { isDestroyed?: boolean }).isDestroyed) return

  const node = schema.nodes['image']?.create({ src, alt: '', title: null })
  if (!node) return

  // Clamp pos to the document's content size so a position that became stale
  // (e.g. user deleted content while image was uploading) does not crash.
  const safePos = Math.min(pos, view.state.doc.content.size)
  const tr = view.state.tr.insert(safePos, node)
  view.dispatch(tr)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ImageEditorProps {
  handlePaste: (view: EditorView, event: ClipboardEvent) => boolean
  handleDrop: (view: EditorView, event: DragEvent) => boolean
}

/**
 * Returns ProseMirror editor props that handle image paste and drag-drop.
 *
 * @param getDocPath  Supplier for the currently open document path (or null
 *   when the document has not been saved). Called at the moment an image is
 *   pasted/dropped so it always reflects the latest saved state.
 */
export function imageEditorProps(getDocPath: () => string | null): ImageEditorProps {
  // -------------------------------------------------------------------------
  // Paste handler
  // -------------------------------------------------------------------------
  function handlePaste(view: EditorView, event: ClipboardEvent): boolean {
    const items = collectFromDTItems(event.clipboardData?.items)
    if (items.length === 0) return false

    // Prevent default paste from also inserting the image as HTML/text.
    event.preventDefault()

    // Snapshot insertion position BEFORE the async operations.
    const insertPos = view.state.selection.from

    void processImages(view, items, insertPos)
    return true
  }

  // -------------------------------------------------------------------------
  // Drop handler
  // -------------------------------------------------------------------------
  function handleDrop(view: EditorView, event: DragEvent): boolean {
    const items = collectFromFileList(event.dataTransfer?.files)
    if (items.length === 0) return false

    event.preventDefault()

    // Resolve the doc position under the pointer.
    const coords = { left: event.clientX, top: event.clientY }
    const resolved = view.posAtCoords(coords)
    const insertPos = resolved ? resolved.pos : view.state.selection.from

    void processImages(view, items, insertPos)
    return true
  }

  // -------------------------------------------------------------------------
  // Shared async processing
  // -------------------------------------------------------------------------
  async function processImages(
    view: EditorView,
    files: ImageFile[],
    startPos: number,
  ): Promise<void> {
    // Track how many nodes have already been inserted so each successive image
    // lands after the previous one rather than overwriting it.
    let offset = 0
    const docPath = getDocPath()

    for (const file of files) {
      const data = await file.arrayBuffer()
      const ext = extFromMime(file.type)

      const { insertPath } = await window.lekha.saveImage({ data, ext, docPath })

      // Each image node occupies exactly 1 position in the ProseMirror doc.
      insertImageAt(view, startPos + offset, insertPath)
      offset += 1
    }
  }

  return { handlePaste, handleDrop }
}
