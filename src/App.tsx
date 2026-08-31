import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, TransitionEventHandler } from 'react'
import { useEditorStore } from './store/editorStore'
import { useTranslation } from './store/languageStore'
import { HomeScreen } from './components/HomeScreen'
import { BorderEditor } from './components/editor/BorderEditor'
import { CollageEditor } from './components/editor/CollageEditor'
import { flushSync } from 'react-dom'
import { useUpdateStore } from './store/updateStore'
import type { AppMode } from './types'

const EXIT_MS = 200

// Boot splash timing: index.html paints a static centered logo (HOME_LOGO_SIZE
// px) instantly, before any JS runs, so cold starts never show a bare screen.
// That element stays up, untouched, for BOOT_HOLD_MS — React renders behind
// it — and is then removed at the exact frame HomeScreen's own logo starts
// flying to its resting place, while the rest of Home's text fades in. See the
// boot effect below for why the handoff has to happen inside the motion.
const BOOT_HOLD_MS = 700
const BOOT_FLIGHT_MS = 900
// Backstop margin for the transitionend handlers below. Every handoff in this
// file (boot flight -> Home, update flight -> progress bar) hangs off a single
// transitionend, and a missed one doesn't degrade — it strands the app: boot
// leaves bootStage on 'flying' forever, which makes beginUpdate bail on its
// first line, silently killing the Update button for the rest of the session;
// the update flight leaves updatePhase on 'toCenter', which keeps
// contentVisible false and leaves a blank screen with a centred logo and no
// way out. transitionend is not guaranteed (a backgrounded/suspended tab can
// swallow it — this is a home-screen PWA, so that happens), so each one gets a
// timer that reaches the same state if the event never lands.
const TRANSITION_BACKSTOP_MS = 200

type BootStage = 'hold' | 'flying' | 'done'

/**
 * Centre of the box `position: fixed` resolves against — measured with a
 * throwaway probe rather than assumed from window.innerWidth/innerHeight.
 *
 * Used by the UPDATE flight, which has to send the logo to the spot the NEXT
 * page's splash will occupy: that splash is flex-centred inside a
 * `position: fixed; inset: 0` box, which is exactly what this probe measures.
 * window.innerWidth/innerHeight is not that point on iOS — it reports the
 * VISUAL viewport, which drifts from the layout viewport fixed positioning
 * resolves against (safe-area insets under `viewport-fit=cover`, the home
 * indicator, a collapsing address bar). The two agree exactly on desktop,
 * which is why assuming them never showed up as wrong in testing here.
 *
 * The BOOT flight does not use this: it measures the splash element itself,
 * which is still on screen at that point.
 */
function fixedViewportCenter() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none'
  document.body.appendChild(probe)
  const rect = probe.getBoundingClientRect()
  probe.remove()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

// "Update" replay: the boot flight run in reverse, on the same element.
// Tapping "Update app" sends the home logo back to the center (text fading
// out — the boot motion backwards) and holds there while a bar fills 0->100.
// At 100%,
// applyUpdate() activates the waiting service worker, which triggers a real
// window.location.reload() (see pwaUpdate.ts's onNeedReload — plus a
// belt-and-suspenders backup timeout right below) — which re-runs this whole
// boot sequence from scratch, reading just as well as the app "restarting"
// and actually serving the new build. There USED to be a "fly the logo back
// out to home" tail played while waiting for that reload, on the theory it
// "usually" wouldn't get to finish before the reload cut it off — but
// "usually" isn't "always": whenever the reload landed mid-flight instead of
// before it started, the fresh boot sequence's own hold-then-fly replayed
// hard on top of the half-finished reverse flight, reading as a visible
// double-bounce glitch (down, snap, up again). Since a reload is guaranteed
// shortly after 100% either way, that tail could only ever race the reload,
// never reliably win — removed rather than tuned, since no timing here is
// actually safe from that race.
const UPDATE_FLIGHT_MS = 700
const UPDATE_PROGRESS_MS = 5000
// The bar used to reach 100% and start disappearing in the same React commit
// (the tick that satisfies elapsed >= UPDATE_PROGRESS_MS set the percentage
// AND began the exit, and both batch into one render), so the finished state
// was never actually on screen for a readable beat — it went 99% straight to
// a vanishing 100%. Hold it there first.
const UPDATE_HOLD_AT_100_MS = 450
// How long to wait for the new worker to take over before forcing the reload
// ourselves. pwaUpdate.ts's onNeedReload normally gets there first; this is
// for iOS Safari's long-standing bug where an already-open standalone PWA
// never receives controllerchange for an existing client. Longer than the old
// 1200ms because a reload fired before the new worker has actually claimed
// the page is served by the OLD one — i.e. it quietly reinstalls the same
// build — and there's no longer any reason to rush: the bar stays on screen
// saying "restarting" for this whole window instead of leaving a dead,
// frozen screen the way the old fade-out did.
const UPDATE_RELOAD_FALLBACK_MS = 2500

