import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './styles/global.css'
// All theme files are bundled together. Switching themes is instant: setting
// document.documentElement.dataset.theme selects the active token override.
// github.css defines the :root defaults (light). night.css and sepia.css each
// override the universal design tokens under their [data-theme="..."] selector.
import './styles/themes/github.css'
import './styles/themes/night.css'
import './styles/themes/graphite.css'
import './styles/themes/sepia.css'
import './styles/themes/solarized-light.css'
import './styles/themes/solarized-dark.css'
import './styles/themes/nord.css'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
