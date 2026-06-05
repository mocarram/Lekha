// Allow importing CSS files in the renderer (Vite handles the actual transform).
declare module '*.css' {
  const styles: Record<string, string>
  export default styles
}
