import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initServiceWorkerUpdates } from './lib/pwaUpdate'

// Deploy marker to test the pending-update badge — safe to remove anytime.

initServiceWorkerUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
