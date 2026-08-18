import { ASPECT_RATIOS } from '../../lib/aspectRatios'
import type { AspectRatioPreset } from '../../types'

interface AspectRatioPickerProps {
  value: string
  onChange: (id: string) => void
  options?: AspectRatioPreset[]
}

export function AspectRatioPicker({ value, onChange, options = ASPECT_RATIOS }: AspectRatioPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onChange(preset.id)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            value === preset.id
              ? 'bg-polar-500 text-white'
              : 'bg-polar-50 text-polar-700 hover:bg-polar-100'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
