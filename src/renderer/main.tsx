import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
// tokens.css is the design-token contract (Layer 1 palette + Layer 2 semantic
// tokens + layout/font defaults). It MUST be imported before global.css and the
// theme files so its :root defaults exist for everything that follows.
import './styles/tokens.css'
import './styles/global.css'
// All theme files are bundled together. Switching themes is instant: setting
// document.documentElement.dataset.theme selects the active token override.
// github.css holds the default (light) component rules; the token defaults live
// in tokens.css. night.css and sepia.css each override the universal design
// tokens under their [data-theme="..."] selector.
import './styles/themes/github.css'
import './styles/themes/night.css'
import './styles/themes/graphite.css'
import './styles/themes/sepia.css'
import './styles/themes/solarized-light.css'
import './styles/themes/solarized-dark.css'
import './styles/themes/nord.css'
import './styles/themes/high-contrast.css'
import './styles/themes/midnight.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { applyCachedThemeEarly } from './themes/index'

// Apply the last-used theme synchronously, before the first paint, so dark-theme
// users do not see a white -> dark flash while the async settings load runs.
// useStartup re-applies the authoritative theme from settings a moment later.
applyCachedThemeEarly()

// Surface otherwise-silent async failures. A rejected promise with no .catch or
// an error thrown outside React's render path would vanish without these; log
// them so they are visible in the console / devtools.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
})
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error ?? event.message)
})

// Global drag-and-drop guard: a file dropped anywhere we do NOT explicitly
// handle (title bar, status bar, gaps) would otherwise make the browser try to
// navigate the window to that file. Our drop targets call stopPropagation, so
// these bubble-phase listeners only fire for UNHANDLED drops - swallowing them
// keeps a stray drop from doing anything. (Handlers run on the target first.)
window.addEventListener('dragover', (event) => {
  if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault()
})
window.addEventListener('drop', (event) => {
  if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault()
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
