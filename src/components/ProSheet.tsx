import { useEffect, useState } from 'react'
import { Pro } from '../lib/pro'
import type { ProProduct } from '../lib/pro'
import { PRO_FEATURES, useProStore } from '../store/proStore'
import type { ProFeature } from '../store/proStore'
import { useEditorStore } from '../store/editorStore'
import type { LoadedPhoto } from '../types'
import { ProPreview } from './ProPreview'
import { useTranslation } from '../store/languageStore'
import { afterFirstPaint } from '../lib/afterFirstPaint'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
const CLOSE_MS = 300

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
  const paywallFeature = useProStore((s) => s.paywallFeature)
  const [feature, setFeature] = useState<ProFeature>(paywallFeature)
  // The example uses the photo being edited: the border's, or the first one
  // placed in the collage.
  const photo = useEditorStore((s): LoadedPhoto | null => {
    const id =
      s.mode === 'border'
        ? s.border.photoId
        : (s.collage.assignments.find((a) => a.photoId)?.photoId ?? s.collage.freeItems[0]?.photoId)
    return (id && s.photos[id]) || null
  })
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
    return afterFirstPaint(() => setVisible(true))
  }, [mounted, open])

  // Asked fresh on every open: the price follows the person's storefront, and
  // a first attempt made offline should get a second chance. The card keeps
  // its height while it loads, so nothing jumps when the price arrives.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setNote(null)
    setFeature(paywallFeature)
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
  }, [open, paywallFeature])

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
        className={`relative max-h-[92vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-ink-900 p-5 shadow-2xl transition-all duration-300 ${EASE} ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <p className="font-display text-base font-semibold text-white">{tr.pro.title}</p>
            <p className="font-label text-xs leading-snug text-white/50">{tr.pro.subtitle}</p>
          </div>

          {photo && <ProPreview feature={feature} photo={photo} />}

          <div className="grid w-full grid-cols-2 gap-2">
            {PRO_FEATURES.map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() => setFeature(id)}
                className={`font-label rounded-2xl px-3 py-2.5 text-left text-[11px] leading-tight transition duration-200 active:scale-95 ${
                  feature === id ? 'bg-white text-ink-900' : 'bg-white/5 text-white/75 hover:bg-white/10'
                }`}
              >
                {tr.pro.features[i]}
              </button>
            ))}
          </div>

          {note && note !== 'unlocked' && (
            <p key={note} className={`fade-in font-label text-xs leading-snug ${note === 'failed' ? 'text-red-300' : 'text-white/60'}`}>{tr.pro[note]}</p>
          )}
          {done && <p className="fade-in font-label text-sm leading-snug text-white/80">{tr.pro.unlocked}</p>}

          <div className="flex w-full flex-col gap-2">
            {done ? (
              <button
                type="button"
                onClick={closePaywall}
                className="fade-in font-label w-full rounded-2xl bg-white py-3 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95"
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