type UpdatePhase = 'idle' | 'toCenter' | 'progress' | 'restarting'

interface HomeRenderProps {
  contentVisible: boolean
  logoRef: (node: HTMLDivElement | null) => void
  logoStyle: CSSProperties
  onLogoTransitionEnd: TransitionEventHandler<HTMLDivElement>
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
  const tr = useTranslation()
  const [displayedMode, setDisplayedMode] = useState(mode)
  const [isExiting, setIsExiting] = useState(false)
  const [entered, setEntered] = useState(false)

  // Boot splash: only ever runs for the very first Home render (the store's
  // initial mode is always 'home', so this always applies on cold start).
  const [bootStage, setBootStage] = useState<BootStage>(displayedMode === 'home' ? 'hold' : 'done')
  const homeLogoNode = useRef<HTMLDivElement | null>(null)
  const setHomeLogoRef = (node: HTMLDivElement | null) => {
    homeLogoNode.current = node
  }

  // Update replay state (see UPDATE_* constants above).
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle')
  const [updateProgress, setUpdateProgress] = useState(0)

  /**
   * The one transform driving every logo movement in the app — boot flight and
   * update flight both — applied to HomeScreen's OWN logo.
   *
   * There used to be a separate `position: fixed` clone for each, flown into
   * place and then swapped for the real logo by unmounting it. The swap was
   * exact on paper and measured exact in the browser (both centres landed on
   * 250, 235.75 to the last decimal) — and the logo still visibly hopped on
   * landing. The reason is that the offset is fractional: measured here it was
   * `translate(0px, -257.25px)`. A transformed element gets its own compositing
   * layer, which the browser rasterises and places on the device-pixel grid,
   * while the plain in-flow logo it was swapped for is drawn at its true
   * fractional position with sub-pixel antialiasing. Identical geometry, two
   * different renderings — so the instant the clone unmounted, the mark shifted
   * by up to half a CSS pixel (1.5 device pixels at the 3x DPR of a phone).
   * That is the small jump.
   *
   * Moving the real logo instead makes the landing correct by construction
   * rather than by measurement: the flight ends at `transform: none`, which is
   * not a position we compute but simply the element where layout already put
   * it, with no compositing layer left behind. There is no swap left to hop,
   * and a mis-measurement can now only nudge where the flight STARTS (a static
   * centred logo, where it cannot be seen) instead of where it lands.
   */
  const [logoStyle, setLogoStyle] = useState<CSSProperties>({})

  /** Offset that moves the home logo to the exact centre of the viewport —
   *  i.e. onto index.html's pre-JS splash logo. Null when there's nothing to
   *  measure yet. */
  const centerOffset = () => {
    const node = homeLogoNode.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const target = fixedViewportCenter()
    return {
      dx: target.x - (rect.left + rect.width / 2),
      dy: target.y - (rect.top + rect.height / 2),
    }
  }

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /**
   * Both flights cross Home's own text while it is fading (out on update, in
   * on boot), so the logo has to be painted above it — the fixed clone this
   * replaced was z-50 and got that for free. `position: relative` is only
   * here to make z-index apply; it changes no layout.
   *
   * `will-change` is what keeps the logo on ONE compositing layer for the
   * whole sequence. Without it the browser promotes it only once the
   * transition actually starts, and a layer being created mid-sequence is
   * re-snapped to the device-pixel grid as it appears — a visible twitch
   * right before the logo sets off. Declaring it up front means the promotion
   * has already happened while nothing is moving.
   *
   * All three are dropped when the flight lands, so the resting logo is a
   * plain static box again: no stacking context, no layer, no transform.
   */
  const flightStyle = (transform: string | undefined, transition: string): CSSProperties => ({
    position: 'relative',
    zIndex: 50,
    willChange: 'transform',
    transform,
    transition,
  })

