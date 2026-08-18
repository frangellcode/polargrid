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
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (mode === displayedMode) return
    setIsExiting(true)
    const t = setTimeout(() => {
      setDisplayedMode(mode)
      setIsExiting(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [mode, displayedMode])

  useEffect(() => {
    setEntered(false)
  }, [displayedMode])

  // The view-enter animation ends on translateY(0) scale(1) — visually a
  // no-op, but `animation: ... both` keeps that transform (and the
  // compositing layer it creates) applied forever instead of clearing it.
  // iOS Safari can leave taps "dead" on buttons inside a permanently
  // transformed/composited layer, which is why the toolbar buttons stopped
  // responding after switching screens. Dropping the class once the
  // animation finishes returns the view to a plain box and restores taps.
  const viewClassName = isExiting ? 'view-exit' : entered ? '' : 'view-enter'

  return (
    <div className="h-full w-full overflow-hidden">
      <div
        key={displayedMode}
        className={`h-full w-full ${viewClassName}`}
        onAnimationEnd={() => setEntered(true)}
      >
        {renderView(displayedMode)}
      </div>
    </div>
  )
}

export default App
