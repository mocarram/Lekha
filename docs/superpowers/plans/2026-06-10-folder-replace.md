# Folder-wide Find & Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add whole-word search + a "Replace All across the open folder" capability to the sidebar folder-search panel, behind a confirmation, never clobbering unsaved open files.

**Architecture:** A shared pure matcher (`src/shared/textSearch.ts`) powers both the existing `fs:searchFolder` (now with whole-word) and a new `fs:replaceInFolder` IPC that rewrites matched files via the existing `writeFileAtomic`. The renderer skips files open with unsaved edits and reloads clean open tabs from disk after replacing. A small `dialog:confirmReplace` native dialog gates the destructive op.

**Tech Stack:** Electron (main IPC + preload), React 18 + TS, Zustand (`workspaceStore`/`documentsStore`), Vitest, Playwright. Plain-text matching only (no regex).

---

## Background facts (do not re-derive)

- `src/main/ipc/search.ts` exports `searchInText(content, query, caseSensitive)` and has a private `collectMarkdownPaths(dir)` + uses `readTextFile`, `buildFileTree` from `@main/fs-helpers`. Handler registered by `registerSearchHandlers()` (called in `src/main/index.ts:503`).
- `writeFileAtomic(path, content)` lives in `@main/fs-helpers` (`src/main/fs-helpers.ts`).
- Native dialog pattern: `src/main/ipc/dialog.ts` `registerDialogHandlers()` (called `index.ts:460`), using `dialog.showMessageBox(win!, {...})` + `senderWindow(event)`.
- IPC channels in `src/shared/ipc-channels.ts` (`export const IPC = {...}`). Preload surface in `src/preload/index.ts` (impl) + `src/preload/api.d.ts` (types). `searchFolder` is at `src/preload/index.ts:235`.
- `workspaceStore` already has `searchQuery`/`searchCaseSensitive` (+ setters), read in `FolderSearch.tsx` and set via `useWorkspaceStore.getState().setSearchQuery(...)`.
- `documentsStore`: `documents: DocumentTab[]` (`{ id, path, title, markdown, isDirty, ... }`), `activeId`, `activeDocument()`, `updateActive(patch)`, `updateDocument(id, patch)`.
- `App.tsx` renders `<Sidebar onOpenSearchResult={...} ... />` and holds `editorRef` (with `editorRef.current?.setMarkdown(content)`); `useEditorStore.getState().setMarkdown(content)` mirrors the active buffer.
- `window.lekha.readFile(path): Promise<string>`.
- Unit tests in `tests/unit/**`; existing `tests/unit/main/search.test.ts` calls `searchInText(content, query, caseSensitive)`.

## File structure

- **Create** `src/shared/textSearch.ts` - pure matcher (`findMatchRanges`, `replaceAllInText`).
- **Create** `tests/unit/shared/textSearch.test.ts`.
- **Modify** `src/main/ipc/search.ts` - whole-word via the matcher; export `collectMarkdownPaths`; `searchInText` gains optional `wholeWord`.
- **Create** `src/main/ipc/replace.ts` + **Create** `tests/unit/main/replace.test.ts`.
- **Modify** `src/main/ipc/dialog.ts` - `confirmReplace` handler.
- **Modify** `src/shared/ipc-channels.ts` - `replaceInFolder`, `confirmReplace` channels.
- **Modify** `src/main/index.ts` - register the replace handler.
- **Modify** `src/preload/index.ts` + `src/preload/api.d.ts` - `searchFolder` whole-word, `replaceInFolder`, `confirmReplace`.
- **Modify** `src/renderer/store/workspaceStore.ts` - `searchWholeWord`, `searchReplaceText` (+ setters).
- **Modify** `src/renderer/components/FolderSearch.tsx` - whole-word toggle, replace row, replace-all flow, matcher-based highlight, `onReplaced` prop.
- **Modify** `src/renderer/components/Sidebar.tsx` + `src/renderer/App.tsx` - thread an `onReplaced` reload callback.
- **Modify** `src/renderer/styles/global.css` - whole-word toggle + replace row.
- **Modify** `tests/e2e/app.spec.ts` - folder-replace e2e (best-effort; see Task 10).

---

## Task 1: Shared text matcher (TDD)

