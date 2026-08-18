import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initServiceWorkerUpdates } from './lib/pwaUpdate'
import { initAppHeightVar } from './lib/viewportHeight'

initServiceWorkerUpdates()
initAppHeightVar()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
