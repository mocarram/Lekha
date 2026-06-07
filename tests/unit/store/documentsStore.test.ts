/**
 * Unit tests for documentsStore - the multi-tab open-documents collection.
 *
 * State is reset in beforeEach (which also resets the id counter) so tab ids
 * are deterministic (`doc-1`, `doc-2`, ...) within each test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useDocumentsStore,
  pickNeighbourId,
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
