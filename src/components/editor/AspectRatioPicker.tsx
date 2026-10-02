import type { ReactNode } from 'react'
import { ASPECT_RATIOS } from '../../lib/aspectRatios'
import type { AspectRatioPreset, Orientation } from '../../types'
import { SegmentedToggle } from './SegmentedToggle'

interface AspectRatioPickerProps {
  value: string
  onChange: (id: string) => void
  options?: AspectRatioPreset[]
  orientation?: Orientation
  onOrientationChange?: (orientation: Orientation) => void
  /** Another toggle for the same row as the orientation one, after a divider
   *  (the border editor's Locked/Unlocked). */
  extra?: ReactNode
}

/**
 * Each ratio is listed once, in its portrait form (e.g. "9:16" — not also a
 * separate "16:9"). The orientation toggle below covers the landscape flip
 * for whichever ratio is selected; for one that has none (Original, 1:1) it
 * stays in place but dimmed, so the row never reflows.
 *
 * Kept to two short rows — the ratios in one bar, the toggles side by side —
 * because every row this panel adds is height taken from the photo above it.
 */
export function AspectRatioPicker({
  value,
  onChange,
  options = ASPECT_RATIOS,
  orientation = 'vertical',
  onOrientationChange,
  extra,
}: AspectRatioPickerProps) {
  const selected = options.find((o) => o.id === value)
  const orientable = !!selected?.orientable

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex max-w-full rounded-full bg-white/10 p-0.5">
        {options.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            className={`font-label whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition duration-200 active:scale-90 sm:px-3.5 ${
              value === preset.id ? 'bg-white text-ink-900 shadow' : 'text-white/70 hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {(onOrientationChange || extra) && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          {onOrientationChange && (
            <div className={`transition-opacity duration-200 ${orientable ? '' : 'pointer-events-none opacity-30'}`} aria-disabled={!orientable}>
              <SegmentedToggle
                options={[
                  { value: 'vertical', label: 'Vertical' },
                  { value: 'horizontal', label: 'Horizontal' },
                ]}
                value={orientation}
                onChange={onOrientationChange}
              />
            </div>
          )}
          {onOrientationChange && extra && <span aria-hidden className="h-5 w-px bg-white/15" />}
          {extra}
        </div>
      )}
    </div>
  )
}