**Files:**
- Create: `tests/unit/shared/textSearch.test.ts`
- Create: `src/shared/textSearch.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shared/textSearch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findMatchRanges, replaceAllInText } from '../../../src/shared/textSearch'

describe('findMatchRanges', () => {
  it('returns [] for an empty query', () => {
    expect(findMatchRanges('hello', '', { caseSensitive: false, wholeWord: false })).toEqual([])
  })
  it('finds all non-overlapping occurrences (case-insensitive)', () => {
    expect(findMatchRanges('Foo foo FOO', 'foo', { caseSensitive: false, wholeWord: false }))
      .toEqual([[0, 3], [4, 7], [8, 11]])
  })
  it('respects case sensitivity', () => {
    expect(findMatchRanges('Foo foo', 'foo', { caseSensitive: true, wholeWord: false }))
      .toEqual([[4, 7]])
  })
  it('whole-word excludes substrings inside larger words', () => {
    // "cat" in "cats" and "scatter" are NOT whole words; the standalone "cat" is.
    expect(findMatchRanges('cat cats scatter cat.', 'cat', { caseSensitive: false, wholeWord: true }))
      .toEqual([[0, 3], [17, 20]])
  })
  it('whole-word treats underscores/digits as word chars', () => {
    expect(findMatchRanges('a_b ab', 'a', { caseSensitive: false, wholeWord: true })).toEqual([])
  })
})

describe('replaceAllInText', () => {
  it('returns the text unchanged with count 0 when there is no match', () => {
    expect(replaceAllInText('hello', 'zz', 'x', { caseSensitive: false, wholeWord: false }))
      .toEqual({ text: 'hello', count: 0 })
  })
  it('replaces every match and reports the count', () => {
    expect(replaceAllInText('Foo foo', 'foo', 'bar', { caseSensitive: false, wholeWord: false }))
      .toEqual({ text: 'bar bar', count: 2 })
  })
  it('preserves the original casing of surrounding text', () => {
    expect(replaceAllInText('The CAT sat', 'cat', 'dog', { caseSensitive: false, wholeWord: true }))
      .toEqual({ text: 'The dog sat', count: 1 })
  })
})
```

- [ ] **Step 2: Run the test to confirm it FAILS**

Run: `npm test -- textSearch`
Expected: FAIL - cannot resolve `../../../src/shared/textSearch`.

- [ ] **Step 3: Create the matcher**

Create `src/shared/textSearch.ts`:

```ts
/*
 * Shared plain-text matcher used by BOTH folder search and folder replace, so
 * highlighting and replacement always agree. No regex is exposed.
 */

export interface TextSearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

const WORD_CHAR = /[A-Za-z0-9_]/

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch)
}

/**
 * Every [start, end) offset of `query` in `text` under `opts`, left to right,
 * non-overlapping. Empty `query` returns []. `wholeWord` requires a non-word
 * char (or string edge) on both sides of a match. ASCII word chars only.
 */
export function findMatchRanges(
  text: string,
  query: string,
  opts: TextSearchOptions,
): Array<[number, number]> {
  if (query.length === 0) return []
  const haystack = opts.caseSensitive ? text : text.toLowerCase()
  const needle = opts.caseSensitive ? query : query.toLowerCase()
  const ranges: Array<[number, number]> = []
  let from = 0
  for (;;) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    const end = idx + needle.length
    if (!opts.wholeWord || (!isWordChar(text[idx - 1]) && !isWordChar(text[end]))) {
      ranges.push([idx, end])
    }
    from = end
  }
  return ranges
}

/** Replace every match of `query` with `replacement`; returns new text + count. */
export function replaceAllInText(
  text: string,
  query: string,
  replacement: string,
  opts: TextSearchOptions,
): { text: string; count: number } {
  const ranges = findMatchRanges(text, query, opts)
  if (ranges.length === 0) return { text, count: 0 }
  let out = ''
  let last = 0
  for (const [start, end] of ranges) {
    out += text.slice(last, start) + replacement
    last = end
  }
  out += text.slice(last)
  return { text: out, count: ranges.length }
}
```

- [ ] **Step 4: Run the test to confirm it PASSES**

Run: `npm test -- textSearch`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/textSearch.ts tests/unit/shared/textSearch.test.ts
git commit -m "feat(search): shared plain-text matcher (case + whole-word)"
```
Repo git rules (ALL tasks): no Co-Authored-By trailer; no push; no em dashes (use a hyphen).

---

## Task 2: Whole-word in folder search

**Files:**
- Modify: `src/main/ipc/search.ts`
- Modify: `src/shared/ipc-channels.ts` (none here - search channel exists)
- Modify: `src/preload/index.ts`, `src/preload/api.d.ts`
- Modify: `src/renderer/store/workspaceStore.ts`
- Modify: `src/renderer/components/FolderSearch.tsx`
- Test: `tests/unit/main/search.test.ts` (add a case)

- [ ] **Step 1: Add a failing whole-word search test**

In `tests/unit/main/search.test.ts`, add this test inside the existing `describe` for `searchInText` (keep existing tests as-is):

```ts
  it('whole-word search excludes substrings inside larger words', () => {
    const matches = searchInText('cat\ncats\nthe cat sat', 'cat', false, true)
    // line 1 ("cat") and line 3 ("the cat sat") match; line 2 ("cats") does not.
    expect(matches.map((m) => m.lineNumber)).toEqual([1, 3])
  })
