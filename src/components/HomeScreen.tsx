import { useState } from 'react'
import type { Ref } from 'react'
import { useEditorStore } from '../store/editorStore'
import { Logo } from './Logo'
import { IconRefresh } from './editor/icons'
import { forceAppUpdate } from '../lib/pwaUpdate'

interface HomeScreenProps {
  /** True while the boot splash's floating logo is still in flight toward this
   *  screen's logo slot — keeps this screen's own logo invisible (but laid
   *  out, so its position can be measured) so the two never show at once. */
  logoHidden?: boolean
  /** Drives the fade/slide-in of everything but the logo, timed by App.tsx to
   *  start as the splash logo lands. Defaults true: plain (non-boot) visits
   *  to Home render fully visible immediately, animated only by the screen
   *  transition that already wraps this component. */
  contentVisible?: boolean
  /** Attached to the logo's wrapper so App.tsx can measure where it sits and
   *  fly the splash logo there. */
  logoRef?: Ref<HTMLDivElement>
}

export function HomeScreen({ logoHidden = false, contentVisible = true, logoRef }: HomeScreenProps) {
  const setMode = useEditorStore((s) => s.setMode)
  const [updating, setUpdating] = useState(false)

  const handleUpdate = () => {
    const ok = window.confirm('¿Actualizar a la última versión? Se borrará todo lo guardado en el dispositivo para esta app.')
    if (!ok) return
    setUpdating(true)
    forceAppUpdate()
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
    <div className="flex h-full flex-col items-center justify-center gap-10 bg-ink-900 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
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

      <button
        type="button"
        onClick={handleUpdate}
        disabled={updating}
        className={`flex items-center gap-1.5 font-label text-[10px] font-light uppercase tracking-[0.14em] text-white/35 active:scale-95 disabled:opacity-60 disabled:active:scale-100 ${revealCls('delay-300')}`}
      >
        <IconRefresh className={`h-3.5 w-3.5 ${updating ? 'animate-spin' : ''}`} />
        {updating ? 'Actualizando…' : 'Actualizar app'}
      </button>
    </div>
  )
}
