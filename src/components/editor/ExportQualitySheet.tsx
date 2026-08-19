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
const CLOSE_MS = 300

/** Bottom sheet shown when tapping Export: pick a quality, then confirm. */
export function ExportQualitySheet({ open, defaultQuality, onClose, onExport }: ExportQualitySheetProps) {
  const [selected, setSelected] = useState(defaultQuality)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) setSelected(defaultQuality)
  }, [open, defaultQuality])

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), CLOSE_MS)
    return () => clearTimeout(t)
  }, [open])

  // Mounting and becoming visible in the same render leaves the sheet
  // painted directly in its final (open) position — there's no earlier
  // frame at the closed transform for the browser to transition from, so
  // it just pops in instead of sliding up. Flipping to visible a frame
  // after mount gives the browser a closed frame to animate away from.
  useEffect(() => {
    if (!mounted || !open) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open])

  // Unmounted entirely while closed instead of just hidden via CSS — a
  // fixed, full-viewport overlay left sitting in the DOM at opacity-0 /
  // pointer-events-none is a documented source of broken touch routing
  // in iOS's standalone (Home Screen) PWA mode specifically: taps meant
  // for elements underneath it can get swallowed or misrouted by the
  // inert overlay instead of reaching their real target, even though it
  // should be fully click-through. This was mounted on every screen the
  // whole time regardless of whether it was ever opened, covering the
  // entire viewport — matching the "toolbar buttons AND the dropzone
  // below them" scope of the reported bug, and why it only showed up
  // once installed to the Home Screen. Only mounting it while actually
  // in use (open, or still playing its close transition) avoids the bug
  // instead of fighting it.
  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        className={`relative w-full max-w-md rounded-t-3xl border-t border-white/10 bg-ink-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ${EASE} ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20" />
        <h2 className="font-display mb-1 px-1 text-center text-sm font-semibold uppercase tracking-wider text-white">
          Calidad de exportación
        </h2>
        <p className="font-label mb-4 px-1 text-center text-sm text-white/45">Elige con qué calidad quieres guardar tu foto.</p>

        <div className="flex flex-col gap-2">
          {EXPORT_QUALITY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelected(preset.id)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition duration-200 active:scale-[0.98] ${
                selected === preset.id
                  ? 'border-white bg-white/10'
                  : 'border-white/15 bg-transparent hover:bg-white/5'
              }`}
            >
              <div>
                <p className="font-label text-xs font-semibold uppercase tracking-wide text-white">{preset.label}</p>
                <p className="font-label text-xs text-white/45">{preset.hint}</p>
              </div>
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
                  selected === preset.id ? 'border-white' : 'border-white/25'
                }`}
              >
                {selected === preset.id && <div className="fade-in h-2.5 w-2.5 rounded-full bg-white" />}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-label flex-1 rounded-2xl bg-white/10 py-3 text-xs font-semibold uppercase tracking-wide text-white transition duration-200 active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onExport(selected)}
            className="font-label flex-[2] rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95"
          >
            Exportar
          </button>
        </div>
      </div>
    </div>
  )
}
