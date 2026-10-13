import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from '../../store/languageStore'
import { DEFAULT_ADJUSTMENTS, TONE_KEYS, type AdjustmentKey, type PhotoAdjustments } from '../../lib/adjustments'
import { useProStore } from '../../store/proStore'
import { IconGrain, IconLock, IconSharpen } from './icons'

/** Order of the dials, light first, then colour, then detail. */
const KEYS: AdjustmentKey[] = [...TONE_KEYS, 'sharpness', 'grain']
const BIPOLAR = new Set<AdjustmentKey>(TONE_KEYS)
/** Light and colour are free; the film detail is PolarGrid Pro. */
const PRO_KEYS = new Set<AdjustmentKey>(['sharpness', 'grain'])

/** Slider tracks that show which way each colour slider pushes. */
const TRACKS: Partial<Record<AdjustmentKey, string>> = {
  temperature: 'linear-gradient(to right, #4f8fd8, rgba(255,255,255,0.25), #e3b341)',
  tint: 'linear-gradient(to right, #4fae6b, rgba(255,255,255,0.25), #c260b8)',
  saturation: 'linear-gradient(to right, #8a8a8a, rgba(255,255,255,0.25), #e2574c)',
  vibrance: 'linear-gradient(to right, #8a8a8a, rgba(255,255,255,0.25), #d9873a)',
}

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    {children}
  </svg>
)

const ICONS: Record<AdjustmentKey, ReactNode> = {
  exposure: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M7.5 12h3M9 10.5v3M13.5 12h3" />
    </>,
  ),
  contrast: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
    </>,
  ),
  highlights: svg(
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>,
  ),
  shadows: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M6 15.5h12M7.5 18.5h9M5 12.5h14" />
    </>,
  ),
  whites: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" opacity={0.35} />
    </>,
  ),
  blacks: svg(<circle cx="12" cy="12" r="8" fill="currentColor" />),
  temperature: svg(<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z M12 14v3" />),
  tint: svg(<path d="M12 3s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12Z" />),
  vibrance: svg(<path d="M12 3l2.4 5.6 6 .6-4.6 4 1.4 6L12 16l-5.2 3.2 1.4-6-4.6-4 6-.6Z" />),
  saturation: svg(
    <>
      <path d="M12 3s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12Z" />
      <path d="M5 15a7 7 0 0 0 14 0Z" fill="currentColor" />
    </>,
  ),
  sharpness: <IconSharpen className="h-[18px] w-[18px]" />,
  grain: <IconGrain className="h-[18px] w-[18px]" />,
}

const RING_R = 20
const RING_C = 2 * Math.PI * RING_R

/** One dial: its icon in a ring that fills with the value, clockwise for
 *  positive and anticlockwise for negative — like the Photos app's editor —
 *  with its name underneath, so nobody has to tap through them to find one. */
