import { useEditorStore } from '@renderer/store/editorStore'

/**
 * TitleBar renders at the top of the app window.
 *
 * The bar itself is draggable (webkit-app-region: drag) so the user can
 * move the window by grabbing anywhere in the title area. The OS draws the
 * traffic-light buttons into the left gutter via titleBarStyle:'hiddenInset'.
 *
 * A dirty indicator dot (•) appears next to the title when isDirty is true.
 * Interactive children must carry no-drag so clicks are not swallowed by the
 * drag region (none currently — the title is not interactive).
 */
export function TitleBar() {
  const title = useEditorStore((s) => s.title)
  const isDirty = useEditorStore((s) => s.isDirty)

  return (
    <div className="title-bar">
      {/* Left spacer reserves room for macOS traffic-light buttons */}
      <div className="title-bar__gutter" />

      <div className="title-bar__title">
        {isDirty && <span className="title-bar__dirty">•</span>}
        {title}
      </div>

      {/* Right spacer balances the layout symmetrically */}
      <div className="title-bar__gutter" />
    </div>
  )
}
