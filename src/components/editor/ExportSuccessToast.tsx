import { useEffect, useState } from 'react'

interface ExportSuccessToastProps {
  open: boolean
  onClose: () => void
  onCreateAnother: () => void
}

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
const CLOSE_MS = 300
const AUTO_DISMISS_MS = 6000

/** Confirmation shown after a successful export, offering a quick way to start a new photo/collage. */
export function ExportSuccessToast({ open, onClose, onCreateAnother }: ExportSuccessToastProps) {
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
  // transition needs to animate from, so the toast would just snap in.
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
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 ${EASE} ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-ink-900 p-3 pl-4 shadow-2xl">
        <p className="font-label flex-1 text-xs font-semibold text-white">¡Foto guardada!</p>
        <button
          type="button"
          onClick={onCreateAnother}
          className="font-label rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95"
        >
          Hacer otro
        </button>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition duration-200 hover:bg-white/10 hover:text-white active:scale-90"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
