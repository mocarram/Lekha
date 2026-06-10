/**
 * useAutoSave - automatically saves the document after a short debounce.
 *
 * Behaviour:
 *   - When `enabled`, `isDirty`, AND `hasPath`: schedules save() ~1500ms after
 *     the last change. Each new call while the timer is pending resets the
 *     clock (classic debounce).
 *   - Also flushes an immediate save on window `blur` (same guards apply).
 *   - Cleans up timer + listener on unmount so there are no leaks or
 *     post-unmount saves.
 *
 * Guard: if `hasPath` is false (new/untitled document), we do nothing.
 * App passes fileOps.saveQuiet as `save`, which is itself a no-op for clean or
 * path-less documents and never opens a dialog, so multiple rapid calls are
 * harmless and auto-save can never block typing with a modal.
 */
import { useEffect, useRef } from 'react'

/** How long (ms) to wait after the last dirty change before auto-saving. */
const AUTOSAVE_DEBOUNCE_MS = 1500

export interface AutoSaveOptions {
  /** Whether auto-save is globally enabled. */
  enabled: boolean
  /** Whether the document currently has unsaved changes. */
  isDirty: boolean
  /** Whether the document has a saved file path (false for new/untitled docs). */
  hasPath: boolean
  /** The save function to call - reuses useFileOps.save(). */
  save: () => void | Promise<void>
}

export function useAutoSave({ enabled, isDirty, hasPath, save }: AutoSaveOptions): void {
  // Keep a stable ref to save() so the effect does not re-run when save
  // identity changes across renders (useCallback in useFileOps can still
  // produce a new reference when its own deps change).
  const saveRef = useRef(save)

  // Sync the ref in an effect (not during render) to satisfy the
  // react-hooks/refs lint rule. The effect runs synchronously after every
  // render where `save` has changed, before any pending timer fires.
  useEffect(() => {
    saveRef.current = save
  })

  // Debounce timer: reset whenever the dirty/enabled/hasPath inputs change.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ----- Debounced auto-save on dirty change --------------------------------

  useEffect(() => {
    // Clear any previously scheduled save when inputs change.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Guard: only schedule when all three conditions are met.
    if (!enabled || !isDirty || !hasPath) return

    // Schedule the save after the debounce interval. The ref ensures we always
    // call the latest save() even if the function identity changed.
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void saveRef.current()
    }, AUTOSAVE_DEBOUNCE_MS)

    // Cleanup: cancel the pending save when the component unmounts or inputs
    // change before the timer fires.
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, isDirty, hasPath])

  // ----- Flush save on window blur ------------------------------------------

  useEffect(() => {
    const handleBlur = (): void => {
      // No-path guard: never auto-save untitled documents.
      if (!enabled || !isDirty || !hasPath) return

      // Cancel any pending debounced save and flush immediately.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      void saveRef.current()
    }

    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [enabled, isDirty, hasPath])
}
