import { useState } from 'react'
import { useTranslation } from '../../store/languageStore'
import { HSL_BAND_HUES, HSL_BANDS, type HslBand, type HslMix, type HslShift } from '../../lib/adjustments'

const swatch = (hue: number, s = 80, l = 55) => `hsl(${hue}, ${s}%, ${l}%)`

interface ColorMixPanelProps {
  value: HslMix
  onChange: (mix: HslMix) => void
}

/**
 * The colour mix: pick a colour, then shift its hue, saturation and
 * luminance on their own — the sky bluer, the grass less yellow — without
 * touching the rest of the photo.
 */
export function ColorMixPanel({ value, onChange }: ColorMixPanelProps) {
  const tr = useTranslation()
  const [band, setBand] = useState<HslBand>('red')
  const shift: HslShift = value[band] ?? [0, 0, 0]
  const hue = HSL_BAND_HUES[band]

  const set = (index: 0 | 1 | 2, v: number) => {
    const next: HslShift = [...shift]
    next[index] = v
    onChange({ ...value, [band]: next })
  }

  const sliders: { label: string; track: string }[] = [
    { label: tr.edit.hue, track: `linear-gradient(to right, ${swatch(hue - 30)}, ${swatch(hue)}, ${swatch(hue + 30)})` },
    { label: tr.edit.saturation, track: `linear-gradient(to right, ${swatch(hue, 0)}, ${swatch(hue, 100)})` },
    { label: tr.edit.luminance, track: `linear-gradient(to right, ${swatch(hue, 70, 20)}, ${swatch(hue, 70, 80)})` },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-label text-xs font-semibold uppercase tracking-wider text-white/70">{tr.edit.bands[band]}</span>
        <div className="flex gap-1.5">
          {HSL_BANDS.map((b) => {
            const edited = value[b]?.some((v) => v !== 0)
            return (
              <button
                key={b}
                type="button"
                aria-label={tr.edit.bands[b]}
                aria-pressed={b === band}
                onClick={() => setBand(b)}
                className={`relative h-6 w-6 rounded-full transition active:scale-90 ${b === band ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : ''}`}
                style={{ background: swatch(HSL_BAND_HUES[b], 75, 52) }}
              >
                {edited && <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white" />}
              </button>
            )
          })}
        </div>
      </div>
      {sliders.map((s, i) => {
        const v = shift[i]
        const shown = Math.round(v * 100)
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="font-label w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/50">{s.label}</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={v}
              aria-label={`${tr.edit.bands[band]} ${s.label}`}
              onChange={(e) => set(i as 0 | 1 | 2, Number(e.target.value))}
              onDoubleClick={() => set(i as 0 | 1 | 2, 0)}
              className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-white"
              style={{ background: s.track }}
            />
            <button
              type="button"
              aria-label={`${tr.edit.reset}: ${s.label}`}
              onClick={() => set(i as 0 | 1 | 2, 0)}
              className="w-9 shrink-0 rounded-full py-1 text-right text-xs tabular-nums text-white transition active:scale-90"
            >
              {shown > 0 ? `+${shown}` : shown}
            </button>
          </div>
        )
      })}
    </div>
  )
}
