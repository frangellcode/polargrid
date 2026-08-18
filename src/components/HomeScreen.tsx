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
    <div className="flex h-full flex-col items-center justify-center gap-8 bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <div className="flex flex-col items-center gap-3">
        <Logo size={80} />
        <h1 className="text-xl font-bold uppercase tracking-[0.15em] text-slate-800">PolarGrid</h1>
        <p className="max-w-xs text-sm text-slate-500">
          Bordes blancos y collages para tus fotos, en alta calidad y sin conexión.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => setMode('border')}
          className="rounded-2xl bg-polar-500 px-5 py-3.5 text-left text-white shadow-sm transition hover:bg-polar-600"
        >
          <span className="block text-sm font-semibold uppercase tracking-wide">Bordes blancos</span>
          <span className="block text-sm text-polar-50/90">Enmarca una foto con borde blanco</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('collage')}
          className="rounded-2xl border border-polar-200 bg-polar-50 px-5 py-3.5 text-left text-polar-700 shadow-sm transition hover:bg-polar-100"
        >
          <span className="block text-sm font-semibold uppercase tracking-wide">Collage</span>
          <span className="block text-sm text-polar-600/80">Combina varias fotos en una grilla</span>
        </button>
      </div>

      <button
        type="button"
        onClick={handleUpdate}
        disabled={updating}
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 disabled:opacity-60"
      >
        <IconRefresh className={`h-3.5 w-3.5 ${updating ? 'animate-spin' : ''}`} />
        {updating ? 'Actualizando…' : 'Actualizar app'}
      </button>
    </div>
  )
}
