import { useEffect, useState } from 'react'
import { useIsPro, useProStore } from '../../store/proStore'
import { useTranslation } from '../../store/languageStore'
import { IconLock } from './icons'

interface ExportBackgroundToggleProps {
  on: boolean
  onChange: (on: boolean) => void
  /** The workspace background's colour; null for "No background". */
  backgroundHex: string | null
}

/**
 * Pro: export the bordered photo on a 9:16 canvas of the workspace
 * background's colour, ready for Stories and Reels. Nothing changes on screen
 * — the background is already behind the photo there. "No background" isn't a
 * colour, so turning it on without one asks for a colour instead.
 */
export function ExportBackgroundToggle({ on, onChange, backgroundHex }: ExportBackgroundToggleProps) {
  const tr = useTranslation()
  const isPro = useIsPro()
  const openPaywall = useProStore((s) => s.openPaywall)
  const [needsColour, setNeedsColour] = useState(false)

  // Switching to "No background" leaves nothing to export with.
  useEffect(() => {
    if (!backgroundHex && on) onChange(false)
    if (backgroundHex) setNeedsColour(false)
  }, [backgroundHex, on, onChange])

  const toggle = () => {
    if (!isPro) {
      openPaywall('story')
      return
    }
    if (!on && !backgroundHex) {
      setNeedsColour(true)
      return
    }
    onChange(!on)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left transition active:scale-[0.98]"
      >
        <span className="flex flex-col">
          <span className="font-label flex items-center gap-1.5 text-xs font-semibold text-white">
            {tr.pickers.exportWithBackground}
            {!isPro && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-ink-900">
                <IconLock className="h-2.5 w-2.5" />
              </span>
            )}
          </span>
          <span className="font-label text-[10px] text-white/45">{tr.pickers.exportWithBackgroundHint}</span>
        </span>
        <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-white' : 'bg-white/20'}`}>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all duration-200 ${on ? 'left-[18px] bg-ink-900' : 'left-0.5 bg-white'}`}
          />
        </span>
      </button>
      {needsColour && <p className="fade-in font-label text-center text-[11px] text-amber-300">{tr.pickers.pickBackgroundFirst}</p>}
    </div>
  )
}
