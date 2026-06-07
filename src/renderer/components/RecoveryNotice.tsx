/**
 * RecoveryNotice - inline banner shown when the ACTIVE tab was restored from a
 * crash backup (its `recovered` flag is true). Mirrors the .external-notice
 * banner's structure.
 *
 *   - Save  -> persists via the provided onSave (fileOps.save; Save As when the
 *              doc is Untitled). A successful save clears the backup + recovered
 *              flag (in useFileOps.persist), which hides this banner.
 *   - × (dismiss) -> clears ONLY the recovered flag on the active tab. The
 *              recovered content stays (still dirty) and the backup file remains
 *              until the doc is saved or discarded. Dismiss is NOT discard.
 *
 * Visibility is driven by the documentsStore: the banner renders only while the
 * active tab is recovered.
 */
import { useDocumentsStore } from '@renderer/store/documentsStore'

export interface RecoveryNoticeProps {
  /** Persist the recovered document (fileOps.save; Save As if Untitled). */
  onSave: () => void
}

export function RecoveryNotice({ onSave }: RecoveryNoticeProps) {
  const activeRecovered = useDocumentsStore((s) => {
    const active = s.documents.find((d) => d.id === s.activeId)
    return active?.recovered ?? false
  })

  if (!activeRecovered) return null

  return (
    <div className="recovered-notice" role="status">
      <span className="recovered-notice__text">
        Recovered unsaved changes - review and Save.
      </span>
      <button
        type="button"
        className="recovered-notice__save no-drag"
        onClick={onSave}
      >
        Save
      </button>
      <button
        type="button"
        className="recovered-notice__dismiss no-drag"
        aria-label="Dismiss"
        onClick={() => useDocumentsStore.getState().updateActive({ recovered: false })}
      >
        ×
      </button>
    </div>
  )
}
