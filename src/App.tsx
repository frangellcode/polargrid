import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useEditorStore } from './store/editorStore'
import { HomeScreen } from './components/HomeScreen'
import { BorderEditor } from './components/editor/BorderEditor'
import { CollageEditor } from './components/editor/CollageEditor'
import { Logo } from './components/Logo'
import { useUpdateStore } from './store/updateStore'
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

// "Update" replay: reuses the exact same floating-logo trick as the boot
// splash, just run in reverse first. Tapping "Actualizar app" sends the home
// logo back to the center (growing, text fading out — same motion as boot
// but backwards) and holds there while a progress bar fills 0->100. At 100%,
// applyUpdate() activates the waiting service worker, which triggers a real
// window.location.reload() (see pwaUpdate.ts's onNeedReload) — so the
// "flies back out to home" tail below usually never gets to play; the
// reload re-runs this whole boot sequence from scratch instead, which reads
// just as well as the app "restarting" and actually serves the new build.
const UPDATE_FLIGHT_MS = 700
const UPDATE_PROGRESS_MS = 5000
const UPDATE_HOLD_MS = 300

type UpdatePhase = 'idle' | 'toCenter' | 'progress' | 'toHome'

interface HomeRenderProps {
  logoHidden: boolean
  contentVisible: boolean
  logoRef: (node: HTMLDivElement | null) => void
  updating: boolean
  onUpdateStart: () => void
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

  // Update replay state (see UPDATE_* constants above).
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle')
  const [updateFlightStyle, setUpdateFlightStyle] = useState<CSSProperties>({
    transform: 'translate(-50%, -50%)',
    transition: 'none',
  })
  const [updateProgress, setUpdateProgress] = useState(0)
  const [barExiting, setBarExiting] = useState(false)
  // Home rect captured once at the start of the replay, reused unchanged to
  // fly the logo back out — re-measuring later would race the content fade.
  const updateHomeRect = useRef({ dx: 0, dy: 0, scale: 1 })
  // False when there's no logo to fly (or the user prefers reduced motion):
  // the replay still runs (progress bar, cache purge) but skips straight to
  // idle afterwards instead of queuing a `toHome` flight that would never fire.
  const updateFlightEnabled = useRef(false)

  const beginUpdate = () => {
    const node = homeLogoNode.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    updateFlightEnabled.current = Boolean(node) && !reduceMotion

    if (!updateFlightEnabled.current) {
      setUpdatePhase('progress')
      return
    }

    const rect = node!.getBoundingClientRect()
    updateHomeRect.current = {
      dx: rect.left + rect.width / 2 - window.innerWidth / 2,
      dy: rect.top + rect.height / 2 - window.innerHeight / 2,
      scale: rect.width / BOOT_LOGO_SIZE,
    }
    const { dx, dy, scale } = updateHomeRect.current
    // Pinned exactly over the real (about-to-hide) home logo, no transition —
    // same invisible-swap trick the boot splash lands with, just starting here.
    setUpdateFlightStyle({
      transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})`,
      transition: 'none',
    })
    setUpdatePhase('toCenter')
  }

  // Kicks off the actual transform transitions a frame after the phase flips,
  // so the "no transition" starting style above has time to paint first.
  useLayoutEffect(() => {
    if (updatePhase === 'toCenter') {
      const raf = requestAnimationFrame(() => {
        setUpdateFlightStyle({ transform: 'translate(-50%, -50%)', transition: `transform ${UPDATE_FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` })
      })
      return () => cancelAnimationFrame(raf)
    }
    if (updatePhase === 'toHome') {
      const { dx, dy, scale } = updateHomeRect.current
      const raf = requestAnimationFrame(() => {
        setUpdateFlightStyle({
          transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})`,
          transition: `transform ${UPDATE_FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        })
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [updatePhase])

  // Fills the progress bar 0->100 over UPDATE_PROGRESS_MS, activates the
  // real pending service worker once it's full, then either flies the logo
  // back home or (no-motion path) jumps straight to idle.
  useEffect(() => {
    if (updatePhase !== 'progress') return
    setUpdateProgress(0)
    setBarExiting(false)
    const start = performance.now()
    let frame: number
    const tick = (now: number) => {
      const elapsed = now - start
      const pct = Math.min(100, Math.round((elapsed / UPDATE_PROGRESS_MS) * 100))
      setUpdateProgress(pct)
      if (elapsed < UPDATE_PROGRESS_MS) {
        frame = requestAnimationFrame(tick)
        return
      }
      useUpdateStore.getState().applyUpdate()
      setBarExiting(true)
      setTimeout(() => {
        setUpdatePhase(updateFlightEnabled.current ? 'toHome' : 'idle')
      }, UPDATE_HOLD_MS)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [updatePhase])

  const updating = updatePhase !== 'idle'

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
          logoHidden: booting || updating,
          // Home's text starts fading in as soon as the logo takes off
          // (rather than waiting for it to land) so the two read as one
          // continuous motion instead of a flight, then a separate fade.
          // Hidden outright while the update replay owns the logo.
          contentVisible: (!booting || bootStage === 'flying') && !updating,
          logoRef: setHomeLogoRef,
          updating,
          onUpdateStart: beginUpdate,
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

      {updating && (
        <div
          // Logo only, sized fixed (BOOT_LOGO_SIZE) — the progress bar below is a
          // separate element on purpose. Nesting it here made this box's own
          // height (and therefore where translate(-50%,-50%) lands) shift the
          // instant the bar mounted/unmounted, snapping the logo mid-flight.
          className="pointer-events-none fixed left-1/2 top-1/2 z-50"
          style={updateFlightStyle}
          onTransitionEnd={() => {
            if (updatePhase === 'toCenter') setUpdatePhase('progress')
            if (updatePhase === 'toHome') setUpdatePhase('idle')
          }}
        >
          <Logo size={BOOT_LOGO_SIZE} />
        </div>
      )}

      {updatePhase === 'progress' && (
        <div
          className={`pointer-events-none fixed left-1/2 top-[calc(50%+64px)] z-50 flex w-48 -translate-x-1/2 flex-col items-center gap-2 fade-in transition-opacity duration-300 ${barExiting ? 'opacity-0' : 'opacity-100'}`}
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-white" style={{ width: `${updateProgress}%` }} />
          </div>
          <span className="font-label text-[10px] font-light uppercase tracking-[0.14em] text-white/50">
            Actualizando… {updateProgress}%
          </span>
        </div>
      )}
    </div>
  )
}

export default App
