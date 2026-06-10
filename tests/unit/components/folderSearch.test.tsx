/**
 * Unit tests for the FolderSearch sidebar component.
 *
 * window.lekha is stubbed via vi.stubGlobal. Fake timers advance the debounce.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { FolderSearch } from '../../../src/renderer/components/FolderSearch'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import type { LekhaAPI } from '../../../src/preload/api'
import type { FolderSearchResult } from '../../../src/shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal LekhaAPI mock - only searchFolder is needed for FolderSearch. */
function makeMockLekha(
  searchFolder: (args: {
    root: string
    query: string
    caseSensitive: boolean
    wholeWord: boolean
  }) => Promise<FolderSearchResult[]> = () => Promise.resolve([]),
): LekhaAPI {
  const unsubscribe = () => undefined
  return {
    openFileDialog: vi.fn(() => Promise.resolve(null)),
    openFolderDialog: vi.fn(() => Promise.resolve(null)),
    saveAsDialog: vi.fn(() => Promise.resolve(null)),
    confirmUnsaved: vi.fn(() => Promise.resolve('cancel' as const)),
    confirmReplace: vi.fn(() => Promise.resolve(false)),
    readFile: vi.fn(() => Promise.resolve('')),
    statFile: vi.fn(() => Promise.resolve({ sizeBytes: 0, birthtimeMs: 0, mtimeMs: 0, inode: 0 })),
    getPathForFile: vi.fn(() => ''),
    verifyOpenFile: vi.fn(() => Promise.resolve({ status: 'present' as const })),
    writeFile: vi.fn(() => Promise.resolve()),
    readDir: vi.fn(() => Promise.resolve([])),
    listArticles: vi.fn(() => Promise.resolve([])),
    createFile: vi.fn(() => Promise.resolve('')),
    createFolder: vi.fn(() => Promise.resolve('')),
    renamePath: vi.fn(() => Promise.resolve('')),
    duplicatePath: vi.fn(() => Promise.resolve('')),
    movePath: vi.fn(() => Promise.resolve('')),
    deletePath: vi.fn(() => Promise.resolve()),
    revealPath: vi.fn(() => Promise.resolve()),
    getSettings: vi.fn(() => Promise.resolve({
      recentFiles: [], lastFolder: null, sidebarVisible: true,
      sidebarTab: 'files' as const, theme: 'github', focusMode: false,
      typewriterMode: false, equationNumbering: true, fontSize: 16, autoSave: true,
      spellCheck: true, spellCheckLanguage: 'en-US', smartPunctuation: true, sidebarWidth: 240, openTabPaths: [], activeTabPath: null,
    })),
    setSettings: vi.fn(() => Promise.resolve({
      recentFiles: [], lastFolder: null, sidebarVisible: true,
      sidebarTab: 'files' as const, theme: 'github', focusMode: false,
      typewriterMode: false, equationNumbering: true, fontSize: 16, autoSave: true,
      spellCheck: true, spellCheckLanguage: 'en-US', smartPunctuation: true, sidebarWidth: 240, openTabPaths: [], activeTabPath: null,
    })),
    getRecentFiles: vi.fn(() => Promise.resolve([])),
    addRecentFile: vi.fn(() => Promise.resolve()),
    setDocumentState: vi.fn(),
    setWindowDirty: vi.fn(),
    newWindow: vi.fn(),
    print: vi.fn(),
    share: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    onCommand: vi.fn(() => unsubscribe),
    onOpenPath: vi.fn(() => unsubscribe),
    takePendingOpen: vi.fn(() => Promise.resolve([])),
    shouldRestoreSession: vi.fn(() => Promise.resolve(true)),
    onSetTheme: vi.fn(() => unsubscribe),
    onSetAutoSave: vi.fn(() => unsubscribe),
    writeBackup: vi.fn(() => Promise.resolve()),
    deleteBackup: vi.fn(() => Promise.resolve()),
    listBackups: vi.fn(() => Promise.resolve([])),
    exportHtml: vi.fn(() => Promise.resolve()),
    exportPdf: vi.fn(() => Promise.resolve()),
    exportPandoc: vi.fn(() => Promise.resolve()),
    pandocAvailable: vi.fn(() => Promise.resolve(false)),
    saveImage: vi.fn(() => Promise.resolve({ insertPath: 'assets/img.png' })),
    openExternal: vi.fn(() => Promise.resolve()),
    writeClipboard: vi.fn(() => Promise.resolve()),
    readClipboardText: vi.fn(() => Promise.resolve('')),
    searchFolder: vi.fn(searchFolder),
    replaceInFolder: vi.fn(() => Promise.resolve({ filesChanged: 0, replacements: 0, changedPaths: [] })),
    listTemplates: vi.fn(() => Promise.resolve([])),
    listThemes: vi.fn(() => Promise.resolve([])),
    reloadThemes: vi.fn(() => Promise.resolve([])),
    openThemeFolder: vi.fn(() => Promise.resolve()),
  }
}

