import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { LoadedPhoto } from '../../types'
import { useTranslation } from '../../store/languageStore'
import { applyAdjustments, DEFAULT_ADJUSTMENTS, drawVignette, RETRO_PRESETS, type PhotoAdjustments } from '../../lib/adjustments'

/** Drawn at 2x so the swatches stay crisp on a phone screen. */
const SWATCH_PX = 58

/** The photo itself in one Retro style, from the preview bitmap already in
 *  memory — cheap at this size, and far more telling than a sample image. */
function RetroSwatch({ photo, presetId }: { photo: LoadedPhoto; presetId: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const size = SWATCH_PX * 2
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const scale = Math.max(size / photo.width, size / photo.height)
    const w = photo.width * scale
    const h = photo.height * scale
    try {
      ctx.drawImage(photo.previewBitmap as unknown as CanvasImageSource, (size - w) / 2, (size - h) / 2, w, h)
    } catch {
      // The bitmap was closed out from under us — leave the square blank.
      return
    }
    if (!presetId) return
    const look: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, retro: presetId, retroAmount: 1 }
    const image = ctx.getImageData(0, 0, size, size)
    applyAdjustments(image, look)
    ctx.putImageData(image, 0, 0)
    drawVignette(ctx, size, size, RETRO_PRESETS.find((p) => p.id === presetId)?.vignette ?? 0)
  }, [photo, presetId])

  return <canvas ref={ref} style={{ width: SWATCH_PX, height: SWATCH_PX }} className="block rounded-lg" />
}

interface RetroPanelProps {
  photo: LoadedPhoto
  value: PhotoAdjustments | undefined
  onChange: (adjustments: PhotoAdjustments) => void
  /** Above the styles: which photo is being edited, and the batch's sync. */
  header?: ReactNode
}

/** The Retro tool: our own film styles, previewed on the photo itself, with
 *  how strongly to apply the picked one. The person's Edit sits on top. */
export function RetroPanel({ photo, value, onChange, header }: RetroPanelProps) {
  const tr = useTranslation()
  const current = value ?? DEFAULT_ADJUSTMENTS
  const options: (string | null)[] = [null, ...RETRO_PRESETS.map((p) => p.id)]
  const pick = (id: string | null) => onChange({ ...current, retro: id, retroAmount: id && id !== current.retro ? 1 : current.retroAmount })

  return (
    <div className="flex flex-col gap-3">
      {header}
      <div className="scroll-row -mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-0.5">
        {options.map((id) => {
          const active = (current.retro ?? null) === id
          const name = id ? tr.retro.names[id as keyof typeof tr.retro.names] : tr.retro.none
          return (
            <button
              key={id ?? 'none'}
              type="button"
              aria-pressed={active}
              onClick={() => pick(id)}
              className="flex shrink-0 flex-col items-center gap-1 transition duration-200 active:scale-95"
            >
              <span className={`rounded-[10px] p-[2px] ${active ? 'bg-white' : 'bg-transparent'}`}>
                <RetroSwatch photo={photo} presetId={id} />
              </span>
              <span className={`font-label text-[10px] font-semibold uppercase tracking-wide ${active ? 'text-white' : 'text-white/45'}`}>{name}</span>
            </button>
          )
        })}
      </div>
      {current.retro && (
        <div className="fade-in flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-white/70">{tr.retro.intensity}</span>
            <span className="tabular-nums text-white">{Math.round(current.retroAmount * 100)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={current.retroAmount}
            aria-label={tr.retro.intensity}
            onChange={(e) => onChange({ ...current, retroAmount: Number(e.target.value) })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
          />
        </div>
      )}
    </div>
  )
}