```

- [ ] **Step 2: Run it to confirm it FAILS**

Run: `npm test -- search`
Expected: FAIL - `searchInText` currently takes 3 args; the 4th (`wholeWord`) is ignored so `cats` still matches (or a TS arity error).

- [ ] **Step 3: Refactor `searchInText` to use the matcher + accept whole-word**

In `src/main/ipc/search.ts`: add the import and replace the `searchInText` body. Change the import line `import { buildFileTree, readTextFile } from '@main/fs-helpers'` to keep as-is, and add:

```ts
import { findMatchRanges } from '@shared/textSearch'
```

Replace the whole `export function searchInText(...) {...}` with:

```ts
export function searchInText(
  content: string,
  query: string,
  caseSensitive: boolean,
  wholeWord = false,
): FolderSearchMatch[] {
  if (query.length === 0) return []

  const lines = content.split('\n')
  const results: FolderSearchMatch[] = []
  const opts = { caseSensitive, wholeWord }

  for (let i = 0; i < lines.length; i++) {
    if (results.length >= MAX_MATCHES_PER_FILE) break
    const raw = lines[i] ?? ''
    if (findMatchRanges(raw, query, opts).length > 0) {
      const lineText = raw.length > MAX_LINE_LENGTH
        ? raw.slice(0, MAX_LINE_LENGTH) + '…'
        : raw
      results.push({ lineNumber: i + 1, lineText })
    }
  }

  return results
}
```

- [ ] **Step 4: Thread `wholeWord` through the handler + export `collectMarkdownPaths`**

In `src/main/ipc/search.ts`:
- Change `async function collectMarkdownPaths` to `export async function collectMarkdownPaths` (replace handler in Task 3 reuses it).
- Change the `SearchFolderArgs` interface to add `wholeWord: boolean`.
- In the handler, change `const { root, query, caseSensitive } = args` to `const { root, query, caseSensitive, wholeWord } = args` and the call `searchInText(content, query, caseSensitive)` to `searchInText(content, query, caseSensitive, wholeWord)`.

- [ ] **Step 5: Update the preload signature**

In `src/preload/index.ts`, change the `searchFolder` method to:

```ts
  searchFolder(args: { root: string; query: string; caseSensitive: boolean; wholeWord: boolean }): Promise<FolderSearchResult[]> {
    return ipcRenderer.invoke(IPC.searchFolder, args) as Promise<FolderSearchResult[]>
  },
```

In `src/preload/api.d.ts`, find the `searchFolder(args: {...})` declaration and add `wholeWord: boolean` to its args object (matching the impl above).

- [ ] **Step 6: Add `searchWholeWord` to the store**

In `src/renderer/store/workspaceStore.ts`:
- Add to the state interface (next to `searchCaseSensitive`): `searchWholeWord: boolean`.
- Add to the actions interface: `setSearchWholeWord(v: boolean): void`.
- Add to initial state (next to `searchCaseSensitive: false`): `searchWholeWord: false,`.
- Add the setter next to `setSearchCaseSensitive`:

```ts
  setSearchWholeWord(v) {
    set({ searchWholeWord: v })
  },
