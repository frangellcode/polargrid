import { useEffect, useMemo, useState } from 'react'
import { Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva'
import type { CollageBackdrop, FreeFrame, LoadedPhoto } from '../../types'
import { useTranslation } from '../../store/languageStore'
import { useEditorStore } from '../../store/editorStore'
import { MAX_CAROUSEL_POSTS, MIN_CAROUSEL_POSTS } from '../../lib/carouselTemplates'
import { photoBackdrop } from '../../lib/storyBackdrop'
import { DEFAULT_TRANSFORM, getImageDrawRect } from '../../lib/cropMath'
import { adjustmentsKey, type PhotoAdjustments } from '../../lib/adjustments'
import { BitmapThumb } from './BatchStrip'
import { IconLock } from './icons'

const chip = (on: boolean) =>
  `font-label rounded-full px-3 py-1.5 text-xs font-semibold transition duration-200 active:scale-90 ${on ? 'bg-white text-ink-900' : 'bg-white/10 text-white/70'}`

/** How many posts the carousel spans, each drawn as a little strip of 4:5 boxes. */
export function PostsPicker({ value, onChange }: { value: number; onChange: (posts: number) => void }) {
  const tr = useTranslation()
  const counts = Array.from({ length: MAX_CAROUSEL_POSTS - MIN_CAROUSEL_POSTS + 1 }, (_, i) => MIN_CAROUSEL_POSTS + i)
  return (
    <div className="flex flex-col gap-2">
      <p className="font-label text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.carousel.postsHeading}</p>
      <div className="flex justify-center gap-2">
        {counts.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={n === value}
            onClick={() => onChange(n)}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-2.5 py-2 transition duration-200 active:scale-90 ${n === value ? 'bg-white/15' : 'bg-white/5'}`}
          >
            <span className="flex gap-[2px]">
              {Array.from({ length: n }, (_, k) => (
                <span key={k} className={`h-[15px] w-[12px] rounded-[2px] ${n === value ? 'bg-white' : 'bg-white/30'}`} />
              ))}
            </span>
            <span className={`font-label text-[11px] font-semibold ${n === value ? 'text-white' : 'text-white/55'}`}>{n}</span>
          </button>
        ))}
      </div>
      <p className="font-label text-center text-[11px] text-white/40">{tr.carousel.seamsHint}</p>
    </div>
  )
}

/** Free mode's frame for every photo, and a button to lay them out again. */
export function FramePicker({ value, onChange, onSpread }: { value: FreeFrame; onChange: (frame: FreeFrame) => void; onSpread: () => void }) {
  const tr = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {(['none', 'border', 'polaroid'] as FreeFrame[]).map((f) => (
          <button key={f} type="button" aria-pressed={f === value} onClick={() => onChange(f)} className={chip(f === value)}>
            {tr.carousel.frames[f]}
          </button>
        ))}
      </div>
      <button type="button" onClick={onSpread} className="font-label rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/80 transition active:scale-95">
        {tr.carousel.spread}
      </button>
    </div>
  )
}

/** Which of the carousel's photos sits behind everything, and how. */
export function BackdropPicker({
  value,
  photoIds,
  photos,
  onChange: change,
  locked = false,
  onLocked,
}: {
  value: CollageBackdrop | null
  photoIds: string[]
  photos: Record<string, LoadedPhoto>
  onChange: (backdrop: CollageBackdrop | null) => void
  /** Without Pro: every choice opens the paywall instead. */
  locked?: boolean
  onLocked?: () => void
}) {
  const tr = useTranslation()
  const onChange = (b: CollageBackdrop | null) => (locked ? onLocked?.() : change(b))
  // The backdrop photo may have been taken off the canvas; it stays offered.
  const ids = value && !photoIds.includes(value.photoId) ? [value.photoId, ...photoIds] : photoIds
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-label flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/40">
          {tr.carousel.backdropHeading}
          {locked && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-300 text-ink-900">
              <IconLock className="h-2.5 w-2.5" />
            </span>
          )}
        </span>
        <div className="flex gap-1.5">
          {[true, false].map((blur) => (
            <button
              key={String(blur)}
              type="button"
              disabled={!value && !locked}
              onClick={() => value && onChange({ ...value, blur })}
              className={`${chip(!!value && value.blur === blur)} disabled:opacity-30`}
            >
              {blur ? tr.carousel.blurred : tr.carousel.sharp}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-row flex items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`font-label flex h-12 shrink-0 items-center rounded-md px-3 text-[11px] font-semibold transition active:scale-90 ${value ? 'bg-white/10 text-white/70' : 'bg-white text-ink-900'}`}
        >
          {tr.carousel.backdropNone}
        </button>
        {ids.map((id) => {
          const p = photos[id]
          if (!p) return null
          const active = value?.photoId === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ photoId: id, blur: value?.blur ?? true })}
              className={`shrink-0 rounded-md p-[2px] transition duration-200 active:scale-90 ${active ? 'bg-white' : 'bg-transparent'}`}
            >
              <BitmapThumb photo={p} selected={active} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The backdrop photo on the preview canvas: blurred (the export's own small
 *  blurred copy, stretched) or the photo itself, cropped to fill. */
export function BackdropLayer({
  backdrop,
  width,
  height,
  adjustments,
}: {
  backdrop: CollageBackdrop | null
  width: number
  height: number
  adjustments: PhotoAdjustments | undefined
}) {
  const photo = useEditorStore((s) => (backdrop ? s.photos[backdrop.photoId] : undefined))
  const showOriginal = useEditorStore((s) => s.showOriginal)
  const editKey = showOriginal ? '' : adjustmentsKey(adjustments)
  const [image, setImage] = useState<HTMLCanvasElement | null>(null)
  const blur = !!backdrop?.blur
  useEffect(() => {
    if (!photo) {
      setImage(null)
      return
    }
    setImage(photoBackdrop(photo.previewBitmap, DEFAULT_TRANSFORM, showOriginal ? null : adjustments, blur ? 'blur' : 'sharp'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the edit's values, not the object
  }, [photo, blur, editKey])
  const rect = useMemo(() => (image ? getImageDrawRect(width, height, image.width, image.height, DEFAULT_TRANSFORM) : null), [image, width, height])
  if (!image || !rect) return null
  return (
    <Group listening={false} clipX={0} clipY={0} clipWidth={width} clipHeight={height}>
      <KonvaImage image={image} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
    </Group>
  )
}

/** Where each post ends, over the preview only — never exported. */
export function SeamsOverlay({ posts, width, height }: { posts: number; width: number; height: number }) {
  const unit = Math.min(width / posts, height) / 40
  return (
    <Group listening={false}>
      {Array.from({ length: posts - 1 }, (_, k) => {
        const x = (width * (k + 1)) / posts
        return (
          <Line key={k} points={[x, 0, x, height]} stroke="#ffffff" strokeWidth={unit * 0.45} dash={[unit * 1.6, unit * 1.2]} opacity={0.75} shadowColor="#000" shadowBlur={unit} shadowOpacity={0.5} />
        )
      })}
      {Array.from({ length: posts }, (_, k) => (
        <Group key={k} x={(width * k) / posts + unit * 1.2} y={unit * 1.2}>
          <Rect width={unit * 3.4} height={unit * 3.4} cornerRadius={unit * 1.7} fill="rgba(0,0,0,0.45)" />
          <Text text={String(k + 1)} width={unit * 3.4} height={unit * 3.4} align="center" verticalAlign="middle" fontSize={unit * 2} fontStyle="600" fill="#ffffff" />
        </Group>
      ))}
    </Group>
  )
}
