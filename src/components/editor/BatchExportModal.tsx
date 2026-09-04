import { useEffect, useState } from 'react'
import { useTranslation } from '../../store/languageStore'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
/** Matches the closing transition below, so a caller can wait out the fade
 *  before swapping what's underneath. Same contract as ExportSuccessToast. */
export const CLOSE_MS = 300

export type BatchExportPhase = 'rendering' | 'ready'

interface BatchExportModalProps {
  open: boolean
  phase: BatchExportPhase
  done: number
  total: number
  onSave: () => void
  onClose: () => void
}

/**
 * The whole batch export, shown as one centered modal over a dimmed backdrop:
 * the per-photo progress while rendering, then the tap that hands the finished
 * set to the share sheet.
 *
 * The tap is not optional and never was — WebKit only opens the share sheet
 * while the tap that asked for it is still live, and rendering five
 * native-resolution photos always outlasts that window. What used to happen is
 * that the app tried anyway, failed, and only then surfaced a small strip at
 * the edge of the screen, which was easy to miss entirely: the export looked
 * like it had simply stalled. Asking for the tap up front — in the middle of a
 * dimmed screen, where the progress the person was already watching turns into
 * the button — makes it one deliberate step instead of an error being
 * recovered from.
 */
export function BatchExportModal({ open, phase, done, total, onSave, onClose }: BatchExportModalProps) {
  const tr = useTranslation()
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), CLOSE_MS)
    return () => clearTimeout(t)
  }, [open])

  // Mount first, flip visible on the next frame — going straight to the open
  // state on the mounting render skips the closed frame the transition needs
  // to animate from, so the card would snap in instead of easing.
  useEffect(() => {
    if (!mounted || !open) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open])

  if (!mounted) return null

  const ready = phase === 'ready'
  const progress = total > 0 ? done / total : 0

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Only dismissable once there's something to dismiss — tapping out
          mid-render would leave the render running with nothing on screen
          reporting it. */}
      <div className="absolute inset-0 bg-black/70" onClick={ready ? onClose : undefined} />

      <div
        className={`relative flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl border border-white/10 bg-ink-900 p-6 text-center shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          {/* A "1/1" counter says nothing — a lone photo only ever reaches
              this modal already rendered, so it gets the tick instead. */}
          {total > 1 ? (
            <p className="font-display text-3xl font-semibold tabular-nums text-white">
              {done}/{total}
            </p>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">✓</div>
          )}
          <p className="font-label text-xs text-white/50">
            {ready ? tr.toolbar.readyToSave(total) : tr.borderEditor.exportingBatch(done, total)}
          </p>
        </div>

        {/* One bar for both phases — it fills as photos land and simply sits
            full once they all have, so nothing swaps in or out underneath the
            counter as the card changes state. */}
        <div className={`h-1 w-full overflow-hidden rounded-full bg-white/10 ${total > 1 ? '' : 'hidden'}`}>
          <div
            className={`h-full rounded-full bg-white transition-[width] duration-300 ${EASE}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={!ready}
          className={`font-label w-full rounded-2xl py-3.5 text-xs font-semibold uppercase tracking-wide transition duration-300 ${EASE} ${
            ready
              ? 'bg-white text-ink-900 active:scale-95'
              : 'cursor-default bg-white/10 text-white/35'
          }`}
        >
          {ready ? tr.toolbar.saveNow(total) : tr.toolbar.exporting}
        </button>
      </div>
    </div>
  )
}
