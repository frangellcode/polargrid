import { useEffect, useState } from 'react'
import { TIP_PRODUCT_IDS, TipJar } from '../lib/tipJar'
import type { TipProduct } from '../lib/tipJar'
import { useTranslation } from '../store/languageStore'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
const CLOSE_MS = 250

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; products: TipProduct[]; buying: string | null; note: 'failed' | null }
  | { kind: 'unavailable' }
  | { kind: 'done'; note: 'thanks' | 'pending' }

interface TipJarModalProps {
  open: boolean
  onClose: () => void
}

/**
 * The App Store build's stand-in for the PayPal link: consumable in-app
 * purchases that unlock nothing (see TipJarPlugin.swift for why it can't just
 * link out). Prices come from the App Store already localized — this never
 * formats a price of its own.
 *
 * Same card, backdrop and open/close motion as ConfirmDiscardModal.
 */
export function TipJarModal({ open, onClose }: TipJarModalProps) {
  const tr = useTranslation()
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

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

  // Asked fresh on every open rather than cached: prices follow the person's
  // storefront, and a first attempt made offline should get a second chance.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPhase({ kind: 'loading' })
    TipJar.getProducts({ productIds: TIP_PRODUCT_IDS })
      .then(({ products }) => {
        if (cancelled) return
        setPhase(products.length > 0 ? { kind: 'ready', products, buying: null, note: null } : { kind: 'unavailable' })
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: 'unavailable' })
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const buy = async (productId: string) => {
    if (phase.kind !== 'ready' || phase.buying) return
    const products = phase.products
    setPhase({ kind: 'ready', products, buying: productId, note: null })
    try {
      const { status } = await TipJar.purchase({ productId })
      if (status === 'purchased') setPhase({ kind: 'done', note: 'thanks' })
      else if (status === 'pending') setPhase({ kind: 'done', note: 'pending' })
      else setPhase({ kind: 'ready', products, buying: null, note: null })
    } catch {
      setPhase({ kind: 'ready', products, buying: null, note: 'failed' })
    }
  }

  if (!mounted) return null

  const busy = phase.kind === 'ready' && phase.buying !== null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 transition-opacity duration-300 ${EASE} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-black/65" onClick={busy ? undefined : onClose} />

      <div
        className={`relative w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <p className="font-display text-base font-semibold text-white">{tr.tipJar.title}</p>

          {phase.kind === 'done' ? (
            <p className="font-label text-sm leading-snug text-white/80">{tr.tipJar[phase.note]}</p>
          ) : (
            <p className="font-label text-xs leading-snug text-white/50">{tr.tipJar.body}</p>
          )}

          {phase.kind === 'loading' && <p className="font-label text-xs text-white/40">{tr.tipJar.loading}</p>}
          {phase.kind === 'unavailable' && <p className="font-label text-xs text-white/40">{tr.tipJar.unavailable}</p>}

          {phase.kind === 'ready' && (
            <div className="flex w-full flex-col gap-2">
              {phase.products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  disabled={busy}
                  onClick={() => buy(product.id)}
                  className={`font-label flex w-full items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-xs text-white transition duration-200 hover:bg-white/15 active:scale-95 disabled:active:scale-100 ${
                    busy && phase.buying !== product.id ? 'opacity-40' : ''
                  }`}
                >
                  <span className="font-light">{product.displayName}</span>
                  <span className="font-semibold">{phase.buying === product.id ? '…' : product.displayPrice}</span>
                </button>
              ))}
              {phase.note === 'failed' && <p className="font-label mt-1 text-xs text-red-300">{tr.tipJar.failed}</p>}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="font-label w-full rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95 disabled:opacity-40"
          >
            {tr.tipJar.close}
          </button>
        </div>
      </div>
    </div>
  )
}
