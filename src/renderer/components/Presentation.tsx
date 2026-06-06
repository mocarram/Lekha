/**
 * Presentation.tsx
 *
 * Full-screen presentation overlay for Lekha.
 *
 * Renders the current Markdown document as a slideshow. Each slide is an HTML
 * fragment produced by the `renderSlide` prop (defaults to `renderMarkdownBody`
 * from the export pipeline, so math, code highlighting, and mermaid diagrams
 * all render exactly as they do in the export path - DRY by design).
 *
 * Navigation:
 *   Right arrow / Space / PageDown - next slide
 *   Left arrow / PageUp            - previous slide
 *   Home                           - first slide
 *   End                            - last slide
 *   Esc                            - exit (calls onExit)
 *
 * Click zones: clicking the left 40% of the screen goes back; right 60% advances.
 *
 * Accessibility: role=dialog, aria-modal, Esc to exit, slide counter.
 * Token-themed: uses --color-* CSS variables from global.css.
 *
 * Important: App.tsx passes a `key` that increments on each open, so the
 * component remounts fresh each time. This means `index` and `renderedCache`
 * always start at their initial values without needing any internal reset logic.
 */

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from 'react'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'
// Type-only import: erased at build time, so it does NOT pull the export
// pipeline into the initial chunk. The actual module is dynamic-imported below.
import type { renderMarkdownBody as RenderMarkdownBody } from '@renderer/export/buildHtml'

// ---------------------------------------------------------------------------
// Lazy slide renderer
//
// The slide renderer (renderMarkdownBody) lives in the export pipeline, which
// pulls in katex/highlight.js/mermaid. Presentation mode is rarely the first
// thing a user reaches for, so we dynamic-import the pipeline only when a slide
// is first rendered - keeping it out of the initial chunk. The promise is
// cached at module scope so the chunk is fetched once and reused.
// ---------------------------------------------------------------------------

let renderMarkdownBodyPromise: Promise<typeof RenderMarkdownBody> | null = null

function lazyRenderMarkdownBody(md: string): Promise<string> {
  renderMarkdownBodyPromise ??= import('@renderer/export/buildHtml').then(
    (m) => m.renderMarkdownBody,
  )
  return renderMarkdownBodyPromise.then((render) => render(md))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresentationProps {
  /** Whether the overlay is visible. */
  open: boolean
  /** Pre-split slide strings (from splitSlides). */
  slides: string[]
  /**
   * Async function that renders a single slide's markdown to an HTML string.
   * Defaults to `renderMarkdownBody`. Inject a stub in tests to avoid async
   * mermaid/katex rendering.
   */
  renderSlide?: (md: string) => Promise<string>
  /** Called when the user exits (Esc or any exit gesture). */
  onExit: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Presentation({
  open,
  slides,
  renderSlide = lazyRenderMarkdownBody,
  onExit,
}: PresentationProps) {
  const [index, setIndex] = useState(0)
  // Cache rendered HTML per slide index so we don't re-render on navigation.
  const [renderedCache, setRenderedCache] = useState<Record<number, string>>({})
  // Ref to the slide container for injecting innerHTML (avoids dangerouslySetInnerHTML
  // re-renders fighting with focus/scroll state).
  const slideRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Track the latest open value for the keydown listener (closure safety).
  // Updated in useLayoutEffect (before paint) so it is always current before
  // any async events fire, without mutating the ref during render.
  const openRef = useRef(open)
  useLayoutEffect(() => {
    openRef.current = open
  })

  // Confine Tab/Shift+Tab to the presentation overlay while it is open.
  useFocusTrap(overlayRef, open)

  const total = slides.length

  // Render the current slide (and eagerly pre-render the next one).
  // This effect fires when index changes or when the slide array / renderSlide fn changes.
  useEffect(() => {
    if (!open) return

    function renderAt(i: number): void {
      if (i < 0 || i >= slides.length) return
      const md = slides[i] ?? ''
      // Enqueue the async render; on completion store the HTML in the cache.
      // Use the functional updater to avoid stale closure over `renderedCache`.
      setRenderedCache((prev) => {
        if (prev[i] !== undefined) return prev // already cached - skip
        void renderSlide(md).then((html) => {
          setRenderedCache((p) => ({ ...p, [i]: html }))
        })
        return prev // no synchronous state change
      })
    }

    renderAt(index)
    renderAt(index + 1) // pre-render next slide for smooth navigation
  }, [open, index, slides, renderSlide])

  // Inject the rendered HTML into the slide container whenever the cache or
  // index changes. This updates the DOM directly (innerHTML) so it bypasses
  // React's reconciler for the slide content - avoiding issues with KaTeX/hljs
  // nodes that React would otherwise try to reconcile.
  useEffect(() => {
    const el = slideRef.current
    if (!el) return
    const html = renderedCache[index]
    if (html !== undefined) {
      el.innerHTML = html
    }
  }, [renderedCache, index])

  // Navigation helpers.
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0)))
  }, [total])

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0))
  }, [])

  const goFirst = useCallback(() => { setIndex(0) }, [])

  const goLast = useCallback(() => {
    setIndex(Math.max(total - 1, 0))
  }, [total])

  // Keyboard handler - attached to document so it captures focus anywhere.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!openRef.current) return

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
          e.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault()
          goPrev()
          break
        case 'Home':
          e.preventDefault()
          goFirst()
          break
        case 'End':
          e.preventDefault()
          goLast()
          break
        case 'Escape':
          e.preventDefault()
          onExit()
          break
        default:
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [goNext, goPrev, goFirst, goLast, onExit])

  if (!open) return null

  const counterLabel = total > 0 ? `${index + 1} / ${total}` : '0 / 0'

  return (
    <div
      ref={overlayRef}
      className="pres-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Presentation"
    >
      {/* Left click zone - go to previous slide */}
      <div
        className="pres__click-prev"
        onClick={goPrev}
        aria-label="Previous slide"
      />

      {/* Right click zone - go to next slide */}
      <div
        className="pres__click-next"
        onClick={goNext}
        aria-label="Next slide"
      />

      {/* Slide content */}
      <div className="pres__stage">
        <div className="pres__slide markdown-body" ref={slideRef} />
      </div>

      {/* Slide counter */}
      <div className="pres__counter" aria-live="polite" aria-atomic="true">
        {counterLabel}
      </div>
    </div>
  )
}