function Dial({
  icon,
  value,
  active,
  proBadge,
  locked,
  label,
  onClick,
}: {
  icon: ReactNode
  value: number
  active: boolean
  /** Has a Pro badge slot: shown while `locked`, faded out with Pro. */
  proBadge: boolean
  locked: boolean
  label: string
  onClick: () => void
}) {
  const share = Math.min(1, Math.abs(value))
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className="flex w-[64px] shrink-0 flex-col items-center gap-1 transition duration-200 active:scale-90"
    >
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full">
      <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={RING_R} fill={active ? 'rgba(255,255,255,0.14)' : 'none'} stroke="rgba(255,255,255,0.15)" strokeWidth={2.5} />
        {share > 0 && (
          <circle
            cx="24"
            cy="24"
            r={RING_R}
            fill="none"
            stroke="white"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${share * RING_C} ${RING_C}`}
            // Negative values run the other way round from the top.
            transform={value < 0 ? 'scale(1,-1) translate(0,-48)' : undefined}
          />
        )}
      </svg>
      <span className={`relative ${active || value !== 0 ? 'text-white' : 'text-white/55'}`}>{icon}</span>
      {proBadge && (
        // Always mounted and faded, so it melts away when Pro unlocks.
        <span
          aria-hidden
          className={`absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-300 text-ink-900 shadow transition duration-300 ease-out ${
            locked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          <IconLock className="h-2.5 w-2.5" />
        </span>
      )}
      </span>
      <span
        className={`font-label max-w-full truncate text-[9px] font-semibold uppercase tracking-normal ${
          locked ? 'text-amber-300/80' : active ? 'text-white' : 'text-white/45'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

interface AdjustmentsPanelProps {
  value: PhotoAdjustments | undefined
  onChange: (adjustments: PhotoAdjustments) => void
  /** Above the dials: which photo is being edited, and the batch's sync. */
  header?: ReactNode
  /** Edit's own screen: its other tools after the dials in the same row
   *  (Aspect, Rotate…), the row moved to the bottom like a toolbar, and the
   *  picked tool's controls shown where the slider goes. */
  tools?: PanelTool[]
  activeTool?: string | null
  onToolChange?: (id: string | null) => void
  toolPanel?: ReactNode
}

export interface PanelTool {
  id: string
  label: string
  icon: ReactNode
  /** Opens the paywall instead, with a lock badge, while true. */
  locked?: boolean
  onLocked?: () => void
}

/**
 * The Edit tool's panel, laid out like the Photos app's: a row of dials, one
 * per adjustment, and only the picked one's slider underneath — so the panel
 * stays short and the photo keeps the screen. Tapping the number puts that
 * one back to 0; Reset clears the photo's whole edit (its Retro style stays).
 */
export function AdjustmentsPanel({ value, onChange, header, tools, activeTool = null, onToolChange, toolPanel }: AdjustmentsPanelProps) {
  const tr = useTranslation()
  const isPro = useProStore((s) => s.isPro)
  const openPaywall = useProStore((s) => s.openPaywall)
  const [activeKey, setActiveKey] = useState<AdjustmentKey>('exposure')
  const current = value ?? DEFAULT_ADJUSTMENTS
  const set = (key: AdjustmentKey, v: number) => onChange({ ...current, [key]: v })
  const v = current[activeKey]
  const shown = Math.round(v * 100)
  const bipolar = BIPOLAR.has(activeKey)
  const edited = KEYS.some((k) => current[k] !== 0)

  const row = (
    <div className="scroll-row -mx-1 flex gap-0.5 overflow-x-auto overscroll-x-contain px-1 pt-1">
      {KEYS.map((k) => (
        <Dial
          key={k}
          icon={ICONS[k]}
          value={current[k]}
          active={activeTool == null && k === activeKey}
          proBadge={PRO_KEYS.has(k)}
          locked={!isPro && PRO_KEYS.has(k)}
          label={tr.edit[k]}
          onClick={() => {
            if (!isPro && PRO_KEYS.has(k)) {
              openPaywall('detail')
              return
            }
            onToolChange?.(null)
            setActiveKey(k)
          }}
        />
      ))}
      {tools && tools.length > 0 && <span aria-hidden className="mx-1 my-2 w-px shrink-0 self-stretch bg-white/15" />}
      {tools?.map((t) => (
        <Dial
          key={t.id}
          icon={t.icon}
          value={0}
          active={t.id === activeTool}
          proBadge={t.locked !== undefined}
          locked={!!t.locked}
          label={t.label}
          onClick={() => (t.locked ? t.onLocked?.() : onToolChange?.(t.id === activeTool ? null : t.id))}
        />
      ))}
    </div>
  )
  const slider = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-label text-xs font-semibold uppercase tracking-wider text-white/70">{tr.edit[activeKey]}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`${tr.edit.reset}: ${tr.edit[activeKey]}`}
            onClick={() => set(activeKey, 0)}
            className="rounded-full px-1.5 py-1 tabular-nums text-white transition active:scale-90"
          >
            {shown > 0 && bipolar ? `+${shown}` : shown}
          </button>
          <button
            type="button"
            disabled={!edited}
            onClick={() => onChange({ ...DEFAULT_ADJUSTMENTS, retro: current.retro, retroAmount: current.retroAmount })}
            className="font-label rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70 transition hover:bg-white/15 active:scale-95 disabled:opacity-30"
          >
            {tr.edit.reset}
          </button>
        </div>
      </div>
      <input
        type="range"
        min={bipolar ? -1 : 0}
        max={1}
        step={0.01}
        value={v}
        aria-label={tr.edit[activeKey]}
        onChange={(e) => set(activeKey, Number(e.target.value))}
        onDoubleClick={() => set(activeKey, 0)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
        style={TRACKS[activeKey] ? { background: TRACKS[activeKey] } : undefined}
      />
    </div>
  )

  // Edit's own screen: controls on top, the row at the bottom like a toolbar.
  if (tools) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        {activeTool ? toolPanel : slider}
        {row}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* pt-1 on the row: the scroll row clips vertically too, and the Pro
          dials' badges sit just above their rings. */}
      {header}
      {row}
      {slider}
    </div>
  )
}
