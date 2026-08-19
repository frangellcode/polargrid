import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useEditorStore } from './store/editorStore'
import { HomeScreen } from './components/HomeScreen'
import { BorderEditor } from './components/editor/BorderEditor'
import { CollageEditor } from './components/editor/CollageEditor'
import { Logo } from './components/Logo'
import type { AppMode } from './types'

const EXIT_MS = 200

// Boot splash timing: index.html paints a static centered logo (size
// BOOT_LOGO_SIZE) instantly, before any JS runs, so cold starts never show a
// bare screen. Once React mounts, a matching floating logo takes over that
// exact spot (no flash — see the `boot` state machine below), holds for
// BOOT_HOLD_MS so the branded splash actually registers, then flies to where
// the logo sits inside HomeScreen while the rest of Home's text fades in.
const BOOT_LOGO_SIZE = 72
const BOOT_HOLD_MS = 700
const BOOT_FLIGHT_MS = 900

type BootStage = 'hold' | 'flying' | 'done'

interface HomeRenderProps {
  logoHidden: boolean
  contentVisible: boolean
  logoRef: (node: HTMLDivElement | null) => void
}

function renderView(mode: AppMode, homeProps: HomeRenderProps) {
  if (mode === 'home') return <HomeScreen {...homeProps} />
  if (mode === 'border') return <BorderEditor />
  return <CollageEditor />
}

function App() {
  const mode = useEditorStore((s) => s.mode)
  const [displayedMode, setDisplayedMode] = useState(mode)
  const [isExiting, setIsExiting] = useState(false)
  const [entered, setEntered] = useState(false)

  // Boot splash: only ever runs for the very first Home render (the store's
  // initial mode is always 'home', so this always applies on cold start).
  const [bootStage, setBootStage] = useState<BootStage>(displayedMode === 'home' ? 'hold' : 'done')
  const [flightStyle, setFlightStyle] = useState<CSSProperties>({
    transform: 'translate(-50%, -50%)',
    transition: 'none',
  })
  const homeLogoNode = useRef<HTMLDivElement | null>(null)
  const setHomeLogoRef = (node: HTMLDivElement | null) => {
    homeLogoNode.current = node
  }

  // The boot flight *is* this screen's entrance — once it's done, `entered`
  // must already read true, otherwise the generic view-enter fade (which
  // only ever gets skipped, never actually played, during boot) kicks in
  // right after and replays a full fade/slide on content that's already
  // sitting there, reading as a flicker.
  const finishBoot = () => {
    setBootStage('done')
    setEntered(true)
  }

  useLayoutEffect(() => {
    if (bootStage !== 'hold') return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => {
      const node = homeLogoNode.current
      if (node && !reduceMotion) {
        const rect = node.getBoundingClientRect()
        const dx = rect.left + rect.width / 2 - window.innerWidth / 2
        const dy = rect.top + rect.height / 2 - window.innerHeight / 2
        const scale = rect.width / BOOT_LOGO_SIZE
        setFlightStyle({
          transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})`,
          transition: `transform ${BOOT_FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        })
        setBootStage('flying')
      } else {
        finishBoot()
      }
    }, BOOT_HOLD_MS)
    return () => clearTimeout(t)
  }, [bootStage])

  useEffect(() => {
    if (mode === displayedMode) return
    setIsExiting(true)
    const t = setTimeout(() => {
      // Reset the screen we're leaving only now, once it's fully faded out and
      // about to be swapped for the new one — resetting eagerly (e.g. from the
      // back button's own onClick) wiped the photo/collage state while that
      // screen was still visible mid-fade, snapping its canvas to the empty
      // Dropzone right in front of the user.
      if (displayedMode === 'border') useEditorStore.getState().resetBorder()
      if (displayedMode === 'collage') useEditorStore.getState().resetCollage()
      setDisplayedMode(mode)
      setIsExiting(false)
      // Must land in the same batch as setDisplayedMode above, not in a
      // separate effect keyed on displayedMode — that ran one tick later, so
      // the freshly-mounted screen's first paint still saw the *previous*
      // screen's stale `entered: true` and skipped the view-enter class
      // entirely. It popped in fully visible with no fade, then the class
      // landed a frame later and restarted the animation from its opacity-0
      // "from" state on already-visible content — the actual jump reported.
      setEntered(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [mode, displayedMode])

  // The view-enter animation ends on translateY(0) scale(1) — visually a
  // no-op, but `animation: ... both` keeps that transform (and the
  // compositing layer it creates) applied forever instead of clearing it.
  // iOS Safari can leave taps "dead" on buttons inside a permanently
  // transformed/composited layer, which is why the toolbar buttons stopped
  // responding after switching screens. Dropping the class once the
  // animation finishes returns the view to a plain box and restores taps.
  // Suppressed entirely during the boot splash's first Home render — the
  // splash's own logo-flight + text-fade choreography is the entrance there,
  // and layering the generic slide/scale on top would both double up and
  // shift the logo mid-measurement.
  const booting = displayedMode === 'home' && bootStage !== 'done'
  const viewClassName = isExiting ? 'view-exit' : entered || booting ? '' : 'view-enter'

  return (
    // fixed + inset-0 instead of h-full: sizing this off a height:100%
    // chain (html -> body -> #root -> this wrapper) depends on every link
    // computing a definite height, and -webkit-fill-available/dvh have
    // both been observed not propagating reliably through that many
    // nested layers in some Safari/WebKit contexts (confirmed against
    // neonfinanzas, which sidesteps the whole chain the same way for its
    // own app shell). fixed + inset-0 is pinned to the viewport directly,
    // no ancestor height involved at all.
    <div className="fixed inset-0 overflow-hidden bg-ink-900">
      <div
        key={displayedMode}
        className={`h-full w-full ${viewClassName}`}
        onAnimationEnd={() => setEntered(true)}
      >
        {renderView(displayedMode, {
          logoHidden: booting,
          // Home's text starts fading in as soon as the logo takes off
          // (rather than waiting for it to land) so the two read as one
          // continuous motion instead of a flight, then a separate fade.
          contentVisible: !booting || bootStage === 'flying',
          logoRef: setHomeLogoRef,
        })}
      </div>

      {bootStage !== 'done' && (
        <div
          className="pointer-events-none fixed left-1/2 top-1/2 z-50"
          style={flightStyle}
          onTransitionEnd={finishBoot}
        >
          <Logo size={BOOT_LOGO_SIZE} />
        </div>
      )}
    </div>
  )
}

export default App
