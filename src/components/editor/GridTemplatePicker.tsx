import type { CollageOrientation } from '../../types'
import { getTemplatesForCount, transposeTemplate } from '../../lib/collageTemplates'

interface GridTemplatePickerProps {
  count: number
  value: string
  orientation: CollageOrientation
  onChange: (templateId: string) => void
}

export function GridTemplatePicker({ count, value, orientation, onChange }: GridTemplatePickerProps) {
  const templates = getTemplatesForCount(count)
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {templates.map((base) => {
        const template = orientation === 'vertical' ? transposeTemplate(base) : base
        const active = value === base.id
        return (
          <button
            key={base.id}
            type="button"
            onClick={() => onChange(base.id)}
            title={base.label}
            className={`grid h-11 w-11 gap-0.5 rounded-lg border p-1 transition duration-200 active:scale-90 ${
              active ? 'border-white bg-white/10' : 'border-white/15 bg-white/5 hover:border-white/30'
            }`}
            style={{
              gridTemplateColumns: `repeat(${template.cols}, 1fr)`,
              gridTemplateRows: `repeat(${template.rows}, 1fr)`,
            }}
          >
            {template.cells.map((cell, i) => (
              <span
                key={i}
                className={active ? 'bg-white' : 'bg-white/25'}
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
