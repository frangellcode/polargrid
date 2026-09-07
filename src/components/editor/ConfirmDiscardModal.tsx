import { useEffect, useState } from 'react'
import { useTranslation } from '../../store/languageStore'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
const CLOSE_MS = 250

interface ConfirmDiscardModalProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The one question this app asks.
 *
 * Leaving an editor resets it — that's deliberate (see App.tsx), so Back is
 * the same gesture as "throw this away". It just never said so: one tap
 * destroyed a nine-photo collage with no confirmation and nothing to undo it
 * with. Only shown when there is actually something to lose; an empty editor
 * still leaves on the first tap.
 *
 * Same card, backdrop and motion as the export flow, and the safe choice is
 * the big one — on a phone the thumb lands on the bottom button, and the
 * bottom button here keeps your work.
 */
export function ConfirmDiscardModal({ open, onConfirm, onCancel }: ConfirmDiscardModalProps) {
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

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Tapping out is the same as keeping the work — the harmless option. */}
      <div className="absolute inset-0 bg-black/65" onClick={onCancel} />

      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="font-display text-base font-semibold text-white">{tr.discard.title}</p>
          <p className="font-label text-xs leading-snug text-white/50">{tr.discard.body}</p>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="font-label w-full rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95"
            >
              {tr.discard.keep}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="font-label w-full rounded-2xl bg-red-500/15 py-3 text-xs font-semibold uppercase tracking-wide text-red-300 transition duration-200 hover:bg-red-500/25 active:scale-95"
            >
              {tr.discard.discard}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
