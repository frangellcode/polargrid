import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initServiceWorkerUpdates } from './lib/pwaUpdate'

// Deploy marker v3 — waiting out the GH Pages sw.js cache window before checking this one.

initServiceWorkerUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
