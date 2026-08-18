import type { CollageOrientation, CollageTemplateStyle } from '../../types'
import { MAX_COLLAGE_PHOTOS, getTemplate, transposeTemplate } from '../../lib/collageTemplates'

interface GridTemplatePickerProps {
  value: number
  style: CollageTemplateStyle
  orientation: CollageOrientation
  onChange: (count: number) => void
}

const COUNTS = Array.from({ length: MAX_COLLAGE_PHOTOS - 1 }, (_, i) => i + 2)

export function GridTemplatePicker({ value, style, orientation, onChange }: GridTemplatePickerProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {COUNTS.map((count) => {
        const base = getTemplate(count, style)
        const template = orientation === 'vertical' ? transposeTemplate(base) : base
        const active = value === count
        return (
          <button
            key={count}
            type="button"
            onClick={() => onChange(count)}
            title={`${count} fotos`}
            className={`grid h-11 w-11 gap-0.5 rounded-lg border p-1 transition ${
              active ? 'border-polar-500 bg-polar-50' : 'border-polar-100 bg-white hover:border-polar-300'
            }`}
            style={{
              gridTemplateColumns: `repeat(${template.cols}, 1fr)`,
              gridTemplateRows: `repeat(${template.rows}, 1fr)`,
            }}
          >
            {template.cells.map((cell, i) => (
              <span
                key={i}
                className={active ? 'bg-polar-400' : 'bg-polar-200'}
                style={{
                  gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
                  gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
                  borderRadius: 2,
                }}
              />
            ))}
          </button>
        )
      })}
    </div>
  )
}