```

- [ ] **Step 7: Wire the toggle + pass `wholeWord` in `FolderSearch.tsx`**

In `src/renderer/components/FolderSearch.tsx`:
- After `const caseSensitive = useWorkspaceStore((s) => s.searchCaseSensitive)` add:
  `const wholeWord = useWorkspaceStore((s) => s.searchWholeWord)`
- Change `runSearch` to accept + pass whole-word. Replace its signature/body's IPC call: the `useCallback` currently is `(q: string, cs: boolean) => {...}` calling `window.lekha.searchFolder({ root: rootFolder, query: q, caseSensitive: cs })`. Change to:

```ts
  const runSearch = useCallback(
    (q: string, cs: boolean, ww: boolean) => {
      if (!rootFolder || q.length < 1) {
        setResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      window.lekha
        .searchFolder({ root: rootFolder, query: q, caseSensitive: cs, wholeWord: ww })
        .then((res) => {
          setResults(res)
          setSearching(false)
        })
        .catch(() => {
          setResults([])
          setSearching(false)
        })
    },
    [rootFolder],
  )
```

- Change the debounce effect to depend on + pass `wholeWord`: the effect body `runSearch(query, caseSensitive)` becomes `runSearch(query, caseSensitive, wholeWord)`, and add `wholeWord` to its dependency array `[query, caseSensitive, wholeWord, runSearch]`.
- Add the whole-word toggle button immediately after the existing `folder-search__case-btn` button (the "Aa" button), inside the capsule:

```tsx
        <button
          type="button"
          className={`folder-search__case-btn${wholeWord ? ' active' : ''}`}
          onClick={() => { useWorkspaceStore.getState().setSearchWholeWord(!wholeWord) }}
          title={wholeWord ? 'Whole word: on' : 'Match whole word'}
          aria-label="Match whole word"
          aria-pressed={wholeWord}
        >
          ab
        </button>
```

- [ ] **Step 8: Use the matcher for inline highlighting (consistency)**

In `src/renderer/components/FolderSearch.tsx`, replace the `highlightMatch` helper so highlights match the search semantics. Add the import at the top:

```ts
import { findMatchRanges } from '@shared/textSearch'
```

Replace the entire `function highlightMatch(lineText, query, caseSensitive) {...}` with a version that takes whole-word and uses the matcher:

```tsx
function highlightMatch(
  lineText: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): React.ReactNode[] {
  if (!query) return [lineText]
  const ranges = findMatchRanges(lineText, query, { caseSensitive, wholeWord })
  if (ranges.length === 0) return [lineText]
  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(lineText.slice(cursor, start))
    parts.push(
      <mark key={i} className="folder-search__highlight">
        {lineText.slice(start, end)}
      </mark>,
    )
    cursor = end
  })
  if (cursor < lineText.length) parts.push(lineText.slice(cursor))
  return parts
}
```

Update its single call site (in the match row JSX) from `highlightMatch(match.lineText, query, caseSensitive)` to `highlightMatch(match.lineText, query, caseSensitive, wholeWord)`.

- [ ] **Step 9: Verify**

Run: `npm test -- search && npm test -- folderSearch && npm run typecheck && npm run lint`
Expected: all pass (the new whole-word search test included).

- [ ] **Step 10: Commit**

```bash
git add src/main/ipc/search.ts src/preload/index.ts src/preload/api.d.ts src/renderer/store/workspaceStore.ts src/renderer/components/FolderSearch.tsx tests/unit/main/search.test.ts
git commit -m "feat(search): whole-word toggle for folder search"
```

---

## Task 3: Replace-in-folder IPC (TDD)

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Create: `src/main/ipc/replace.ts`
- Create: `tests/unit/main/replace.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`, `src/preload/api.d.ts`

- [ ] **Step 1: Add the IPC channel**

In `src/shared/ipc-channels.ts`, add inside the `IPC` object right after the `searchFolder: 'fs:searchFolder',` line:

```ts
  /** Renderer -> main: replace `query` with `replacement` across the folder. */
  replaceInFolder: 'fs:replaceInFolder',
```

- [ ] **Step 2: Write the failing handler test**

Create `tests/unit/main/replace.test.ts`:

```ts
/**
 * replaceInFolder: replaces matches across the markdown files under a root,
 * skipping skipPaths, writing changed files atomically. Tested against a temp dir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { replaceInFolderFiles } from '../../../src/main/ipc/replace'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lekha-replace-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('replaceInFolderFiles', () => {
  it('replaces matches in matching files and reports counts', async () => {
    const a = join(dir, 'a.md'); const b = join(dir, 'b.md'); const c = join(dir, 'c.md')
    await writeFile(a, 'cat cat', 'utf8')
    await writeFile(b, 'a cat here', 'utf8')
    await writeFile(c, 'no match', 'utf8')

    const res = await replaceInFolderFiles({
      root: dir, query: 'cat', replacement: 'dog',
      caseSensitive: false, wholeWord: false, skipPaths: [],
    })

    expect(res.replacements).toBe(3)
    expect(res.filesChanged).toBe(2)
    expect(res.changedPaths.sort()).toEqual([a, b].sort())
    expect(await readFile(a, 'utf8')).toBe('dog dog')
    expect(await readFile(b, 'utf8')).toBe('a dog here')
    expect(await readFile(c, 'utf8')).toBe('no match') // untouched
  })

  it('never writes a file in skipPaths', async () => {
    const a = join(dir, 'a.md')
    await writeFile(a, 'cat', 'utf8')
    const res = await replaceInFolderFiles({
      root: dir, query: 'cat', replacement: 'dog',
      caseSensitive: false, wholeWord: false, skipPaths: [a],
    })
    expect(res.filesChanged).toBe(0)
    expect(await readFile(a, 'utf8')).toBe('cat') // untouched
  })

  it('honors whole-word', async () => {
    const a = join(dir, 'a.md')
    await writeFile(a, 'cat cats', 'utf8')
    const res = await replaceInFolderFiles({
      root: dir, query: 'cat', replacement: 'dog',
      caseSensitive: false, wholeWord: true, skipPaths: [],
    })
    expect(res.replacements).toBe(1)
    expect(await readFile(a, 'utf8')).toBe('dog cats')
  })

  it('returns zeros for an empty query', async () => {
    const res = await replaceInFolderFiles({
      root: dir, query: '', replacement: 'x',
      caseSensitive: false, wholeWord: false, skipPaths: [],
    })
    expect(res).toEqual({ filesChanged: 0, replacements: 0, changedPaths: [] })
  })
})
```

- [ ] **Step 3: Run it to confirm it FAILS**

Run: `npm test -- replace`
Expected: FAIL - cannot resolve `../../../src/main/ipc/replace`.

- [ ] **Step 4: Create the handler + its pure core**

Create `src/main/ipc/replace.ts`:

```ts
import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { readTextFile, writeFileAtomic } from '@main/fs-helpers'
import { collectMarkdownPaths } from '@main/ipc/search'
import { replaceAllInText } from '@shared/textSearch'

export interface ReplaceInFolderArgs {
  root: string
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  /** Absolute paths to leave untouched (e.g. files open with unsaved edits). */
  skipPaths: string[]
}

