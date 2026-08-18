import { useEditorStore } from '../store/editorStore'
import { Logo } from './Logo'

export function HomeScreen() {
  const setMode = useEditorStore((s) => s.setMode)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
      <div className="flex flex-col items-center gap-3">
        <Logo size={104} />
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">PolarGrid</h1>
        <p className="max-w-xs text-sm text-slate-500">
          Bordes blancos y collages para tus fotos, en alta calidad y sin conexión.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          type="button"
          onClick={() => setMode('border')}
          className="rounded-2xl bg-polar-500 px-6 py-4 text-left text-white shadow-sm transition hover:bg-polar-600"
        >
          <span className="block text-base font-semibold">Bordes blancos</span>
          <span className="block text-sm text-polar-50/90">Enmarca una foto con borde blanco</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('collage')}
          className="rounded-2xl border border-polar-200 bg-polar-50 px-6 py-4 text-left text-polar-700 shadow-sm transition hover:bg-polar-100"
        >
          <span className="block text-base font-semibold">Collage</span>
          <span className="block text-sm text-polar-600/80">Combina varias fotos en una grilla</span>
        </button>
      </div>
    </div>
  )
}
