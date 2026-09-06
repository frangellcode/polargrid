import { useEffect, useState } from 'react'
import { useTranslation } from '../../store/languageStore'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
/** Matches the closing transition below, so a caller can unmount this after
 *  the fade rather than mid-way through it. */
export const IMPORT_CLOSE_MS = 250

interface ImportProgressModalProps {
  open: boolean
  /** Photos decoded so far / in total. `total` of 1 hides the counter. */
  done: number
  total: number
}

/**
 * The card that stands in for the several seconds a multi-photo selection
 * spends decoding.
 *
 * Picking five photos handed the editor five files and then went quiet: the
 * upload prompt stayed exactly as it was for three-odd seconds while
 * useImageBitmap worked through them, which reads as the tap having missed.
 * The whole point here is that something is on screen for that window, and
 * that it says how far along it is — same card, same motion and same counter
 * as the export flow, since it's the same kind of wait.
 *
 * Deliberately not dismissable and with no backdrop tap-out: the decode can't
 * be cancelled part-way (the loop owns the bitmaps it has already built), so
 * a dismiss would only hide work that was still running.
 */
export function ImportProgressModal({ open, done, total }: ImportProgressModalProps) {
  const tr = useTranslation()
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), IMPORT_CLOSE_MS)
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

  const progress = total > 0 ? done / total : 0

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-black/65" />

      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-5 text-center">
          {total > 1 ? (
            <p className="font-display text-3xl font-semibold tabular-nums text-white">
              {done}/{total}
            </p>
          ) : (
            // A single photo has no meaningful counter — a spinner is the
            // honest signal there, since the only thing to report is "still
            // working".
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-white" />
          )}

          <p className="font-label text-xs text-white/50">{tr.toolbar.importing}</p>

          {total > 1 && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full bg-white transition-[width] duration-300 ${EASE}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
