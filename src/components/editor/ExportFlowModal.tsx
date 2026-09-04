import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from '../../store/languageStore'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
/** Matches the closing transition below, so a caller can wait out the fade
 *  before swapping what's underneath — otherwise the editor turns back into
 *  the dropzone underneath a modal that's still visibly there. */
export const CLOSE_MS = 300
const AUTO_DISMISS_MS = 9000

/** rendering → ready → saving → saved. A single photo that shares straight off
 *  the Export tap skips the first three and opens on `saved`. */
export type ExportFlowPhase = 'rendering' | 'ready' | 'saving' | 'saved'

interface ExportFlowModalProps {
  open: boolean
  phase: ExportFlowPhase
  /** Photos rendered so far / in total. `total` of 1 hides the counter. */
  done: number
  total: number
  onSave: () => void
  onCreateAnother: () => void
  onGoHome: () => void
  onClose: () => void
}

/**
 * The whole export, start to finish, in ONE modal: the render progress, the tap
 * that hands the files to the share sheet, and the confirmation with what to do
 * next. The card's content swaps between phases while the backdrop and the card
 * itself stay put, its height easing to fit.
 *
 * This used to be two separate overlays (a batch-progress modal, then a success
 * toast) that closed and opened at the same instant. Both painted their own
 * dimmed backdrop, so for a moment the screen was dimmed twice over and the
 * confirmation arrived as a hard cut on top of it. And the several seconds iOS
 * spends writing the photos went unreported, since the modal sat on "Save 5
 * photos" until the share promise resolved — hence the `saving` phase.
 */
export function ExportFlowModal({
  open,
  phase,
  done,
  total,
  onSave,
  onCreateAnother,
  onGoHome,
  onClose,
}: ExportFlowModalProps) {
  const tr = useTranslation()
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)

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
  // state on the mounting render skips the closed frame the transition needs to
  // animate from, so the card would snap in instead of easing.
  useEffect(() => {
    if (!mounted || !open) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open])

  // Measured rather than left intrinsic: the card has to EASE from the height
  // of the progress content to the height of the confirmation, and CSS can't
  // interpolate to `auto`. The first measurement matches what auto already
  // rendered, so it doesn't animate — only later phase changes do.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!mounted || !el) return
    setHeight(el.scrollHeight)
    const observer = new ResizeObserver(() => setHeight(el.scrollHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [mounted, phase, total])

  const saved = phase === 'saved'
  // The countdown bar needs a frame at full width before it starts shrinking —
  // mounting it already transitioning to scaleX(0) gives the transition no
  // starting value, so it would just appear empty. Same mount-then-flip split
  // the card itself uses above.
  const [countdownRunning, setCountdownRunning] = useState(false)
  useEffect(() => {
    if (!saved) {
      setCountdownRunning(false)
      return
    }
    const raf = requestAnimationFrame(() => setCountdownRunning(true))
    return () => cancelAnimationFrame(raf)
  }, [saved])

  // Only the confirmation times out on its own. Auto-dismissing while photos
  // are still rendering — or while the share sheet is open — would drop the
  // files on the floor.
  useEffect(() => {
    if (!open || !saved) return
    const t = setTimeout(onClose, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [open, saved, onClose])

  if (!mounted) return null

  const ready = phase === 'ready'
  const rendering = phase === 'rendering'
  // Dismissable only once there's nothing in flight: tapping out mid-render (or
  // mid-share) would leave work running with nothing on screen reporting it.
  const dismissable = ready || saved
  const progress = total > 0 ? done / total : 0

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div
        className={`absolute inset-0 bg-black/65 ${dismissable ? '' : 'pointer-events-none'}`}
        onClick={dismissable ? onClose : undefined}
      />

      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-ink-900 shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
        style={{ height }}
      >
        {saved && (
          <button
            type="button"
            aria-label={tr.exportToast.close}
            onClick={onClose}
            className="fade-in absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition duration-200 hover:bg-white/10 hover:text-white active:scale-90"
          >
            ✕
          </button>
        )}

        <div ref={contentRef} className="p-6">
          {/* Keyed on the phase GROUP, not the phase: 'ready' and 'saving' show
              the same card with a different button, so re-keying between them
              would re-run the entrance animation for a change of two words. */}
          <div key={saved ? 'saved' : 'progress'} className="fade-in flex flex-col items-center gap-5 text-center">
            {saved ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">✓</div>
                <p className="font-display text-base font-semibold text-white">{tr.exportToast.saved}</p>
                <div className="flex w-full flex-col gap-2">
                  <button
                    type="button"
                    onClick={onCreateAnother}
                    className="font-label w-full rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95"
                  >
                    {tr.exportToast.createAnother}
                  </button>
                  <button
                    type="button"
                    onClick={onGoHome}
                    className="font-label w-full rounded-2xl bg-white/10 py-3 text-xs font-semibold uppercase tracking-wide text-white transition duration-200 hover:bg-white/15 active:scale-95"
                  >
                    {tr.exportToast.backHome}
                  </button>
                </div>
              </>
            ) : (
              <>
                {total > 1 ? (
                  <p className="font-display text-3xl font-semibold tabular-nums text-white">
                    {done}/{total}
                  </p>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">✓</div>
                )}

                <p className="font-label text-xs text-white/50">
                  {rendering ? tr.borderEditor.exportingBatch(done, total) : tr.toolbar.readyToSave(total)}
                </p>

                {total > 1 && (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full bg-white transition-[width] duration-300 ${EASE}`}
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={onSave}
                  disabled={!ready}
                  className={`font-label w-full rounded-2xl py-3.5 text-xs font-semibold uppercase tracking-wide transition duration-300 ${EASE} ${
                    ready ? 'bg-white text-ink-900 active:scale-95' : 'cursor-default bg-white/10 text-white/35'
                  }`}
                >
                  {rendering ? tr.toolbar.exporting : ready ? tr.toolbar.saveNow(total) : tr.toolbar.saving}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Countdown for the auto-dismiss above — mounted only with the
            confirmation, so it starts from full exactly when that appears. */}
        {saved && (
          <div className="absolute inset-x-0 bottom-0 h-1 w-full bg-white/10">
            <div
              className="h-full w-full origin-left bg-white"
              style={{
                transform: countdownRunning ? 'scaleX(0)' : 'scaleX(1)',
                transition: countdownRunning ? `transform ${AUTO_DISMISS_MS}ms linear` : 'none',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