const SAMPLE_RESULTS: FolderSearchResult[] = [
  {
    filePath: '/docs/notes.md',
    fileName: 'notes.md',
    matches: [
      { lineNumber: 2, lineText: 'hello world' },
      { lineNumber: 5, lineText: 'hello again' },
    ],
  },
  {
    filePath: '/docs/sub/deep.md',
    fileName: 'deep.md',
    matches: [
      { lineNumber: 1, lineText: 'hello deep' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  // Query + case flag now live in the workspace store; reset so a typed query
  // from one test doesn't bleed into the next (the panel reads it on mount).
  useWorkspaceStore.setState({ searchQuery: '', searchCaseSensitive: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
  useWorkspaceStore.setState({ searchQuery: '', searchCaseSensitive: false })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FolderSearch', () => {
  it('renders a search input', () => {
    vi.stubGlobal('lekha', makeMockLekha())
    render(<FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('shows "No folder open" empty state when rootFolder is null', () => {
    vi.stubGlobal('lekha', makeMockLekha())
    const { container } = render(
      <FolderSearch rootFolder={null} onOpenResult={vi.fn()} onReplaced={vi.fn()} />,
    )
    expect(container.textContent).toContain('No folder open')
  })

  it('does NOT show "No folder open" when a folder is set', () => {
    vi.stubGlobal('lekha', makeMockLekha())
    const { container } = render(
      <FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />,
    )
    expect(container.textContent).not.toContain('No folder open')
  })

  it('calls searchFolder with the typed query and root after debounce', async () => {
    const searchFolder = vi.fn(() => Promise.resolve([]))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    render(<FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />)
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'hello' } })

    // Before debounce fires, searchFolder should NOT have been called.
    expect(searchFolder).not.toHaveBeenCalled()

    // Advance 250ms to fire the debounce.
    await act(async () => {
      vi.advanceTimersByTime(250)
      // Let the promise settle.
      await Promise.resolve()
    })

    expect(searchFolder).toHaveBeenCalledOnce()
    expect(searchFolder).toHaveBeenCalledWith({
      root: '/docs',
      query: 'hello',
      caseSensitive: false,
      wholeWord: false,
    })
  })

  it('calls searchFolder with caseSensitive=true when the Aa button is toggled', async () => {
    const searchFolder = vi.fn(() => Promise.resolve([]))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    render(<FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />)

    // Toggle case-sensitive on (button has aria-label "Match case").
    const caseBtn = screen.getByRole('button', { name: 'Match case' })
    fireEvent.click(caseBtn)

    // Type a query.
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Hello' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(searchFolder).toHaveBeenCalledWith({
      root: '/docs',
      query: 'Hello',
      caseSensitive: true,
      wholeWord: false,
    })
  })

  it('renders grouped results from a mocked response', async () => {
    const searchFolder = vi.fn(() => Promise.resolve(SAMPLE_RESULTS))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    const { container } = render(
      <FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />,
    )
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    // File headers should appear.
    expect(container.textContent).toContain('notes.md')
    expect(container.textContent).toContain('deep.md')

    // Match line texts should appear.
    expect(container.textContent).toContain('hello world')
    expect(container.textContent).toContain('hello again')
    expect(container.textContent).toContain('hello deep')

    // Line numbers should appear.
    expect(container.textContent).toContain('2') // lineNumber for "hello world"
    expect(container.textContent).toContain('1') // lineNumber for "hello deep"
  })

  it('shows a result summary after receiving results', async () => {
    const searchFolder = vi.fn(() => Promise.resolve(SAMPLE_RESULTS))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    const { container } = render(
      <FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    // 3 results across 2 files.
    expect(container.textContent).toContain('3 results in 2 files')
  })

  it('shows "No matches" when results are empty and query is non-empty', async () => {
    const searchFolder = vi.fn(() => Promise.resolve([]))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    const { container } = render(
      <FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } })

    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    expect(container.textContent).toContain('No matches')
  })

  it('calls onOpenResult with filePath, query, caseSensitive, wholeWord, occurrence=0 for the first match', async () => {
    const searchFolder = vi.fn(() => Promise.resolve(SAMPLE_RESULTS))
    const onOpenResult = vi.fn()
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    render(<FolderSearch rootFolder="/docs" onOpenResult={onOpenResult} onReplaced={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    // Click the first match button (line 2 in notes.md).
    // The accessible name comes from visible text: "2 hello world".
    const matchButtons = screen.getAllByRole('button', { name: /2\s+hello world/i })
    expect(matchButtons.length).toBeGreaterThan(0)
    fireEvent.click(matchButtons[0] as HTMLButtonElement)

    expect(onOpenResult).toHaveBeenCalledOnce()
    // First match in the file -> occurrence index 0.
    expect(onOpenResult).toHaveBeenCalledWith('/docs/notes.md', 'hello', false, false, 0)
  })

  it('passes occurrence = count of matches in preceding lines (clicking the second match in a file)', async () => {
    const searchFolder = vi.fn(() => Promise.resolve(SAMPLE_RESULTS))
    const onOpenResult = vi.fn()
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    render(<FolderSearch rootFolder="/docs" onOpenResult={onOpenResult} onReplaced={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    // Click the SECOND match in notes.md (line 5 "hello again"). One "hello"
    // occurs in the preceding line ("hello world"), so occurrence index is 1.
    const matchButtons = screen.getAllByRole('button', { name: /5\s+hello again/i })
    expect(matchButtons.length).toBeGreaterThan(0)
    fireEvent.click(matchButtons[0] as HTMLButtonElement)

    expect(onOpenResult).toHaveBeenCalledWith('/docs/notes.md', 'hello', false, false, 1)
  })

  it('highlights the query substring inside match line text', async () => {
    const searchFolder = vi.fn(() => Promise.resolve(SAMPLE_RESULTS))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    const { container } = render(
      <FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    await act(async () => {
      vi.advanceTimersByTime(250)
      await Promise.resolve()
    })

    // The <mark> element should exist for the highlighted substring.
    const marks = container.querySelectorAll('mark.folder-search__highlight')
    expect(marks.length).toBeGreaterThan(0)
    // Each mark should contain the query text.
    expect(marks[0]?.textContent).toBe('hello')
  })

  it('does not call searchFolder before debounce fires', () => {
    const searchFolder = vi.fn(() => Promise.resolve([]))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    render(<FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } })

    // Advance only 100ms - debounce has not fired yet.
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(searchFolder).not.toHaveBeenCalled()
  })
})

describe('FolderSearch - stale responses are dropped', () => {
  it('a slow superseded search cannot overwrite newer results', async () => {
    // First search resolves SLOWLY with stale data; second resolves fast.
    let resolveFirst: (r: FolderSearchResult[]) => void = () => {}
    const firstResponse = new Promise<FolderSearchResult[]>((resolve) => { resolveFirst = resolve })
    const searchFolder = vi
      .fn<(args: { root: string; query: string; caseSensitive: boolean; wholeWord: boolean }) => Promise<FolderSearchResult[]>>()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => Promise.resolve(SAMPLE_RESULTS))
    vi.stubGlobal('lekha', makeMockLekha(searchFolder))

    const { container } = render(
      <FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />,
    )
    const input = screen.getByRole('textbox')

    // Issue search #1, let the debounce fire (promise stays pending).
    fireEvent.change(input, { target: { value: 'hel' } })
    await act(async () => { vi.advanceTimersByTime(250); await Promise.resolve() })

    // Issue search #2, let it fire AND resolve.
    fireEvent.change(input, { target: { value: 'hello' } })
    await act(async () => { vi.advanceTimersByTime(250); await Promise.resolve() })
    expect(container.textContent).toContain('notes.md')

    // The stale first response finally arrives - it must be DROPPED.
    await act(async () => {
      resolveFirst([{ filePath: '/docs/stale.md', fileName: 'stale.md', matches: [{ lineNumber: 1, lineText: 'hel' }] }])
      await Promise.resolve()
    })
    expect(container.textContent).not.toContain('stale.md')
    expect(container.textContent).toContain('notes.md')
  })
})

describe('FolderSearch - Replace All confirm uses dry-run counts', () => {
  it('previews via dryRun (uncapped counts), then replaces for real after confirm', async () => {
    const searchFolder = vi.fn(() => Promise.resolve(SAMPLE_RESULTS))
    // The dry run reports MORE matches than the (capped) visible results - the
    // dialog must show the dry-run numbers, not the result-derived ones.
    const replaceInFolder = vi
      .fn<(args: { dryRun?: boolean }) => Promise<{ filesChanged: number; replacements: number; changedPaths: string[] }>>()
      .mockImplementation((args) =>
        Promise.resolve(
          args.dryRun
            ? { filesChanged: 250, replacements: 5000, changedPaths: [] }
            : { filesChanged: 250, replacements: 5000, changedPaths: ['/docs/notes.md'] },
        ),
      )
    const confirmReplace = vi.fn((_detail: string) => Promise.resolve(true))
    const mock = makeMockLekha(searchFolder)
    mock.replaceInFolder = replaceInFolder
    mock.confirmReplace = confirmReplace
    vi.stubGlobal('lekha', mock)

    const onReplaced = vi.fn()
    render(<FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={onReplaced} />)

    // Search, open the replace row, fill the replacement, click Replace All.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    await act(async () => { vi.advanceTimersByTime(250); await Promise.resolve() })
    fireEvent.click(document.querySelector('.folder-search__replace-toggle')!)
    const replaceInput = document.querySelector('.folder-search__replace-row .folder-search__input')!
    fireEvent.change(replaceInput, { target: { value: 'bye' } })
    await act(async () => {
      fireEvent.click(document.querySelector('.folder-search__replace-all')!)
      await Promise.resolve()
    })

    // Dry run first, real run second.
    expect(replaceInFolder).toHaveBeenCalledTimes(2)
    expect(replaceInFolder.mock.calls[0]?.[0]).toMatchObject({ dryRun: true })
    expect(replaceInFolder.mock.calls[1]?.[0]).not.toMatchObject({ dryRun: true })
    // The confirm shows the ACCURATE dry-run counts (5000 in 250), not the
    // capped result-derived ones (3 in 2).
    expect(String(confirmReplace.mock.calls[0]?.[0])).toContain('5000')
    expect(String(confirmReplace.mock.calls[0]?.[0])).toContain('250')
    expect(onReplaced).toHaveBeenCalledWith(['/docs/notes.md'])
  })

  it('declining the confirm performs no real replace', async () => {
    const searchFolder = vi.fn(() => Promise.resolve(SAMPLE_RESULTS))
    const replaceInFolder = vi.fn(
      (_args: { dryRun?: boolean }) =>
        Promise.resolve({ filesChanged: 2, replacements: 3, changedPaths: [] }),
    )
    const confirmReplace = vi.fn((_detail: string) => Promise.resolve(false))
    const mock = makeMockLekha(searchFolder)
    mock.replaceInFolder = replaceInFolder
    mock.confirmReplace = confirmReplace
    vi.stubGlobal('lekha', mock)

    render(<FolderSearch rootFolder="/docs" onOpenResult={vi.fn()} onReplaced={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    await act(async () => { vi.advanceTimersByTime(250); await Promise.resolve() })
    fireEvent.click(document.querySelector('.folder-search__replace-toggle')!)
    fireEvent.change(
      document.querySelector('.folder-search__replace-row .folder-search__input')!,
      { target: { value: 'bye' } },
    )
    await act(async () => {
      fireEvent.click(document.querySelector('.folder-search__replace-all')!)
      await Promise.resolve()
    })

    // Only the dry-run call happened; the declined confirm stopped the write.
    expect(replaceInFolder).toHaveBeenCalledTimes(1)
    expect(replaceInFolder.mock.calls[0]?.[0]).toMatchObject({ dryRun: true })
  })
})
