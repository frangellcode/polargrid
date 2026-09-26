import type { ReactNode } from 'react'
import { useProStore } from '../store/proStore'
import { useTranslation } from '../store/languageStore'
import { IconLock } from './editor/icons'

/**
 * Shows a Pro-only control as it will look, dimmed and inert, with a tap
 * target over it that opens the paywall. Once the person has Pro (always, on
 * the web, which has no store) the dimming and the badge fade away and the
 * control underneath is live — kept mounted either way, so unlocking is a
 * crossfade rather than a swap.
 */
export function ProLock({ children }: { children: ReactNode }) {
  const isPro = useProStore((s) => s.isPro)
  const openPaywall = useProStore((s) => s.openPaywall)
  const tr = useTranslation()
  return (
    <div className="relative">
      <div
        className={`transition-opacity duration-300 ease-out ${isPro ? 'opacity-100' : 'pointer-events-none opacity-35'}`}
        aria-hidden={!isPro}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={openPaywall}
        aria-label={tr.pro.title}
        tabIndex={isPro ? -1 : 0}
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out ${
          isPro ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <span className="font-label flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-900 shadow-lg transition duration-200 active:scale-95">
          <IconLock className="h-3 w-3" />
          {tr.pro.locked}
        </span>
      </button>
    </div>
  )
}
