/**
 * Lazy loaders for the HTML export pipeline (buildHtml.ts), shared by every
 * caller that copies/exports as HTML.
 *
 * buildHtml pulls in katex, highlight.js and the markdown-it stack - none of
 * which are needed until the user actually exports or copies as HTML - so it
 * is dynamic-imported on first use and kept out of the initial renderer chunk.
 * One cached import backs both accessors:
 *   - buildExportHtml   -> a full <!DOCTYPE html> document (Export to file).
 *   - renderMarkdownBody -> a body fragment (clipboard "Copy as HTML"; a full
 *     document on the clipboard's HTML flavor is rejected by many rich-paste
 *     targets, which then fall back to plain text).
 */
import type * as BuildHtmlModule from '@renderer/export/buildHtml'

type BuildExportHtml = typeof BuildHtmlModule.buildExportHtml
type RenderMarkdownBody = typeof BuildHtmlModule.renderMarkdownBody

let modulePromise: Promise<typeof BuildHtmlModule> | null = null

function loadModule(): Promise<typeof BuildHtmlModule> {
  modulePromise ??= import('@renderer/export/buildHtml')
  return modulePromise
}

export function loadBuildExportHtml(): Promise<BuildExportHtml> {
  return loadModule().then((m) => m.buildExportHtml)
}

export function loadRenderMarkdownBody(): Promise<RenderMarkdownBody> {
  return loadModule().then((m) => m.renderMarkdownBody)
}
