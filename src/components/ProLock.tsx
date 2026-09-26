import type { ReactNode } from 'react'
import { useProStore } from '../store/proStore'
import { useTranslation } from '../store/languageStore'
import { IconLock } from './editor/icons'

/**
 * Shows a Pro-only control as it will look, dimmed and inert, with a tap
 * target over it that opens the paywall. Renders the control untouched once
 * the person has Pro (and always on the web, which has no store).
 */
export function ProLock({ children }: { children: ReactNode }) {
  const isPro = useProStore((s) => s.isPro)
  const openPaywall = useProStore((s) => s.openPaywall)
  const tr = useTranslation()
  if (isPro) return <>{children}</>
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-35" aria-hidden>
        {children}
      </div>
      <button
        type="button"
        onClick={openPaywall}
        aria-label={tr.pro.title}
        className="absolute inset-0 flex items-center justify-center"
      >
        <span className="font-label flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-900 shadow-lg transition duration-200 active:scale-95">
          <IconLock className="h-3 w-3" />
          {tr.pro.locked}
        </span>
      </button>
    </div>
  )
}