export interface ReplaceInFolderResult {
  filesChanged: number
  replacements: number
  changedPaths: string[]
}

/**
 * Pure-ish core (exported for tests): enumerate markdown files under `root`,
 * replace matches in each file NOT in `skipPaths`, write changed files
 * atomically. Best-effort: an unreadable/unwritable file is skipped.
 */
export async function replaceInFolderFiles(
  args: ReplaceInFolderArgs,
): Promise<ReplaceInFolderResult> {
  const { root, query, replacement, caseSensitive, wholeWord, skipPaths } = args
  const empty: ReplaceInFolderResult = { filesChanged: 0, replacements: 0, changedPaths: [] }
  if (!query) return empty

  const skip = new Set(skipPaths)
  let paths: string[]
  try {
    paths = await collectMarkdownPaths(root)
  } catch {
    return empty
  }

  const opts = { caseSensitive, wholeWord }
  const changedPaths: string[] = []
  let replacements = 0

  for (const filePath of paths) {
    if (skip.has(filePath)) continue
    let content: string
    try {
      content = await readTextFile(filePath)
    } catch {
      continue
    }
    const { text, count } = replaceAllInText(content, query, replacement, opts)
    if (count === 0) continue
    try {
      await writeFileAtomic(filePath, text)
    } catch {
      continue
    }
    changedPaths.push(filePath)
    replacements += count
  }

  return { filesChanged: changedPaths.length, replacements, changedPaths }
}

/** Register the `fs:replaceInFolder` IPC handler. */
export function registerReplaceHandlers(): void {
  ipcMain.handle(IPC.replaceInFolder, async (_event, args: ReplaceInFolderArgs) => {
    return replaceInFolderFiles(args)
  })
}
```

- [ ] **Step 5: Run the test to confirm it PASSES**

Run: `npm test -- replace`
Expected: PASS (4 tests).

- [ ] **Step 6: Register the handler**

In `src/main/index.ts`: add `import { registerReplaceHandlers } from '@main/ipc/replace'` next to the `registerSearchHandlers` import, and add `registerReplaceHandlers()` on the line right after the existing `registerSearchHandlers()` call.

- [ ] **Step 7: Expose it in preload**

In `src/preload/index.ts`, add right after the `searchFolder` method:

```ts
  replaceInFolder(args: {
    root: string
    query: string
    replacement: string
    caseSensitive: boolean
    wholeWord: boolean
    skipPaths: string[]
  }): Promise<{ filesChanged: number; replacements: number; changedPaths: string[] }> {
    return ipcRenderer.invoke(IPC.replaceInFolder, args) as Promise<{
      filesChanged: number
      replacements: number
      changedPaths: string[]
    }>
  },
```

In `src/preload/api.d.ts`, add a matching declaration right after the `searchFolder` declaration:

```ts
  replaceInFolder(args: {
    root: string
    query: string
    replacement: string
    caseSensitive: boolean
    wholeWord: boolean
    skipPaths: string[]
  }): Promise<{ filesChanged: number; replacements: number; changedPaths: string[] }>
```

- [ ] **Step 8: Verify + commit**

Run: `npm test -- replace && npm run typecheck && npm run lint`
Expected: pass.

```bash
git add src/shared/ipc-channels.ts src/main/ipc/replace.ts tests/unit/main/replace.test.ts src/main/index.ts src/preload/index.ts src/preload/api.d.ts
git commit -m "feat(search): fs:replaceInFolder IPC (atomic, skip-aware)"
```

---

## Task 4: Confirm-replace dialog IPC

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc/dialog.ts`
- Modify: `src/preload/index.ts`, `src/preload/api.d.ts`

