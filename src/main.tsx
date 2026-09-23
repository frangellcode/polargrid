import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled instead of fetched from Google Fonts: the app promises to work with
// no connection from the very first launch, and the App Store build must not
// reach out to a third party just to draw its own UI.
import '@fontsource/syne/latin-500.css'
import '@fontsource/syne/latin-700.css'
import '@fontsource/jost/latin-300.css'
import '@fontsource/jost/latin-400.css'
import '@fontsource/jost/latin-500.css'
import './index.css'
import App from './App.tsx'
import { isNativeApp } from './lib/native'
import { initServiceWorkerUpdates } from './lib/pwaUpdate'

// Deploy marker: a real statement, not a comment — comments get stripped by
// the production minifier, so earlier "marker" commits never actually
// changed the built bundle's bytes at all, which is why no update was ever
// detected for them. This one has a runtime effect, so it can't disappear.
console.log(`[PolarGrid] build marker: deploy-test-5, built ${new Date().toISOString()}`)

// The App Store delivers the native build's updates; a service worker there
// would only be a second, competing cache of the same files.
if (!isNativeApp) initServiceWorkerUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
