import { useEffect, useState } from 'react'
import type { ExportQuality } from '../../types'
import { EXPORT_QUALITY_PRESETS } from '../../lib/exportQuality'

interface ExportQualitySheetProps {
  open: boolean
  defaultQuality: ExportQuality
  onClose: () => void
  onExport: (quality: ExportQuality) => void
}

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

/** Bottom sheet shown when tapping Export: pick a quality, then confirm. */
export function ExportQualitySheet({ open, defaultQuality, onClose, onExport }: ExportQualitySheetProps) {
  const [selected, setSelected] = useState(defaultQuality)

  useEffect(() => {
    if (open) setSelected(defaultQuality)
  }, [open, defaultQuality])

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-300 ${EASE} ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div
        className={`relative w-full max-w-md rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ${EASE} ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
        <h2 className="mb-1 px-1 text-center text-sm font-semibold uppercase tracking-wider text-slate-800">
          Calidad de exportación
        </h2>
        <p className="mb-4 px-1 text-center text-sm text-slate-400">Elige con qué calidad quieres guardar tu foto.</p>

        <div className="flex flex-col gap-2">
          {EXPORT_QUALITY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelected(preset.id)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                selected === preset.id
                  ? 'border-polar-500 bg-polar-50'
                  : 'border-polar-100 bg-white hover:bg-polar-50/60'
              }`}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-800">{preset.label}</p>
                <p className="text-xs text-slate-400">{preset.hint}</p>
              </div>
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected === preset.id ? 'border-polar-500' : 'border-polar-200'
                }`}
              >
                {selected === preset.id && <div className="h-2.5 w-2.5 rounded-full bg-polar-500" />}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-polar-50 py-3 text-xs font-semibold uppercase tracking-wide text-polar-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onExport(selected)}
            className="flex-[2] rounded-2xl bg-polar-500 py-3 text-xs font-semibold uppercase tracking-wide text-white hover:bg-polar-600"
          >
            Exportar
          </button>
        </div>
      </div>
    </div>
  )
}
