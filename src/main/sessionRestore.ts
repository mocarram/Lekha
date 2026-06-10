/**
 * sessionRestore.ts - one-shot claim for restoring the persisted session.
 *
 * Startup restore (re-opening the previous tabs + crash-backup recovery) runs
 * in the RENDERER, so every new window would otherwise replay it: "New
 * Window" duplicated the whole session instead of opening blank, and crash
 * backups could be recovered into multiple windows. Main hands the restore to
 * exactly ONE window per app run - the first renderer to ask (the launch
 * window); every later window starts with a blank Untitled.
 */

let claimed = false

/** True exactly once per app run: the caller owns the session restore. */
export function claimSessionRestore(): boolean {
  if (claimed) return false
  claimed = true
  return true
}

/** Test-only: reset the claim so unit tests stay independent. */
export function _resetSessionRestore(): void {
  claimed = false
}
