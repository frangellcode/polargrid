import { ASPECT_RATIOS } from '../../lib/aspectRatios'
import type { AspectRatioPreset, Orientation } from '../../types'

interface AspectRatioPickerProps {
  value: string
  onChange: (id: string) => void
  options?: AspectRatioPreset[]
  orientation?: Orientation
  onOrientationChange?: (orientation: Orientation) => void
}

/**
 * Each ratio is listed once, in its portrait form (e.g. "9:16" — not also a
 * separate "16:9"). The orientation toggle below covers the landscape flip
 * for whichever ratio is selected, and only shows up when that ratio
 * actually has one (`orientable`) — Original/1:1/Manual don't.
 */
export function AspectRatioPicker({
  value,
  onChange,
  options = ASPECT_RATIOS,
  orientation = 'vertical',
  onOrientationChange,
}: AspectRatioPickerProps) {
  const selected = options.find((o) => o.id === value)
  const showOrientation = !!onOrientationChange && selected?.orientable

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {options.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              value === preset.id
                ? 'bg-polar-500 text-white'
                : 'bg-polar-50 text-polar-700 hover:bg-polar-100'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {showOrientation && (
        <div className="flex justify-center gap-2">
          {(['vertical', 'horizontal'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onOrientationChange(o)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                orientation === o
                  ? 'bg-polar-500 text-white'
                  : 'bg-polar-50 text-polar-700 hover:bg-polar-100'
              }`}
            >
              {o === 'vertical' ? 'Vertical' : 'Horizontal'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
