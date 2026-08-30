import type { Ref } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useUpdateStore } from '../store/updateStore'
import { useLanguageStore, useTranslation } from '../store/languageStore'
import { FadeText } from './FadeText'
import { Logo } from './Logo'
import { IconInstagram, IconRefresh } from './editor/icons'

const INSTAGRAM_URL = 'https://instagram.com/frangellgram'
const DONATE_URL = 'https://paypal.me/frangellgram'

interface HomeScreenProps {
  /** True while the boot splash's floating logo is still in flight toward this
   *  screen's logo slot, or while the update replay (see App.tsx) has taken
   *  it over — keeps this screen's own logo invisible (but laid out, so its
   *  position can be measured) so the two never show at once. */
  logoHidden?: boolean
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
  logoHidden = false,
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

  const handleUpdate = () => {
    useUpdateStore.getState().setUpdateAvailable(false)
    onUpdateStart?.()
  }

  // duration-700 (not the app's usual 200ms tap-feedback speed) so this also
  // reads fine on the update button below, which reuses it in place of its
  // own hover/press transition — two separate `transition*` utilities on one
  // element would just have the later one silently win.
  // [backface-visibility:hidden] works around a real WebKit artifact: an
  // element animating transform+opacity together gets promoted to its own
  // compositing layer for the transition, and on iOS Safari that layer's
  // edge can briefly rasterize as a faint rectangular seam against a solid
  // dark background — reported as a "white box" flashing in on load, gone
  // once the transition (and the layer) ends. Most visible on the widest
  // elements (the menu list, the footer), but cheap enough to apply
  // everywhere this reveal runs.
  const revealCls = (delay: string) =>
    `transition-all duration-700 ease-out ${delay} [backface-visibility:hidden] ${
      contentVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
    }`

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
        {/* No transition here: the floating splash logo (App.tsx) already
            animates the arrival. This one just swaps in at the exact instant
            the clone is removed — same position/size, so the cut is
            invisible. A fade on top of that swap left a beat where neither
            logo was fully opaque, which read as a flicker. */}
        <div ref={logoRef} className={logoHidden ? 'opacity-0' : 'opacity-100'}>
          <Logo size={62} />
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
        className={`flex flex-col items-center gap-3 pb-12 transition-all duration-1000 ease-out delay-300 [backface-visibility:hidden] ${
          contentVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
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
