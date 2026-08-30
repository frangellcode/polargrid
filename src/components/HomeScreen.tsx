import type { CSSProperties, Ref, TransitionEventHandler } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useUpdateStore } from '../store/updateStore'
import { useLanguageStore, useTranslation } from '../store/languageStore'
import { FadeText } from './FadeText'
import { Logo } from './Logo'
import { IconInstagram, IconRefresh } from './editor/icons'

const INSTAGRAM_URL = 'https://instagram.com/frangellgram'
const DONATE_URL = 'https://paypal.me/frangellgram'

/**
 * index.html's pre-JS splash SVG is hardcoded to this same number — keep the
 * two in sync (static HTML can't import). On mount App.tsx transforms this
 * logo onto the viewport centre before the first paint, landing it exactly
 * where that static SVG was drawn; if the sizes drift, that handoff becomes a
 * visible resize. Nothing scales it — the flight is pure translation — so the
 * SVG is rasterised once, at this size, and never resampled.
 */
const HOME_LOGO_SIZE = 62

interface HomeScreenProps {
  /** Transform/transition driving the boot and update flights. This screen's
   *  logo is the ONE that moves — App.tsx used to fly a fixed-position clone
   *  and swap it for this one on landing, which hopped by a fraction of a
   *  pixel every time (see App.tsx's `logoStyle` for the full why). At rest
   *  this is `{}`: no transform, no transition, no compositing layer. */
  logoStyle?: CSSProperties
  /** Ends a flight. App.tsx decides which one just finished. */
  onLogoTransitionEnd?: TransitionEventHandler<HTMLDivElement>
  /** Drives the fade/slide-in of everything but the logo, timed by App.tsx to
   *  start as the splash logo lands (or end as the update replay's floating
   *  logo takes over). Defaults true: plain (non-boot) visits to Home render
   *  fully visible immediately, animated only by the screen transition that
   *  already wraps this component. */
  contentVisible?: boolean
  /** Attached to the logo's wrapper so App.tsx can measure where it sits and
   *  fly the splash/update logo there. */
  logoRef?: Ref<HTMLDivElement>
  /** True while App.tsx is running the fake "updating" replay — disables the
   *  button so it can't be tapped twice mid-animation. */
  updating?: boolean
  /** Starts the update replay in App.tsx (logo flies to center, progress bar
   *  fills, logo flies back — see App.tsx's `beginUpdate`). */
  onUpdateStart?: () => void
}

