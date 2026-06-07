/**
 * backups.ts - crash-recovery backup store (main process).
 *
 * Writes unsaved document buffers to a backups directory in app data (never the
 * user's real file) so unsaved work survives an app/OS crash. The separation is
 * what makes recovery safe: a backup can never cause a silent overwrite of the
 * real file.
 *
 * Kept pure/testable: every function takes the backups-dir path as an argument
 * rather than calling app.getPath at module load. The IPC handler in
 * src/main/ipc/files.ts resolves the dir and stamps `savedAt` (Date.now())
 * before calling writeBackup, so this module has no clock or Electron coupling.
 *
 * Path safety: a backupId is used to build a filename (`<backupId>.json`), so it
 * is validated by isSafeBackupId before any path is constructed - rejecting path
 * separators and traversal, mirroring the path-safety posture in fileOps.ts.
 */
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { BackupRecord } from '@shared/types'
import { writeFileAtomic } from '@main/fs-helpers'

/**
 * Validates a backupId used as the stem of a `<backupId>.json` filename.
 *
 * Rejects:
 *   - empty / whitespace-only ids
 *   - ids containing a path separator ("/" or "\") - would target another dir
 *   - "." and ".." - current/parent-dir traversal that escapes the backups dir
 *
 * This is the single chokepoint that prevents path-traversal: writeBackup and
 * deleteBackup both build their path from an id that passed this check, so the
 * result can never escape the backups directory.
 */
export function isSafeBackupId(backupId: string): boolean {
  if (backupId.trim().length === 0) return false
  if (backupId.includes('/') || backupId.includes('\\')) return false
  if (backupId === '.' || backupId === '..') return false
  return true
}

/** Absolute path of the backup file for `backupId` inside `dir`. */
function backupPath(dir: string, backupId: string): string {
  return join(dir, `${backupId}.json`)
}

/**
 * Write a backup record to `<dir>/<record.backupId>.json`. Ensures the backups
 * directory exists, then writes atomically (tmp + rename) so a crash mid-write
 * can never leave a corrupt backup file.
 *
 * `savedAt` is expected to be stamped by the caller (the IPC handler) before
 * this call so the module stays clock-free and testable.
 */
export async function writeBackup(dir: string, record: BackupRecord): Promise<void> {
  if (!isSafeBackupId(record.backupId)) {
    throw new Error(`Invalid backup id: "${record.backupId}"`)
  }
  await mkdir(dir, { recursive: true })
  await writeFileAtomic(backupPath(dir, record.backupId), JSON.stringify(record))
}

/**
 * Delete the backup file for `backupId`. Ignores ENOENT (already gone) so
 * clearing a backup is idempotent.
 */
export async function deleteBackup(dir: string, backupId: string): Promise<void> {
  if (!isSafeBackupId(backupId)) {
    throw new Error(`Invalid backup id: "${backupId}"`)
  }
  try {
    await unlink(backupPath(dir, backupId))
  } catch (err) {
    // ENOENT: the backup is already gone - treat clearing as idempotent.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
}

/**
 * List every valid backup record in `dir`. Best-effort: a missing directory
 * yields an empty list, and any unreadable / unparseable / structurally invalid
 * `.json` file is skipped rather than throwing, so one corrupt backup can never
 * block recovery of the rest.
 */
export async function listBackups(dir: string): Promise<BackupRecord[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    // No backups directory yet (or unreadable) - nothing to recover.
    return []
  }

  const records: BackupRecord[] = []
  for (const name of names) {
    // Sweep abandoned atomic-write temp files (a write that crashed between
    // writeFile and rename leaves a uniquely-named "*.tmp"). Best-effort.
    if (name.endsWith('.tmp')) {
      try {
        await unlink(join(dir, name))
      } catch {
        // Best-effort: ignore - a leftover tmp is harmless and ignored anyway.
      }
      continue
    }
    if (!name.endsWith('.json')) continue
    try {
      const raw = await readFile(join(dir, name), 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (isBackupRecord(parsed)) records.push(parsed)
    } catch {
      // Unreadable or corrupt backup file - skip it (best-effort recovery).
    }
  }
  return records
}

/** Structural guard for a value to ensure it is a BackupRecord. Used both when
 *  parsing backup files (listBackups) and when validating the renderer-supplied
 *  payload at the backupWrite IPC boundary. */
export function isBackupRecord(value: unknown): value is BackupRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r['backupId'] === 'string' &&
    (typeof r['path'] === 'string' || r['path'] === null) &&
    typeof r['title'] === 'string' &&
    typeof r['content'] === 'string' &&
    typeof r['eol'] === 'string' &&
    typeof r['savedAt'] === 'number'
  )
}
