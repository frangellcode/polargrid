import { useEffect, useState } from 'react'
import { useEditorStore } from './store/editorStore'
import { HomeScreen } from './components/HomeScreen'
import { BorderEditor } from './components/editor/BorderEditor'
import { CollageEditor } from './components/editor/CollageEditor'
import type { AppMode } from './types'

const EXIT_MS = 140

function renderView(mode: AppMode) {
  if (mode === 'home') return <HomeScreen />
  if (mode === 'border') return <BorderEditor />
  return <CollageEditor />
}

function App() {
  const mode = useEditorStore((s) => s.mode)
  const [displayedMode, setDisplayedMode] = useState(mode)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (mode === displayedMode) return
    setIsExiting(true)
    const t = setTimeout(() => {
      setDisplayedMode(mode)
      setIsExiting(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [mode, displayedMode])

  return (
    <div className="h-dvh w-full overflow-hidden">
      <div key={displayedMode} className={`h-full w-full ${isExiting ? 'view-exit' : 'view-enter'}`}>
        {renderView(displayedMode)}
      </div>
    </div>
  )
}

export default App
