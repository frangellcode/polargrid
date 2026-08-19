import { useState } from 'react'
import { useEditorStore } from '../store/editorStore'
import { Logo } from './Logo'
import { IconRefresh } from './editor/icons'
import { forceAppUpdate } from '../lib/pwaUpdate'

export function HomeScreen() {
  const setMode = useEditorStore((s) => s.setMode)
  const [updating, setUpdating] = useState(false)

  const handleUpdate = () => {
    const ok = window.confirm('¿Actualizar a la última versión? Se borrará todo lo guardado en el dispositivo para esta app.')
    if (!ok) return
    setUpdating(true)
    forceAppUpdate()
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 bg-ink-900 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <div className="flex flex-col items-center gap-4">
        <Logo size={62} />
        <h1 className="font-display text-3xl font-bold text-white">PolarGrid</h1>
        <div className="h-px w-8 bg-white/35" />
        <p className="max-w-xs font-label text-xs font-light leading-7 text-white/60">
          Bordes blancos y collages para tus fotos artísticas, en alta calidad y sin conexión a internet.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col">
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
        className="flex items-center gap-1.5 font-label text-[10px] font-light uppercase tracking-[0.14em] text-white/35 transition duration-200 active:scale-95 disabled:opacity-60 disabled:active:scale-100"
      >
        <IconRefresh className={`h-3.5 w-3.5 ${updating ? 'animate-spin' : ''}`} />
        {updating ? 'Actualizando…' : 'Actualizar app'}
      </button>
    </div>
  )
}
