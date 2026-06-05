// Allow importing CSS files in the renderer (Vite handles the actual transform).
declare module '*.css' {
  const styles: Record<string, string>
  export default styles
}

// Allow importing CSS files as raw strings via Vite's ?raw query.
// The actual raw-string transform only runs at dev/build time; in tests the
// vitest rawImportStub plugin resolves these to empty strings.
declare module '*.css?raw' {
  const content: string
  export default content
}

// Generic ?raw module - covers non-CSS raw imports (e.g. katex/dist/katex.min.css?raw).
declare module '*?raw' {
  const content: string
  export default content
}