export function HomeScreen({
  logoStyle,
  onLogoTransitionEnd,
  contentVisible = true,
  logoRef,
  updating = false,
  onUpdateStart,
}: HomeScreenProps) {
  const setMode = useEditorStore((s) => s.setMode)
  const updateAvailable = useUpdateStore((s) => s.updateAvailable)
  const language = useLanguageStore((s) => s.language)
  const toggleLanguage = useLanguageStore((s) => s.toggleLanguage)
  const tr = useTranslation()

  // Deliberately does NOT clear updateAvailable. It used to, which meant a
  // failed update (the new worker never took over, so the reload served the
  // same old build) came back with the badge already gone and no way to tell
  // anything had gone wrong. The flag is per-page-load anyway — a successful
  // update reloads and starts clean — so leaving it alone costs nothing and
  // makes the failure case self-correcting: the badge is simply still there.
  // Nothing shows during the replay regardless, since the badge is gated on
  // `!updating` below.
  const handleUpdate = () => {
    onUpdateStart?.()
  }

  // duration-700 (not the app's usual 200ms tap-feedback speed) so this also
  // reads fine on the update button below, which reuses it in place of its
  // own hover/press transition — two separate `transition*` utilities on one
  // element would just have the later one silently win.
  // Opacity only — no translate-y. This used to also animate a transform,
  // which on real iOS Safari promotes the (wide) menu-list/footer elements
  // to their own compositing layer for the transition; that layer's edge
  // rasterized as a visible rectangular box against the dark background for
  // the transition's duration. Tried backface-visibility:hidden first (the
  // standard fix for the usual hairline version of this WebKit bug) and it
  // didn't get rid of it, so the transform itself has to go — a plain
  // opacity fade never needs layer promotion in the first place.
  const revealCls = (delay: string) =>
    `transition-opacity duration-700 ease-out ${delay} ${contentVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`

  return (
    <div className="relative flex h-full flex-col items-center bg-ink-900 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <button
        type="button"
        onClick={toggleLanguage}
        className={`absolute right-4 top-[max(2.25rem,calc(env(safe-area-inset-top)+1.25rem))] rounded-full border border-white/25 px-3 py-1 font-label text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60 transition duration-200 hover:border-white/40 hover:text-white active:scale-90 ${revealCls('delay-0')}`}
      >
        <FadeText value={tr.home.langToggle} trigger={language} />
      </button>

      {/* flex-1 centers the main content within whatever space is left above
          the donate/follow footer below, instead of the footer joining this
          group's own gap-10 rhythm — keeps it visually isolated at the very
          bottom of the screen rather than reading as one more menu item. */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-10">
      <div className="flex flex-col items-center gap-4">
        {/* The only logo in the app. It is never hidden and never swapped for
            anything — App.tsx flies THIS element via logoStyle and releases
            it back to a bare `{}` on landing, so its resting state is plain
            untransformed layout. */}
        <div ref={logoRef} style={logoStyle} onTransitionEnd={onLogoTransitionEnd}>
          <Logo size={HOME_LOGO_SIZE} />
        </div>
        <h1 className={`font-display text-3xl font-bold text-white ${revealCls('delay-0')}`}>PolarGrid</h1>
        <div className={`h-px w-8 bg-white/35 ${revealCls('delay-0')}`} />
        <p className={`max-w-xs font-label text-xs font-light leading-7 text-white/60 ${revealCls('delay-0')}`}>
          <FadeText value={tr.home.tagline} trigger={language} />
        </p>
      </div>

      <div className={`flex w-full max-w-xs flex-col ${revealCls('delay-200')}`}>
        <button
          type="button"
          onClick={() => setMode('border')}
          className="flex items-baseline gap-3 border-b border-white/15 py-5 text-left"
        >
          <span className="font-display w-5 text-sm font-bold text-white/50">I</span>
          <span className="flex flex-col gap-1">
            <span className="font-display text-base font-medium text-white"><FadeText value={tr.home.borderTitle} trigger={language} /></span>
            <span className="font-label text-[10.5px] font-light text-white/50"><FadeText value={tr.home.borderDesc} trigger={language} /></span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMode('collage')}
          className="flex items-baseline gap-3 border-b border-white/15 py-5 text-left"
        >
          <span className="font-display w-5 text-sm font-bold text-white/50">II</span>
          <span className="flex flex-col gap-1">
            <span className="font-display text-base font-medium text-white"><FadeText value={tr.home.collageTitle} trigger={language} /></span>
            <span className="font-label text-[10.5px] font-light text-white/50"><FadeText value={tr.home.collageDesc} trigger={language} /></span>
          </span>
        </button>
      </div>

      {/* No disabled:opacity-* here — disabling always coincides with contentVisible
          going false, and its opacity-0 must win outright instead of settling for
          the disabled state's dimmed (but still visible) opacity. */}
      <button
        type="button"
        onClick={handleUpdate}
        disabled={updating}
        className={`flex items-center gap-1.5 font-label text-[10px] font-light uppercase tracking-[0.14em] text-white/35 active:scale-95 ${revealCls('delay-300')}`}
      >
        <span className="relative flex">
          <IconRefresh className="h-3.5 w-3.5" />
          {updateAvailable && !updating && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[7px] font-semibold leading-none text-white">
              1
            </span>
          )}
        </span>
        <FadeText value={tr.home.updateApp} trigger={language} animateWidth />
      </button>
      </div>

      {/* Isolated at the very bottom, outside the centered group above (see
          the flex-1 wrapper). Shares delay-300 with the update button so it
          still settles into place as part of the same boot wave — a later
          delay (tried delay-500) let it land on its own after everything
          else had already gone still, which read as a stray pop instead of
          part of the flourish. Its own longer duration-1000 (vs everyone
          else's 700) makes that shared arrival read softer, like it's still
          gently dissolving in after the rest has landed. */}
      <div
        className={`flex flex-col items-center gap-3 pb-12 transition-opacity duration-1000 ease-out delay-300 ${
          contentVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <a
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-label flex items-center gap-2 rounded-full bg-white/10 py-2 pl-4 pr-3.5 text-[11px] font-light text-white/60 transition duration-200 hover:bg-white/15 active:scale-95"
        >
          <FadeText value={tr.home.donateLabel} trigger={language} animateWidth />
          <span className="h-3.5 w-px bg-white/25" />
          <FadeText value={tr.home.donate} trigger={language} animateWidth className="font-semibold text-white" />
        </a>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center font-label text-[11px] font-light text-white/40 active:scale-95"
        >
          <FadeText value={tr.home.followUs} trigger={language} animateWidth />
          <span className="ml-1">@frangellgram</span>
          <IconInstagram className="ml-1.5 h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