- [ ] **Step 1: Add the channel**

In `src/shared/ipc-channels.ts`, add right after the `confirmUnsaved: 'dialog:confirmUnsaved',` line:

```ts
  /** Renderer -> main: confirm a destructive folder-wide replace. Returns boolean. */
  confirmReplace: 'dialog:confirmReplace',
```

- [ ] **Step 2: Add the handler**

In `src/main/ipc/dialog.ts`, inside `registerDialogHandlers()`, add after the `confirmUnsaved` handler block:

```ts
  // --- Folder-replace confirmation (destructive, not undoable) ---
  ipcMain.handle(IPC.confirmReplace, async (event, detail: string): Promise<boolean> => {
    const win = senderWindow(event)
    const result = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Replace All', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Replace across files?',
      detail,
    })
    return result.response === 0
  })
```

- [ ] **Step 3: Expose in preload**

In `src/preload/index.ts`, add near `confirmUnsaved`:

```ts
  confirmReplace(detail: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.confirmReplace, detail) as Promise<boolean>
  },
```

In `src/preload/api.d.ts`, add near the `confirmUnsaved` declaration:

```ts
  confirmReplace(detail: string): Promise<boolean>
```

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: pass.

```bash
git add src/shared/ipc-channels.ts src/main/ipc/dialog.ts src/preload/index.ts src/preload/api.d.ts
git commit -m "feat(search): native confirm dialog for folder replace"
```

---

## Task 5: Replace text in the store + reload callback wiring

**Files:**
- Modify: `src/renderer/store/workspaceStore.ts`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add `searchReplaceText` to the store**

In `src/renderer/store/workspaceStore.ts`:
- State interface: add `searchReplaceText: string` (next to `searchWholeWord`).
- Actions interface: add `setSearchReplaceText(v: string): void`.
- Initial state: add `searchReplaceText: '',`.
- Add the setter:

```ts
  setSearchReplaceText(v) {
    set({ searchReplaceText: v })
  },
```

- [ ] **Step 2: Add the `onReplaced` prop to Sidebar and thread it**

In `src/renderer/components/Sidebar.tsx`:
- Add to `SidebarProps`:

```ts
  /**
   * Called after a folder-wide replace with the absolute paths of files that
   * changed on disk, so the parent can reload any of them that are open in a
   * clean tab.
   */
  onReplaced: (changedPaths: string[]) => void
```

- Add `onReplaced` to the destructured props in the function signature.
- Pass it to `<FolderSearch ... />` (the `sidebarTab === 'search'` branch): add the prop `onReplaced={onReplaced}` alongside the existing `rootFolder` / `onOpenResult`.

- [ ] **Step 3: Implement the reload in App and pass it down**

In `src/renderer/App.tsx`, add this callback near the other `fileOps`-based handlers (e.g. just before the `return (`):

```tsx
  // After a folder-wide replace, reload any CHANGED file that is open in a CLEAN
  // tab so the on-disk change and the in-app buffer never diverge. Dirty tabs
  // were skipped by the replace and are intentionally left alone.
  const handleFolderReplaced = useCallback((changedPaths: string[]) => {
    const changed = new Set(changedPaths)
    const docs = useDocumentsStore.getState()
    for (const doc of docs.documents) {
      if (doc.path === null || doc.isDirty || !changed.has(doc.path)) continue
      void window.lekha.readFile(doc.path).then((content) => {
        if (doc.id === useDocumentsStore.getState().activeId) {
          editorRef.current?.setMarkdown(content)
          useEditorStore.getState().setMarkdown(content)
        }
        useDocumentsStore.getState().updateDocument(doc.id, { markdown: content, isDirty: false })
      })
    }
  }, [])
```

Then pass it to `<Sidebar ... onReplaced={handleFolderReplaced} />` (add the prop alongside `onOpenSearchResult`).

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck && npm run lint`
Expected: pass (FolderSearch will warn it lacks the prop only once Task 6 adds it; if typecheck fails on the missing `onReplaced` prop in FolderSearch usage, proceed to Task 6 which adds it, then re-run. To keep this task self-contained, add the prop to FolderSearchProps now as an optional `onReplaced?` - Task 6 makes it required and uses it.)

Add to `FolderSearchProps` in `src/renderer/components/FolderSearch.tsx` now:

```ts
  /** Called with paths changed on disk by a folder replace (see Sidebar). */
  onReplaced: (changedPaths: string[]) => void
