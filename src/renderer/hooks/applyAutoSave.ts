/**
 * applyAutoSave - the single shared behaviour both auto-save controls route
 * through (the native File > Auto Save menu item and the Preferences checkbox),
 * so toggling from either place is identical.
 *
 * Steps (in order):
 *   1. Mirror the value into editorStore.autoSave (drives useAutoSave).
 *   2. Persist it via setSettings (-> main rebuilds the menu so the check mark
 *      stays in sync, regardless of which control toggled it).
 *   3. Immediate flush on ENABLE only: if the value just turned on AND the
 *      active doc is dirty AND it has a path, write it to disk right away via
 *      the provided save() (the existing fileOps.save). Disabling never saves;
 *      enabling a clean or path-less doc never saves.
 *
 * `save` is injected (rather than imported) because fileOps lives at App level;
 * this keeps the helper pure and testable.
 */
import { useEditorStore } from '@renderer/store/editorStore'

export function applyAutoSave(next: boolean, save: () => Promise<void>): void {
  useEditorStore.getState().setAutoSave(next)
  void window.lekha.setSettings({ autoSave: next })
  if (next) {
    const { isDirty, path } = useEditorStore.getState()
    if (isDirty && path !== null) void save()
  }
}
