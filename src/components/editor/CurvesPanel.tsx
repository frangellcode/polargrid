import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from '../../store/languageStore'
import {
  CURVE_CHANNELS,
  IDENTITY_CURVE,
  isIdentityCurve,
  sampleCurve,
  type CurveChannel,
  type CurvePoint,
  type ToneCurves,
} from '../../lib/adjustments'

const IDENTITY: ToneCurves = { rgb: IDENTITY_CURVE, r: IDENTITY_CURVE, g: IDENTITY_CURVE, b: IDENTITY_CURVE }
const STROKE: Record<CurveChannel, string> = { rgb: '#ffffff', r: '#ff5a5a', g: '#4fd07a', b: '#5aa2ff' }
const LABEL: Record<CurveChannel, string> = { rgb: 'RGB', r: 'R', g: 'G', b: 'B' }
/** Points closer than this (in px) to a touch are picked up rather than added. */
const GRAB_PX = 22
/** An inner point dragged this far outside the box is taken off the curve. */
const REMOVE_PX = 28
/** Points keep at least this much apart along x. */
const MIN_GAP = 0.02

const path = (points: CurvePoint[]) => {
  const ys = sampleCurve(points, 65)
  return Array.from(ys, (y, i) => `${i ? 'L' : 'M'}${(i / 64) * 100},${(1 - y) * 100}`).join('')
}

interface CurvesPanelProps {
  value: ToneCurves | null
  onChange: (curves: ToneCurves | null) => void
}

/**
 * Curves: the master tone curve and one per channel. Tap the box to add a
 * point on the curve, drag points to bend it, and drag an inner point out of
 * the box to remove it.
 */
export function CurvesPanel({ value, onChange }: CurvesPanelProps) {
  const tr = useTranslation()
  const curves = value ?? IDENTITY
  const [channel, setChannel] = useState<CurveChannel>('rgb')
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; pointerId: number } | null>(null)
  const [removing, setRemoving] = useState(false)
  const points = curves[channel]

  const commit = (next: CurvePoint[]) => {
    const all = { ...curves, [channel]: next }
    onChange(CURVE_CHANNELS.every((c) => isIdentityCurve(all[c])) ? null : all)
  }

  const locate = (e: { clientX: number; clientY: number }) => {
    const rect = boxRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: 1 - (e.clientY - rect.top) / rect.height, rect }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { x, y, rect } = locate(e)
    let index = -1
    let best = GRAB_PX
    points.forEach(([px, py], i) => {
      const d = Math.hypot((px - x) * rect.width, (py - y) * rect.height)
      if (d < best) {
        best = d
        index = i
      }
    })
    if (index < 0) {
      // A new point, on the curve where the finger is, so nothing jumps.
      const cx = Math.min(1 - MIN_GAP, Math.max(MIN_GAP, x))
      if (points.some(([px]) => Math.abs(px - cx) < MIN_GAP)) return
      const cy = sampleCurve(points, 256)[Math.round(cx * 255)]
      const next = [...points, [cx, cy] as CurvePoint].sort((a, b) => a[0] - b[0])
      index = next.findIndex(([px]) => px === cx)
      commit(next)
    }
    drag.current = { index, pointerId: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const { x, y, rect } = locate(e)
    const last = points.length - 1
    const inner = d.index > 0 && d.index < last
    const outside = Math.max(-y, y - 1, -x, x - 1) * Math.min(rect.width, rect.height)
    setRemoving(inner && outside > REMOVE_PX)
    // The ends stay at the left and right edges; inner points stay between their neighbours.
    const nx = d.index === 0 ? 0 : d.index === last ? 1 : Math.min(points[d.index + 1][0] - MIN_GAP, Math.max(points[d.index - 1][0] + MIN_GAP, x))
    const next = points.map((p, i) => (i === d.index ? ([nx, Math.min(1, Math.max(0, y))] as CurvePoint) : p))
    commit(next)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    if (removing) commit(points.filter((_, i) => i !== d.index))
    setRemoving(false)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {CURVE_CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === channel}
              onClick={() => setChannel(c)}
              className={`font-label relative rounded-full px-2.5 py-1 text-[10px] font-semibold transition active:scale-95 ${
                c === channel ? 'bg-white text-ink-900' : 'bg-white/10 text-white/70'
              }`}
            >
              {c === 'rgb' ? LABEL[c] : <span style={{ color: c === channel ? undefined : STROKE[c] }}>{LABEL[c]}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={isIdentityCurve(points)}
          onClick={() => commit(IDENTITY_CURVE)}
          className="font-label rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70 transition hover:bg-white/15 active:scale-95 disabled:opacity-30"
        >
          {tr.edit.reset}
        </button>
      </div>
      <div
        ref={boxRef}
        className="relative mx-auto aspect-square w-full max-w-[220px] touch-none select-none rounded-lg bg-white/5"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {[25, 50, 75].map((t) => (
            <g key={t} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5}>
              <line x1={t} y1={0} x2={t} y2={100} />
              <line x1={0} y1={t} x2={100} y2={t} />
            </g>
          ))}
          <line x1={0} y1={100} x2={100} y2={0} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} strokeDasharray="2 2" />
          {CURVE_CHANNELS.filter((c) => c !== channel && !isIdentityCurve(curves[c])).map((c) => (
            <path key={c} d={path(curves[c])} fill="none" stroke={STROKE[c]} strokeOpacity={0.3} strokeWidth={1} />
          ))}
          <path d={path(points)} fill="none" stroke={STROKE[channel]} strokeWidth={1.6} />
          {points.map(([x, y], i) => (
            <circle
              key={i}
              cx={x * 100}
              cy={(1 - y) * 100}
              r={3.2}
              fill={removing && drag.current?.index === i ? 'transparent' : STROKE[channel]}
              stroke={STROKE[channel]}
              strokeWidth={1}
              opacity={removing && drag.current?.index === i ? 0.4 : 1}
            />
          ))}
        </svg>
      </div>
      <p className="font-label text-center text-[10px] text-white/40">{tr.edit.curvesHint}</p>
    </div>
  )
}