```

and to the destructured props. Re-run typecheck/lint (pass).

```bash
git add src/renderer/store/workspaceStore.ts src/renderer/components/Sidebar.tsx src/renderer/App.tsx src/renderer/components/FolderSearch.tsx
git commit -m "feat(search): replace-text store field + reload-changed-tabs wiring"
```

---

## Task 6: Replace row UI + Replace All flow

**Files:**
- Modify: `src/renderer/components/FolderSearch.tsx`

- [ ] **Step 1: Add replace state + the replace-all handler**

In `src/renderer/components/FolderSearch.tsx`, inside the component body (after the existing search state):

```tsx
  const replaceText = useWorkspaceStore((s) => s.searchReplaceText)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replaceStatus, setReplaceStatus] = useState<string | null>(null)

  const handleReplaceAll = useCallback(async () => {
    if (!rootFolder || query.length < 1 || results.length === 0) return
    // Files in the results that are open with unsaved edits -> skip (never clobber).
    const dirtyOpen = new Set(
      useDocumentsStore.getState().documents
        .filter((d) => d.path !== null && d.isDirty)
        .map((d) => d.path as string),
    )
    const skipPaths = results.map((r) => r.filePath).filter((p) => dirtyOpen.has(p))
    const totalMatches = results.reduce((acc, r) => acc + r.matches.length, 0)
    const detail =
      `Replace ${totalMatches} match${totalMatches === 1 ? '' : 'es'} in ` +
      `${results.length} file${results.length === 1 ? '' : 's'}.` +
      (skipPaths.length > 0
        ? ` ${skipPaths.length} open unsaved file${skipPaths.length === 1 ? '' : 's'} will be skipped.`
        : '') +
      ' This cannot be undone.'

    const ok = await window.lekha.confirmReplace(detail)
    if (!ok) return

    const res = await window.lekha.replaceInFolder({
      root: rootFolder,
      query,
      replacement: replaceText,
      caseSensitive,
      wholeWord,
      skipPaths,
    })
    onReplaced(res.changedPaths)
    setReplaceStatus(
      `Replaced ${res.replacements} in ${res.filesChanged} file${res.filesChanged === 1 ? '' : 's'}` +
      (skipPaths.length > 0 ? ` · skipped ${skipPaths.length} unsaved` : ''),
    )
    runSearch(query, caseSensitive, wholeWord) // refresh results
  }, [rootFolder, query, results, replaceText, caseSensitive, wholeWord, onReplaced, runSearch])
```

Add `useDocumentsStore` to the imports at the top:

```ts
import { useDocumentsStore } from '@renderer/store/documentsStore'
```

(`useState`, `useCallback` are already imported.)

- [ ] **Step 2: Add the chevron + replace row markup**

In the JSX, immediately AFTER the closing `</div>` of `folder-search__input-row` (the search capsule), insert the expand chevron and the replace row:

```tsx
      {/* Replace toggle + row (collapsed by default, VS Code style). */}
      <button
        type="button"
        className="folder-search__replace-toggle"
        aria-label={replaceOpen ? 'Hide replace' : 'Show replace'}
        aria-expanded={replaceOpen}
        title={replaceOpen ? 'Hide replace' : 'Show replace'}
        onClick={() => { setReplaceOpen((v) => !v) }}
      >
        {replaceOpen ? '⌄ Replace' : '› Replace'}
      </button>
      {replaceOpen && (
        <div className="folder-search__input-row folder-search__replace-row">
          <input
            className="folder-search__input"
            type="text"
            placeholder="Replace in folder..."
            value={replaceText}
            onChange={(e) => { useWorkspaceStore.getState().setSearchReplaceText(e.target.value) }}
            aria-label="Replace with"
            spellCheck={false}
          />
          <button
            type="button"
            className="folder-search__replace-all"
            onClick={() => { void handleReplaceAll() }}
            disabled={query.length < 1 || results.length === 0}
            title="Replace all matches in the folder"
          >
            Replace All
          </button>
        </div>
      )}
