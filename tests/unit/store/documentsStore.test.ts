/**
 * Unit tests for documentsStore - the multi-tab open-documents collection.
 *
 * State is reset in beforeEach (which also resets the id counter) so tab ids
 * are deterministic (`doc-1`, `doc-2`, ...) within each test.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  useDocumentsStore,
  pickNeighbourId,
  nextTabId,
  type DocumentTab,
} from '../../../src/renderer/store/documentsStore'

const store = () => useDocumentsStore.getState()

beforeEach(() => {
  store().reset()
})

describe('documentsStore - initial state', () => {
  it('starts empty with no active tab', () => {
    expect(store().documents).toEqual([])
    expect(store().activeId).toBeNull()
    expect(store().activeDocument()).toBeNull()
  })
})

describe('documentsStore - openDocument', () => {
  it('opens a file as a new active tab and derives the title', () => {
    const id = store().openDocument({ path: '/notes/hello.md', markdown: '# Hi' })
    expect(id).toBe('doc-1')
    expect(store().documents).toHaveLength(1)
    const doc = store().activeDocument()!
    expect(doc.id).toBe('doc-1')
    expect(doc.path).toBe('/notes/hello.md')
    expect(doc.title).toBe('hello.md')
    expect(doc.markdown).toBe('# Hi')
    expect(doc.isDirty).toBe(false)
    expect(doc.mode).toBe('wysiwyg')
    expect(doc.backupId).toBeNull()
    expect(doc.recovered).toBe(false)
    expect(store().activeId).toBe('doc-1')
  })

  it('detects CRLF line endings on open', () => {
    store().openDocument({ path: '/win.md', markdown: 'a\r\nb' })
    expect(store().activeDocument()!.eol).toBe('crlf')
  })

  it('re-activates an already-open file instead of duplicating it', () => {
    const first = store().openDocument({ path: '/a.md', markdown: 'A' })
    store().openDocument({ path: '/b.md', markdown: 'B' })
    expect(store().documents).toHaveLength(2)
    const again = store().openDocument({ path: '/a.md', markdown: 'A changed' })
    expect(again).toBe(first)
    expect(store().documents).toHaveLength(2)
    expect(store().activeId).toBe(first)
    // Existing snapshot is preserved (not clobbered by the re-open markdown).
    expect(store().activeDocument()!.markdown).toBe('A')
  })

  it('treats each null-path (Untitled) open as a distinct tab', () => {
    store().openDocument({ path: null, markdown: '' })
    store().openDocument({ path: null, markdown: '' })
    expect(store().documents).toHaveLength(2)
  })
})

describe('documentsStore - newDocument', () => {
  it('creates a blank Untitled active tab', () => {
    const id = store().newDocument()
    const doc = store().activeDocument()!
    expect(doc.id).toBe(id)
    expect(doc.path).toBeNull()
    expect(doc.title).toBe('Untitled')
    expect(doc.markdown).toBe('')
    expect(doc.isDirty).toBe(false)
    expect(doc.eol).toBe('lf')
    expect(doc.backupId).toBeNull()
    expect(doc.recovered).toBe(false)
  })
})

describe('documentsStore - activateDocument', () => {
  it('switches the active tab', () => {
    const a = store().openDocument({ path: '/a.md', markdown: 'A' })
    const b = store().openDocument({ path: '/b.md', markdown: 'B' })
    expect(store().activeId).toBe(b)
    store().activateDocument(a)
    expect(store().activeId).toBe(a)
  })

  it('ignores an unknown id', () => {
    const a = store().openDocument({ path: '/a.md', markdown: 'A' })
    store().activateDocument('nope')
    expect(store().activeId).toBe(a)
  })
})

describe('documentsStore - updateActive', () => {
  it('patches the active tab in place', () => {
    store().openDocument({ path: '/a.md', markdown: 'A' })
    store().updateActive({ markdown: 'A!', isDirty: true })
    const doc = store().activeDocument()!
    expect(doc.markdown).toBe('A!')
    expect(doc.isDirty).toBe(true)
  })

  it('re-deriving title/path together updates a saved-as tab', () => {
    store().newDocument()
    store().updateActive({ path: '/saved.md', title: 'saved.md', isDirty: false })
    const doc = store().activeDocument()!
    expect(doc.path).toBe('/saved.md')
    expect(doc.title).toBe('saved.md')
  })

  it('is a no-op when there is no active tab', () => {
    store().updateActive({ markdown: 'x' })
    expect(store().documents).toEqual([])
  })
})

describe('documentsStore - ensureBackupId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('assigns a fresh uuid to a tab that lacks a backupId and returns it', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('uuid-1' as `${string}-${string}-${string}-${string}-${string}`)
    const id = store().openDocument({ path: '/a.md', markdown: 'A' })
    expect(store().activeDocument()!.backupId).toBeNull()
    const backupId = store().ensureBackupId(id)
    expect(backupId).toBe('uuid-1')
    expect(store().activeDocument()!.backupId).toBe('uuid-1')
  })

  it('returns the existing backupId without re-generating one', () => {
    const spy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('uuid-1' as `${string}-${string}-${string}-${string}-${string}`)
    const id = store().openDocument({ path: '/a.md', markdown: 'A' })
    const first = store().ensureBackupId(id)
    const second = store().ensureBackupId(id)
    expect(first).toBe('uuid-1')
    expect(second).toBe('uuid-1')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('returns null for an unknown id', () => {
    expect(store().ensureBackupId('nope')).toBeNull()
  })
})

describe('documentsStore - updatePath', () => {
  it('rewrites an exact-match tab path + title (any tab, not just active)', () => {
    const a = store().openDocument({ path: '/dir/a.md', markdown: 'A' })
    store().openDocument({ path: '/dir/b.md', markdown: 'B' }) // active = b
    store().updatePath('/dir/a.md', '/dir/renamed.md')
    const tabA = store().documents.find((d) => d.id === a)!
    expect(tabA.path).toBe('/dir/renamed.md')
    expect(tabA.title).toBe('renamed.md')
  })

  it('rewrites tabs under a renamed/moved containing folder (prefix match)', () => {
    store().openDocument({ path: '/proj/notes/x.md', markdown: 'X' })
    store().updatePath('/proj/notes', '/proj/archive')
    expect(store().documents[0]!.path).toBe('/proj/archive/x.md')
    expect(store().documents[0]!.title).toBe('x.md')
  })

  it('leaves non-matching tabs untouched', () => {
    store().openDocument({ path: '/dir/a.md', markdown: 'A' })
    store().updatePath('/other/z.md', '/other/zz.md')
    expect(store().documents[0]!.path).toBe('/dir/a.md')
  })
})

describe('documentsStore - closeDocument', () => {
  it('removes a tab and activates the left neighbour', () => {
    const a = store().openDocument({ path: '/a.md', markdown: 'A' })
    const b = store().openDocument({ path: '/b.md', markdown: 'B' })
    const c = store().openDocument({ path: '/c.md', markdown: 'C' })
    expect(store().activeId).toBe(c)
    store().closeDocument(c)
    expect(store().documents.map((d) => d.id)).toEqual([a, b])
    expect(store().activeId).toBe(b) // left neighbour
  })

  it('activates the right neighbour when closing the first (leftmost) tab', () => {
    const a = store().openDocument({ path: '/a.md', markdown: 'A' })
    const b = store().openDocument({ path: '/b.md', markdown: 'B' })
    store().activateDocument(a)
    store().closeDocument(a)
    expect(store().documents.map((d) => d.id)).toEqual([b])
    expect(store().activeId).toBe(b)
  })

  it('keeps the active tab when closing a different, inactive tab', () => {
    const a = store().openDocument({ path: '/a.md', markdown: 'A' })
    const b = store().openDocument({ path: '/b.md', markdown: 'B' })
    store().activateDocument(a)
    store().closeDocument(b)
    expect(store().activeId).toBe(a)
  })

  it('sets activeId to null when the last tab is closed', () => {
    const a = store().openDocument({ path: '/a.md', markdown: 'A' })
    store().closeDocument(a)
    expect(store().documents).toEqual([])
    expect(store().activeId).toBeNull()
  })

  it('is a no-op for an unknown id', () => {
    const a = store().openDocument({ path: '/a.md', markdown: 'A' })
    store().closeDocument('nope')
    expect(store().documents).toHaveLength(1)
    expect(store().activeId).toBe(a)
  })
})

describe('pickNeighbourId (pure)', () => {
  const mk = (id: string): DocumentTab => ({
    id,
    path: `/${id}.md`,
    title: `${id}.md`,
    markdown: '',
    isDirty: false,
    eol: 'lf',
    mode: 'wysiwyg',
    inode: null,
    backupId: null,
    recovered: false,
  })

  it('returns the left neighbour for a middle tab', () => {
    const docs = [mk('a'), mk('b'), mk('c')]
    expect(pickNeighbourId(docs, 'b')).toBe('a')
  })

  it('returns the right neighbour when closing the first tab', () => {
    const docs = [mk('a'), mk('b'), mk('c')]
    expect(pickNeighbourId(docs, 'a')).toBe('b')
  })

  it('returns null when closing the only tab', () => {
    expect(pickNeighbourId([mk('a')], 'a')).toBeNull()
  })
})

describe('nextTabId (pure)', () => {
  const mk = (id: string): DocumentTab => ({
    id,
    path: `/${id}.md`,
    title: `${id}.md`,
    markdown: '',
    isDirty: false,
    eol: 'lf',
    mode: 'wysiwyg',
    inode: null,
    backupId: null,
    recovered: false,
  })

  it('cycles forward (+1) to the right neighbour', () => {
    const docs = [mk('a'), mk('b'), mk('c')]
    expect(nextTabId(docs, 'a', 1)).toBe('b')
    expect(nextTabId(docs, 'b', 1)).toBe('c')
  })

  it('wraps forward from the last tab to the first', () => {
    const docs = [mk('a'), mk('b'), mk('c')]
    expect(nextTabId(docs, 'c', 1)).toBe('a')
  })

  it('cycles backward (-1) and wraps from the first to the last', () => {
    const docs = [mk('a'), mk('b'), mk('c')]
    expect(nextTabId(docs, 'b', -1)).toBe('a')
    expect(nextTabId(docs, 'a', -1)).toBe('c')
  })

  it('returns the same id when there is a single tab', () => {
    expect(nextTabId([mk('a')], 'a', 1)).toBe('a')
    expect(nextTabId([mk('a')], 'a', -1)).toBe('a')
  })

  it('returns null when there are no tabs', () => {
    expect(nextTabId([], null, 1)).toBeNull()
  })

  it('falls back to first/last when activeId is unknown', () => {
    const docs = [mk('a'), mk('b')]
    expect(nextTabId(docs, 'zzz', 1)).toBe('a')
    expect(nextTabId(docs, 'zzz', -1)).toBe('b')
  })
})

describe('documentsStore - moveDocument (drag-to-reorder)', () => {
  it('moves a tab to the target index, keeping the active id', () => {
    const s = useDocumentsStore.getState()
    const a = s.openDocument({ path: '/a.md', markdown: '' })
    const b = s.openDocument({ path: '/b.md', markdown: '' })
    const c = s.openDocument({ path: '/c.md', markdown: '' })
    useDocumentsStore.getState().activateDocument(b)

    useDocumentsStore.getState().moveDocument(a, 2)
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual([
      '/b.md', '/c.md', '/a.md',
    ])
    expect(useDocumentsStore.getState().activeId).toBe(b)

    useDocumentsStore.getState().moveDocument(c, 0)
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual([
      '/c.md', '/b.md', '/a.md',
    ])
  })

  it('clamps out-of-range targets and ignores unknown ids / same-slot moves', () => {
    const s = useDocumentsStore.getState()
    const a = s.openDocument({ path: '/a.md', markdown: '' })
    s.openDocument({ path: '/b.md', markdown: '' })

    useDocumentsStore.getState().moveDocument(a, 99)
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual([
      '/b.md', '/a.md',
    ])
    useDocumentsStore.getState().moveDocument(a, -5)
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual([
      '/a.md', '/b.md',
    ])
    const before = useDocumentsStore.getState().documents
    useDocumentsStore.getState().moveDocument('nope', 0)
    useDocumentsStore.getState().moveDocument(a, 0) // already there
    expect(useDocumentsStore.getState().documents).toBe(before)
  })
})
