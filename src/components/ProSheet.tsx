import { useEffect, useState } from 'react'
import { Pro } from '../lib/pro'
import type { ProProduct } from '../lib/pro'
import { useProStore } from '../store/proStore'
import { useTranslation } from '../store/languageStore'
import { IconLock } from './editor/icons'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
const CLOSE_MS = 250

type Price = { kind: 'loading' } | { kind: 'ready'; product: ProProduct } | { kind: 'unavailable' }
type Busy = null | 'buying' | 'restoring'
type Note = null | 'unlocked' | 'pending' | 'nothingToRestore' | 'failed'

/**
 * The App Store build's paywall: what Pro unlocks, its price straight from the
 * App Store, and the Restore button Apple requires for a non-consumable. Opened
 * from any locked control via useProStore().openPaywall, mounted once in App.
 *
 * Same card, backdrop and open/close motion as ConfirmDiscardModal.
 */
export function ProSheet() {
  const tr = useTranslation()
  const open = useProStore((s) => s.paywallOpen)
  const closePaywall = useProStore((s) => s.closePaywall)
  const setPro = useProStore((s) => s.setPro)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [price, setPrice] = useState<Price>({ kind: 'loading' })
  const [busy, setBusy] = useState<Busy>(null)
  const [note, setNote] = useState<Note>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), CLOSE_MS)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!mounted || !open) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [mounted, open])

  // Asked fresh on every open: the price follows the person's storefront, and
  // a first attempt made offline should get a second chance. The card keeps
  // its height while it loads, so nothing jumps when the price arrives.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setNote(null)
    setPrice((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }))
    Pro.getProduct()
      .then((product) => {
        if (!cancelled) setPrice({ kind: 'ready', product })
      })
      .catch(() => {
        if (!cancelled) setPrice((prev) => (prev.kind === 'ready' ? prev : { kind: 'unavailable' }))
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const buy = async () => {
    if (busy || price.kind !== 'ready') return
    setBusy('buying')
    setNote(null)
    try {
      const { status } = await Pro.purchase()
      if (status === 'purchased') {
        setPro(true)
        setNote('unlocked')
      } else if (status === 'pending') {
        setNote('pending')
      }
    } catch {
      setNote('failed')
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    if (busy) return
    setBusy('restoring')
    setNote(null)
    try {
      const { isPro } = await Pro.restore()
      setPro(isPro)
      setNote(isPro ? 'unlocked' : 'nothingToRestore')
    } catch {
      setNote('nothingToRestore')
    } finally {
      setBusy(null)
    }
  }

  if (!mounted) return null

  const done = note === 'unlocked'

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-black/65" onClick={busy ? undefined : closePaywall} />

      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <p className="font-display text-base font-semibold text-white">{tr.pro.title}</p>
            <p className="font-label text-xs leading-snug text-white/50">{tr.pro.subtitle}</p>
          </div>

          <ul className="flex w-full flex-col gap-2 text-left">
            {tr.pro.features.map((feature) => (
              <li key={feature} className="font-label flex items-center gap-2.5 rounded-2xl bg-white/5 px-4 py-2.5 text-xs text-white/80">
                <IconLock className="h-3.5 w-3.5 shrink-0 text-white/40" />
                {feature}
              </li>
            ))}
          </ul>

          {note && note !== 'unlocked' && (
            <p className={`font-label text-xs leading-snug ${note === 'failed' ? 'text-red-300' : 'text-white/60'}`}>{tr.pro[note]}</p>
          )}
          {done && <p className="font-label text-sm leading-snug text-white/80">{tr.pro.unlocked}</p>}

          <div className="flex w-full flex-col gap-2">
            {done ? (
              <button
                type="button"
                onClick={closePaywall}
                className="font-label w-full rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95"
              >
                {tr.pro.done}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={buy}
                  disabled={busy !== null || price.kind !== 'ready'}
                  className="font-label w-full rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  {busy === 'buying'
                    ? '…'
                    : price.kind === 'ready'
                      ? tr.pro.unlock(price.product.displayPrice)
                      : price.kind === 'loading'
                        ? tr.pro.loadingPrice
                        : tr.pro.unavailable}
                </button>
                <button
                  type="button"
                  onClick={restore}
                  disabled={busy !== null}
                  className="font-label w-full rounded-2xl bg-white/10 py-3 text-xs font-semibold uppercase tracking-wide text-white transition duration-200 hover:bg-white/15 active:scale-95 disabled:opacity-40"
                >
                  {busy === 'restoring' ? tr.pro.restoring : tr.pro.restore}
                </button>
                <button
                  type="button"
                  onClick={closePaywall}
                  disabled={busy !== null}
                  className="font-label w-full py-2 text-xs text-white/45 transition duration-200 hover:text-white/70 disabled:opacity-40"
                >
                  {tr.pro.notNow}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
