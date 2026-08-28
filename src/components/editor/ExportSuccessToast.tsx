import { useEffect, useState } from 'react'

interface ExportSuccessToastProps {
  open: boolean
  onClose: () => void
  onCreateAnother: () => void
  onGoHome: () => void
}

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
// Exported so callers can delay swapping the underlying content (e.g. back
// to the upload dropzone) until this modal has actually finished closing —
// otherwise that swap happens instantly underneath the still-fading-out
// modal and reads as a jarring, out-of-sync snap.
export const CLOSE_MS = 300
const AUTO_DISMISS_MS = 9000

/** Confirmation shown after a successful export, offering a quick way to start a new photo/collage. */
export function ExportSuccessToast({ open, onClose, onCreateAnother, onGoHome }: ExportSuccessToastProps) {
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

  // Same mount-then-visible split as ExportQualitySheet — flipping straight
  // to the open transform on the mounting render skips the closed frame the
  // transition needs to animate from, so the modal would just snap in. The
  // countdown bar below piggybacks on this same flip: it starts full and
  // only picks up its shrink-to-empty transition once `visible` flips true,
  // so it stays in lockstep with the auto-dismiss timer below.
  useEffect(() => {
    if (!mounted || !open) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [open, onClose])

  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        className={`relative flex w-full max-w-sm flex-col items-center gap-4 overflow-hidden rounded-3xl border border-white/10 bg-ink-900 p-6 text-center shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'
        }`}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-2 top-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition duration-200 hover:bg-white/10 hover:text-white active:scale-90"
        >
          ✕
        </button>

        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl">✓</div>

        <p className="font-display text-base font-semibold text-white">Photo saved!</p>

        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onCreateAnother}
            className="font-label w-full rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95"
          >
            Create another
          </button>
          <button
            type="button"
            onClick={onGoHome}
            className="font-label w-full rounded-2xl bg-white/10 py-3 text-xs font-semibold uppercase tracking-wide text-white transition duration-200 hover:bg-white/15 active:scale-95"
          >
            Back to home
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-1 w-full bg-white/10">
          <div
            className="h-full w-full origin-left bg-white"
            style={{
              transform: visible ? 'scaleX(0)' : 'scaleX(1)',
              transition: visible ? `transform ${AUTO_DISMISS_MS}ms linear` : 'none',
            }}
          />
        </div>
      </div>
    </div>
  )
}
