import type { Ref } from 'react'
import { useEditorStore } from '../store/editorStore'
import { useUpdateStore } from '../store/updateStore'
import { Logo } from './Logo'
import { IconInstagram, IconRefresh } from './editor/icons'

const INSTAGRAM_URL = 'https://instagram.com/frangellcode'

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

  const handleUpdate = () => {
    useUpdateStore.getState().setUpdateAvailable(false)
    onUpdateStart?.()
  }

  // duration-700 (not the app's usual 200ms tap-feedback speed) so this also
  // reads fine on the update button below, which reuses it in place of its
  // own hover/press transition — two separate `transition*` utilities on one
  // element would just have the later one silently win.
  const revealCls = (delay: string) =>
    `transition-all duration-700 ease-out ${delay} ${
      contentVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
    }`

  return (
    <div className="flex h-full flex-col items-center bg-ink-900 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      {/* flex-1 centers the main content within whatever space is left above
          the Instagram footer below, instead of the footer joining this
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
          Bordes blancos y collages para tus fotos artísticas, en alta calidad y sin conexión a internet.
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
            <span className="font-display text-base font-medium text-white">Bordes blancos</span>
            <span className="font-label text-[10.5px] font-light text-white/50">Enmarca una foto con borde blanco</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMode('collage')}
          className="flex items-baseline gap-3 border-b border-white/15 py-5 text-left"
        >
          <span className="font-display w-5 text-sm font-bold text-white/50">II</span>
          <span className="flex flex-col gap-1">
            <span className="font-display text-base font-medium text-white">Collage</span>
            <span className="font-label text-[10.5px] font-light text-white/50">Combina varias fotos en una grilla</span>
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
        Actualizar app
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
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 pb-12 font-label text-[11px] font-light text-white/40 transition-all duration-1000 ease-out delay-300 active:scale-95 ${
          contentVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        Hecho con cariño · @frangellcode
        <IconInstagram className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}
