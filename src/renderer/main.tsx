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
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

// Surface otherwise-silent async failures. A rejected promise with no .catch or
// an error thrown outside React's render path would vanish without these; log
// them so they are visible in the console / devtools.
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
})
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error ?? event.message)
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
