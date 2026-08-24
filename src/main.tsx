import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initServiceWorkerUpdates } from './lib/pwaUpdate'

// Deploy marker: a real statement, not a comment — comments get stripped by
// the production minifier, so earlier "marker" commits never actually
// changed the built bundle's bytes at all, which is why no update was ever
// detected for them. This one has a runtime effect, so it can't disappear.
console.log(`[PolarGrid] build marker: deploy-test-5, built ${new Date().toISOString()}`)

initServiceWorkerUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
