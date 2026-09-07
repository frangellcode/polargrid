import { useEffect, useRef } from 'react'
import type { LoadedPhoto } from '../../types'

/** Drawn at 2x so the thumbnails stay crisp on a phone screen. */
const THUMB_PX = 34

interface BitmapThumbProps {
  photo: LoadedPhoto
  selected: boolean
}

/**
 * One photo of the batch, drawn from the preview bitmap the app already holds.
 *
 * A canvas rather than an <img src={URL.createObjectURL(photo.file)}>: that
 * would have the browser decode the original file all over again, once per
 * thumbnail, at the exact moment this app is trying hardest to keep decoded
 * pixels down. The preview bitmap is already in memory and a 34px square costs
 * nothing to draw from it.
 */
function BitmapThumb({ photo, selected }: BitmapThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const bitmap = photo.previewBitmap as unknown as CanvasImageSource
    const size = THUMB_PX * 2
    canvas.width = size
    canvas.height = size
    // Cover-cropped square, same as the cells: a thumbnail letterboxed inside
    // its own button reads as a broken image at this size.
    const scale = Math.max(size / photo.width, size / photo.height)
    const w = photo.width * scale
    const h = photo.height * scale
    try {
      ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
    } catch {
      // The bitmap was closed out from under us (the photo left the batch
      // between render and effect) — leave the square blank rather than throw.
    }
  }, [photo])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: THUMB_PX, height: THUMB_PX }}
      className={`block rounded-md object-cover transition duration-200 ${
        selected ? 'opacity-100' : 'opacity-45'
      }`}
    />
  )
}

interface BatchStripProps {
  photos: LoadedPhoto[]
  selectedIndex: number
  onSelect: (index: number) => void
  /** Right-hand note, e.g. "same adjustment for all 5". */
  note: string
  thumbLabel: (index: number) => string
}

/**
 * The batch's own row: every photo in it, with the one being previewed
 * highlighted.
 *
 * The canvas can only ever show one photo, and it always showed the first, so
 * a batch of five was framed on the strength of one of them — you couldn't see
 * what the crop did to the other four until they were in your camera roll.
 * Tapping a thumbnail previews that one instead; the adjustment still belongs
 * to the whole batch, which is what the note on the right is for.
 */
export function BatchStrip({ photos, selectedIndex, onSelect, note, thumbLabel }: BatchStripProps) {
  return (
    <div className="mx-4 mt-2 flex items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-2">
      {/* Scrolls rather than wraps: five is the cap today, but a wrapped second
          row would push the canvas down on the screen it matters most on. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            aria-label={thumbLabel(i + 1)}
            aria-pressed={i === selectedIndex}
            onClick={() => onSelect(i)}
            className={`shrink-0 rounded-md p-[2px] transition duration-200 active:scale-90 ${
              i === selectedIndex ? 'bg-white' : 'bg-transparent'
            }`}
          >
            <BitmapThumb photo={photo} selected={i === selectedIndex} />
          </button>
        ))}
      </div>
      <p className="font-label shrink-0 text-[10px] leading-tight text-white/50">{note}</p>
    </div>
  )
}
