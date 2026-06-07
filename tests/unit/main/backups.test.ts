// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { BackupRecord } from '@shared/types'
import { writeBackup, deleteBackup, listBackups, isSafeBackupId } from '@main/backups'

let root: string
/** The backups dir we hand to the functions - intentionally not pre-created so
 *  we can assert writeBackup creates it on first write. */
let dir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lekha-backups-'))
  dir = join(root, 'backups')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Build a BackupRecord with sensible defaults; override fields per test. */
function makeRecord(overrides: Partial<BackupRecord> = {}): BackupRecord {
  return {
    backupId: 'abc-123',
    path: '/docs/note.md',
    title: 'note.md',
    content: '# Hello\n\nUnsaved work.',
    eol: 'lf',
    savedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('isSafeBackupId', () => {
  it('accepts a plain id', () => {
    expect(isSafeBackupId('abc-123')).toBe(true)
  })

  it('rejects empty / whitespace ids', () => {
    expect(isSafeBackupId('')).toBe(false)
    expect(isSafeBackupId('   ')).toBe(false)
  })

  it('rejects path separators and traversal', () => {
    expect(isSafeBackupId('../evil')).toBe(false)
    expect(isSafeBackupId('a/b')).toBe(false)
    expect(isSafeBackupId('a\\b')).toBe(false)
    expect(isSafeBackupId('.')).toBe(false)
    expect(isSafeBackupId('..')).toBe(false)
  })
})

describe('writeBackup + listBackups round-trip', () => {
  it('writes a record and reads it back unchanged', async () => {
    const record = makeRecord()
    await writeBackup(dir, record)

    const list = await listBackups(dir)
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual(record)
  })

  it('creates the backups dir on first write', async () => {
    expect(existsSync(dir)).toBe(false)
    await writeBackup(dir, makeRecord())
    expect(existsSync(dir)).toBe(true)
  })

  it('writes a path-less (Untitled) record', async () => {
    const record = makeRecord({ backupId: 'untitled-1', path: null, title: 'Untitled' })
    await writeBackup(dir, record)
    const list = await listBackups(dir)
    expect(list).toHaveLength(1)
    expect(list[0]?.path).toBeNull()
  })

  it('leaves no .tmp file behind (atomic write)', async () => {
    await writeBackup(dir, makeRecord())
    const names = readdirSync(dir)
    expect(names.some((n) => n.endsWith('.tmp'))).toBe(false)
  })
})

describe('deleteBackup', () => {
  it('removes a written backup', async () => {
    const record = makeRecord()
    await writeBackup(dir, record)
    expect(await listBackups(dir)).toHaveLength(1)

    await deleteBackup(dir, record.backupId)
    expect(await listBackups(dir)).toHaveLength(0)
  })

  it('is idempotent - deleting a missing backup does not throw (ENOENT)', async () => {
    mkdirSync(dir, { recursive: true })
    await expect(deleteBackup(dir, 'does-not-exist')).resolves.toBeUndefined()
  })
})

describe('listBackups - best-effort parsing', () => {
  it('returns an empty list when the dir does not exist', async () => {
    expect(await listBackups(dir)).toEqual([])
  })

  it('skips a corrupt .json file but returns the valid ones', async () => {
    const good = makeRecord({ backupId: 'good' })
    await writeBackup(dir, good)
    // Plant a corrupt JSON file alongside the valid backup.
    writeFileSync(join(dir, 'corrupt.json'), '{ not valid json', 'utf8')

    const list = await listBackups(dir)
    expect(list).toHaveLength(1)
    expect(list[0]?.backupId).toBe('good')
  })

  it('skips a structurally-invalid record (valid JSON, wrong shape)', async () => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ foo: 'bar' }), 'utf8')
    expect(await listBackups(dir)).toEqual([])
  })

  it('ignores non-json files in the directory', async () => {
    await writeBackup(dir, makeRecord({ backupId: 'keep' }))
    writeFileSync(join(dir, 'note.txt'), 'ignore me', 'utf8')
    const list = await listBackups(dir)
    expect(list).toHaveLength(1)
    expect(list[0]?.backupId).toBe('keep')
  })

  it('sweeps abandoned .tmp files left by an interrupted atomic write', async () => {
    await writeBackup(dir, makeRecord({ backupId: 'keep' }))
    // Simulate a crashed atomic write that left a uniquely-named tmp behind.
    writeFileSync(join(dir, 'keep.json.deadbeef.tmp'), 'partial', 'utf8')

    const list = await listBackups(dir)
    expect(list.map((r) => r.backupId)).toEqual(['keep'])
    // The orphan tmp is reaped, not left to accumulate.
    expect(existsSync(join(dir, 'keep.json.deadbeef.tmp'))).toBe(false)
  })
})

describe('writeBackup - concurrent writes to the same id', () => {
  it('does not throw ENOENT when the same backup is written concurrently', async () => {
    // Reproduces the reported crash: the idle-debounce, blur flush, and tab-
    // switch snapshot could all call writeBackup for one tab (same id) at once.
    // With a fixed tmp name the renames raced; a unique tmp per write fixes it.
    const writes = Array.from({ length: 10 }, (_v, i) =>
      writeBackup(dir, makeRecord({ backupId: 'same-id', content: `v${i}` })),
    )
    await expect(Promise.all(writes)).resolves.toBeDefined()

    const list = await listBackups(dir)
    expect(list).toHaveLength(1)
    expect(list[0]?.backupId).toBe('same-id')
    expect(/^v\d+$/.test(list[0]?.content ?? '')).toBe(true)
  })
})

describe('unsafe backupId rejection', () => {
  it('writeBackup rejects an unsafe id', async () => {
    await expect(
      writeBackup(dir, makeRecord({ backupId: '../escape' })),
    ).rejects.toThrow(/Invalid backup id/)
  })

  it('deleteBackup rejects an unsafe id', async () => {
    await expect(deleteBackup(dir, '../escape')).rejects.toThrow(/Invalid backup id/)
  })
})
