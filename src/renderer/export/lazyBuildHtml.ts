/**
 * Lazy loader for the HTML export pipeline (buildHtml.ts), shared by every
 * caller that copies/exports as HTML.
 *
 * buildHtml pulls in katex, highlight.js and the markdown-it stack - none of
 * which are needed until the user actually exports or copies as HTML - so it
 * is dynamic-imported on first use and kept out of the initial renderer chunk.
 * The promise is cached at module scope, so the chunk is fetched once and
 * reused for every subsequent call.
 */
import type { buildExportHtml as BuildExportHtml } from '@renderer/export/buildHtml'

let buildExportHtmlPromise: Promise<typeof BuildExportHtml> | null = null

export function loadBuildExportHtml(): Promise<typeof BuildExportHtml> {
  buildExportHtmlPromise ??= import('@renderer/export/buildHtml').then(
    (m) => m.buildExportHtml,
  )
  return buildExportHtmlPromise
}