```

- [ ] **Step 3: Show the replace status**

Find the existing status line block (`{query.length > 0 && !searching && (<div className="folder-search__status">...`). Immediately before it, add a replace-status line:

```tsx
      {replaceStatus !== null && (
        <div className="folder-search__status">{replaceStatus}</div>
      )}
```

- [ ] **Step 4: Verify**

Run: `npm test -- folderSearch && npm run typecheck && npm run lint`
Expected: pass (existing folderSearch tests still pass - labels/inputs unchanged; the new controls don't break them).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/FolderSearch.tsx
git commit -m "feat(search): folder replace row + Replace All flow (confirm + skip unsaved)"
```

---

## Task 7: Styling

**Files:**
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Add styles for the replace toggle, row, and button**

In `src/renderer/styles/global.css`, immediately AFTER the `.folder-search__case-btn.active { ... }` rule, add:

```css
/* Replace expand toggle: a quiet ghost row that opens the replace input. */
.folder-search__replace-toggle {
  display: block;
  width: calc(100% - 16px);
  margin: 0 8px 4px;
  padding: 2px 4px;
  text-align: left;
  border: none;
  background: none;
  color: var(--color-text-muted);
  font-family: var(--font-ui);
  font-size: 11px;
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.folder-search__replace-toggle:hover {
  color: var(--color-text);
}

/* The replace capsule reuses .folder-search__input-row; just tighten its top margin. */
.folder-search__replace-row {
  margin-top: 0;
}

/* Replace All: a small accent text button inside the replace capsule. */
.folder-search__replace-all {
  flex-shrink: 0;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--color-accent);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.12s ease, background-color 0.12s ease;
}

.folder-search__replace-all:hover {
  background-color: var(--sidebar-hover);
}

.folder-search__replace-all:disabled {
  color: var(--color-text-muted);
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 2: Verify the build compiles the CSS**

Run: `npm run build`
Expected: BUILD OK.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/global.css
git commit -m "style(search): replace row + whole-word toggle styling"
```

---

## Task 8: Full gate + visual verification

**Files:** none (verification)

- [ ] **Step 1: Run the complete gate**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: all green; includes `textSearch` (8), `replace` (4), `search`, `folderSearch` suites.

- [ ] **Step 2: Manual check (dev or built app)**

Run `npm run dev` (or a built launch). With a folder open:
- Search a term; toggle `ab` (whole word) and confirm results narrow to whole words; toggle `Aa` and confirm case behavior.
- Expand Replace, type a replacement, click **Replace All**, confirm the native dialog, and verify files changed on disk + a clean open tab reflects the change.
- Open a file, make an unsaved edit that matches the query, Replace All, and confirm that file is **skipped** (status shows "skipped 1 unsaved") and its unsaved buffer is untouched.

- [ ] **Step 3: No commit** (verification only). Fix any issue in the owning task's files and re-run Step 1.

---

## Task 9: e2e coverage

**Files:**
- Modify: `tests/e2e/app.spec.ts`

- [ ] **Step 1: Add an e2e test**

Append to `tests/e2e/app.spec.ts` (uses the shared `sharedWin`; opens a temp folder via the existing folder-open path is complex in e2e, so this test drives the renderer search/replace UI against a temp folder created and opened through the same IPC the app uses). If opening a folder in e2e is not already supported by a helper in this file, instead assert the UI wiring: type in the search input, click the Replace toggle, and confirm the Replace input + Replace All button appear. Concretely:

```ts
test('folder search panel exposes whole-word and replace controls', async () => {
  const win = sharedWin
  // Open the Search tab via its bottom sidebar button.
  await win.locator('.sidebar__tab-btn', { hasText: 'Search' }).click()
  await expect(win.locator('.folder-search__input')).toBeVisible()
  // Whole-word toggle present.
  await expect(win.locator('.folder-search__case-btn', { hasText: 'ab' })).toBeVisible()
  // Expand replace.
  await win.locator('.folder-search__replace-toggle').click()
  await expect(win.locator('.folder-search__replace-all')).toBeVisible()
  await expect(win.locator('input[aria-label="Replace with"]')).toBeVisible()
})
```

(Note: this asserts the UI is wired; the file-mutating path is covered by the `replace` unit tests, which exercise the real disk logic. Driving a full folder-open + on-disk replace in headless e2e is left out deliberately to avoid flakiness.)

- [ ] **Step 2: Build + run e2e**

Run: `npm run build && npm run test:e2e`
Expected: all pass including the new test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/app.spec.ts
git commit -m "test(e2e): folder search whole-word + replace controls present"
```

---

## Self-review notes (for the implementer)

- `findMatchRanges` / `replaceAllInText` (Task 1) are the single source of match semantics; search (Task 2), highlight (Task 2), and replace (Task 3) all call them - never reimplement matching.
- `searchInText`'s 4th arg `wholeWord` defaults to `false`, so the pre-existing 3-arg tests keep passing.
- `replaceInFolderFiles` is exported for the unit test; the IPC handler is a thin wrapper.
- Skip set is computed in the renderer (dirty open tabs) and enforced in main; the reload (Task 5) only touches CLEAN open tabs, so unsaved work is never lost or overwritten.
- The confirm dialog (Task 4) is mandatory before any write.
- Property names are consistent: `searchWholeWord`, `searchReplaceText`, `onReplaced`, `changedPaths`, `replaceInFolderFiles`.
