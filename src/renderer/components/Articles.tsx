/**
 * Articles - the "Library" sidebar view: a flat list of every markdown file in
 * the workspace, most-recently-modified first, each row showing the title, its
 * source folder, a relative timestamp, and a short preview. Clicking opens it.
 *
 * The list loads via window.lekha.listArticles whenever the open folder changes
 * (and on mount). Sidebar only renders this component while the Articles tab is
 * active, so switching to the tab remounts it and refreshes the list. State is
 * only set inside the async `.then` (never synchronously in the effect body) to
 * satisfy the react-hooks lint rules.
 */
import { useEffect, useState } from 'react'
import type { ArticleEntry } from '@shared/types'

export interface ArticlesProps {
  /** Workspace root; null when no folder is open. */
  rootFolder: string | null
  /** Path of the open document (highlighted row). */
  activePath: string | null
  /** Open a file by path. */
  onSelect: (path: string) => void
}

/** Parent folder label for a path (the immediate directory name). */
function sourceLabel(path: string): string {
  const parts = path.split('/')
  return parts.length >= 2 ? parts[parts.length - 2]! : ''
}

/** Compact relative time: "just now" / "N min ago" / "N h ago" / "Yesterday" / date. */
function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(ms).toLocaleDateString()
}

export function Articles({ rootFolder, activePath, onSelect }: ArticlesProps) {
  const [articles, setArticles] = useState<ArticleEntry[]>([])

  useEffect(() => {
    if (!rootFolder) return
    let cancelled = false
    window.lekha
      .listArticles(rootFolder)
      .then((list) => {
        if (!cancelled) setArticles(list)
      })
      .catch(() => {
        if (!cancelled) setArticles([])
      })
    return () => {
      cancelled = true
    }
  }, [rootFolder])

  if (!rootFolder) {
    return <div className="articles__empty">No folder open</div>
  }

  if (articles.length === 0) {
    return <div className="articles__empty">No markdown files</div>
  }

  return (
    <div className="articles">
      {articles.map((a) => (
        <button
          key={a.path}
          type="button"
          className={`articles__item${a.path === activePath ? ' active' : ''}`}
          onClick={() => onSelect(a.path)}
          title={a.path}
        >
          <div className="articles__row1">
            <span className="articles__title">{a.title}</span>
            <span className="articles__time">{relativeTime(a.mtimeMs)}</span>
          </div>
          {sourceLabel(a.path) && (
            <div className="articles__source">{sourceLabel(a.path)}</div>
          )}
          {a.preview && <div className="articles__preview">{a.preview}</div>}
        </button>
      ))}
    </div>
  )
}