  const beginUpdate = () => {
    // The update button sits inside HomeScreen's own content, which starts
    // accepting taps as soon as `bootStage` reaches 'flying' (contentVisible
    // flips true then, ~BOOT_HOLD_MS in) — but the boot flight itself keeps
    // running for another BOOT_FLIGHT_MS after that, fully independent of
    // updatePhase. A tap landing in that window used to start THIS flight
    // (toCenter, its own logo, its own transform) while the boot flight's
    // OWN logo was still independently animating toward the exact same
    // spot — two uncoordinated Logo elements racing/colliding, which is
    // what read as the logo "moving erratically". Bail until the boot
    // sequence has fully settled; a tap during that (sub-second, and only
    // reachable by tapping the instant the app appears) window is simply
    // ignored rather than kicking off a second animation on top of the
    // first.
    if (bootStage !== 'done') return
    const offset = centerOffset()
    // Nothing to fly (or motion is unwelcome): go straight to the bar.
    if (!offset || prefersReducedMotion()) {
      setUpdatePhase('progress')
      return
    }
    // The logo is already sitting at rest with no transform, so this single
    // declaration IS the whole flight — no pinning pass, no waiting a frame
    // for a "transition: none" start state to paint first.
    setLogoStyle(
      flightStyle(
        `translate(${offset.dx}px, ${offset.dy}px)`,
        `transform ${UPDATE_FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      ),
    )
    setUpdatePhase('toCenter')
  }

  // See TRANSITION_BACKSTOP_MS: without this a swallowed transitionend strands
  // the app on a blank screen with a centred logo, permanently. Reaching
  // 'progress' twice is harmless — the setState is idempotent.
  useEffect(() => {
    if (updatePhase !== 'toCenter') return
    const backstop = setTimeout(
      () => setUpdatePhase((p) => (p === 'toCenter' ? 'progress' : p)),
      UPDATE_FLIGHT_MS + TRANSITION_BACKSTOP_MS,
    )
    return () => clearTimeout(backstop)
  }, [updatePhase])

  // Fills the progress bar 0->100 over UPDATE_PROGRESS_MS, then activates
  // the real pending service worker, which reloads the page shortly after
  // (see the belt-and-suspenders backup below too) — re-running the whole
  // boot sequence fresh instead of animating anything back here.
  useEffect(() => {
    if (updatePhase !== 'progress') return
    setUpdateProgress(0)
    const start = performance.now()
    let frame: number
    let hold: ReturnType<typeof setTimeout>
    const tick = (now: number) => {
      const elapsed = now - start
      // Driven off elapsed wall-clock rather than a per-frame increment, so
      // leaving the app mid-update (rAF stops in a backgrounded tab, and an
      // update is exactly when someone switches away) resumes at the right
      // place instead of stalling — it just catches up in one step.
      setUpdateProgress(Math.min(100, Math.round((elapsed / UPDATE_PROGRESS_MS) * 100)))
      if (elapsed < UPDATE_PROGRESS_MS) {
        frame = requestAnimationFrame(tick)
        return
      }
      // Let the finished bar actually be seen before anything else moves.
      hold = setTimeout(() => setUpdatePhase('restarting'), UPDATE_HOLD_AT_100_MS)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(hold)
    }
  }, [updatePhase])

  // Everything from "the bar is full" to "the new build is on screen". The bar
  // deliberately stays put here, full, with its label switched to "restarting"
  // — it does NOT fade out. The old version faded it over 300ms and then had
  // nothing at all on screen until the reload landed (up to 1.2s later),
  // followed by another 700ms of boot hold: up to ~1.9s in which not one pixel
  // moved, on a screen whose logo is pixel-identical before and after the
  // reload. That reads as a hang, which is what makes people force-quit or tap
  // Update again. A full bar plus a changed label is the one honest signal
  // that the app is still working, and it survives the reload seamlessly
  // because whatever is on screen is simply replaced by the new document.
  //
  // (That old fade never actually ran, either: the bar carries `.fade-in`,
  // whose `animation: ... both` pins opacity at 1 for the element's whole
  // life, so the `opacity-0` class it was toggling could never win the
  // cascade. The dead air was real; the fade was not.)
  useEffect(() => {
    if (updatePhase !== 'restarting') return
    // Floating promise otherwise — updateServiceWorker is async, and a
    // rejected registration would surface as an unhandled rejection.
    Promise.resolve(useUpdateStore.getState().applyUpdate()).catch(() => {})
    // pwaUpdate.ts's onNeedReload normally beats this. It can't always: the
    // `controlling` listener that fires it is only registered by
    // vite-plugin-pwa inside its waiting-worker prompt, so a session that
    // never saw a waiting worker has no path to it at all — and iOS Safari
    // can skip the event even when it does. If the primary path already
    // reloaded, this is a no-op: navigation is underway.
    const t = setTimeout(() => window.location.reload(), UPDATE_RELOAD_FALLBACK_MS)
    return () => clearTimeout(t)
    // Deliberately never returns to 'idle'. Doing so would reveal Home's real
    // logo and content again well before the reload lands, and the fresh boot
    // splash would then fly the logo into that exact same resting spot a
    // second time — two arrivals in quick succession, reading as a double
    // bounce. A reload is guaranteed either way, so there is nothing to
    // animate back to.
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
    // Clears the transform outright rather than leaving an identity one in
    // place. `transform: translate(0,0)` still pins the element on its own
    // compositing layer — the very thing this file's history blames for dead
    // taps on iOS — and it is also what made the landing render differently
    // from the settled element. Nothing left behind means nothing to differ.
    setLogoStyle({})
  }

  /**
   * The boot hold, and the handoff out of it.
   *
   * index.html's splash stays on screen untouched for the whole hold — it
   * lives outside #root so React never clears it, and it is opaque and full
   * screen, so HomeScreen renders completely hidden behind it. Nothing here
   * measures or moves anything during that time. That matters: the splash is
   * centred by plain CSS inside a `position: fixed` box, so it re-centres
   * itself for whatever the viewport turns out to be — safe-area insets
   * resolving late, the visual viewport settling after a reload — with no JS
   * assumption that could be a pixel off.
   *
   * Two earlier attempts instead put React's logo on the splash's spot for the
   * whole hold and swapped the two while both were stationary: first by flying
   * a clone and unmounting it, then by transforming the real logo onto a
   * computed centre. Both were provably exact here (measured: splash and logo
   * centres agreed to the decimal, 250 / 493) and both still twitched on a
   * phone, because "same coordinates" is not "same pixels" — a transformed
   * element is composited and snapped to the device-pixel grid, a plain one is
   * drawn at its true sub-pixel position. So the swap is gone: the logo takes
   * over already in motion, and there is no stationary handoff left to see.
   *
   * The whole handoff is one synchronous block on purpose. It was split across
   * a requestAnimationFrame first, and that silently killed the animation:
   * flushSync commits the DOM but does NOT recalculate style, and rAF
   * callbacks run BEFORE the style/layout/paint steps of their frame — so the
   * pin and the release both landed before a single recalculation, the browser
   * compared `transform: none` against `transform: none`, saw no change, and
   * started no transition at all. The logo simply appeared at its resting
   * place the moment the splash went. (Confirmed in isolation: same sequence
   * with the reflow read below yields a live CSSTransition, without it
   * `getAnimations()` is empty and the computed transform is already `none`.)
   * Doing it in one task with an explicit reflow between the two writes is
   * what makes the transition real — and it also removes the rAF that, if
   * dropped by a suspended tab, would have stranded the user behind an opaque
   * splash for good.
   */
  useEffect(() => {
    if (bootStage !== 'hold') return
    const t = setTimeout(() => {
      const splash = document.getElementById('boot-splash')
      const splashLogo = splash?.querySelector('svg')
      const node = homeLogoNode.current

      if (!splash || !splashLogo || !node || prefersReducedMotion()) {
        splash?.remove()
        finishBoot()
        return
      }

      // Measured off the splash itself — the actual painted rect, not a
      // computed idea of where the centre ought to be. Taken now, at the end
      // of the hold, so any late layout settling is already accounted for.
      const from = splashLogo.getBoundingClientRect()
      const to = node.getBoundingClientRect()
      const dx = from.left + from.width / 2 - (to.left + to.width / 2)
      const dy = from.top + from.height / 2 - (to.top + to.height / 2)

      // 1. Pin the logo onto the splash, no transition. Still hidden behind it.
      flushSync(() => setLogoStyle(flightStyle(`translate(${dx}px, ${dy}px)`, 'none')))

      // 2. Force a style recalculation so the browser takes THIS as the
      //    before-change style. Without this read there is no animation at all
      //    — see the block comment above.
      void node.offsetHeight

      // 3. Release and uncover together. Dropping the `transform` key is what
      //    sends the logo home: its absence resolves to `none`, which is the
      //    element's own layout position rather than a number we computed. The
      //    first painted frame is the transition's own frame zero, which is
      //    exactly where the splash was.
      flushSync(() => {
        setLogoStyle(flightStyle(undefined, `transform ${BOOT_FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`))
        setBootStage('flying')
      })
      splash.remove()
    }, BOOT_HOLD_MS)
    return () => clearTimeout(t)
  }, [bootStage])

  // See TRANSITION_BACKSTOP_MS. A swallowed transitionend here leaves
  // bootStage on 'flying' forever, which looks almost fine — the floating
  // clone has already landed in the right place — but beginUpdate bails on
  // `bootStage !== 'done'`, so the Update button silently stops working for
  // the rest of the session. finishBoot is idempotent, so racing the real
  // event costs nothing.
  useEffect(() => {
    if (bootStage !== 'flying') return
    const t = setTimeout(finishBoot, BOOT_FLIGHT_MS + TRANSITION_BACKSTOP_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finishBoot only sets state
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
          // Home's text starts fading in as soon as the logo takes off
          // (rather than waiting for it to land) so the two read as one
          // continuous motion instead of a flight, then a separate fade.
          // Hidden outright while the update replay owns the logo.
          contentVisible: (!booting || bootStage === 'flying') && !updating,
          logoRef: setHomeLogoRef,
          logoStyle,
          // Own transition only. transitionend bubbles, so any transition
          // added to <Logo> (or anything nested with it) would otherwise end
          // the boot flight early — a trap worth closing rather than relying
          // on the logo staying transition-free forever.
          onLogoTransitionEnd: (e) => {
            if (e.target !== e.currentTarget) return
            if (bootStage === 'flying') finishBoot()
            else if (updatePhase === 'toCenter') setUpdatePhase('progress')
          },
          updating,
          onUpdateStart: beginUpdate,
        })}
      </div>

      {/* The progress bar is anchored to the viewport centre, NOT nested with
          the logo: sharing a box with it made that box's height (and so where
          the logo's own centring landed) shift the instant the bar mounted,
          snapping the logo mid-flight. */}
      {(updatePhase === 'progress' || updatePhase === 'restarting') && (
        <div
          className="pointer-events-none fixed left-1/2 top-[calc(50%+64px)] z-50 flex w-48 -translate-x-1/2 flex-col items-center gap-2 fade-in"
        >
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
            {/* Eased so the bar glides between the per-frame percentages
                instead of stepping — at 5s over ~100 whole-number steps the
                raw width jumps are individually visible as a stutter. Short
                enough (one frame's worth) that it never lags behind the
                number next to it. */}
            <div
              className="h-full rounded-full bg-white transition-[width] duration-100 ease-linear"
              style={{ width: `${updateProgress}%` }}
            />
          </div>
          <span className="font-label text-[10px] font-light uppercase tracking-[0.14em] text-white/50">
            {updatePhase === 'restarting' ? tr.app.restarting : `${tr.app.updating} ${updateProgress}%`}
          </span>
        </div>
      )}
    </div>
  )
}

export default App
