import type { CellShape, CollageOrientation } from '../../types'
import { getTemplatesForCount, transposeTemplate } from '../../lib/collageTemplates'

interface GridTemplatePickerProps {
  count: number
  value: string
  /** Currently selected cell shape, just for previewing each thumbnail. */
  shape: CellShape
  orientation: CollageOrientation
  onChange: (templateId: string) => void
}

/** Corner radius for a thumbnail cell, matching the previewed shape. Percentage-based
 *  (not a fixed px grid) so it stays correct at thumbnail scale for both coarse
 *  tilings and finer grids alike. */
function cellRadius(shape: CellShape) {
  if (shape === 'rounded') return '28%'
  return '2px'
}

export function GridTemplatePicker({ count, value, shape, orientation, onChange }: GridTemplatePickerProps) {
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
            className={`h-11 w-11 rounded-lg border p-1 transition duration-200 active:scale-90 ${
              active ? 'border-white bg-white/10' : 'border-white/15 bg-white/5 hover:border-white/30'
            }`}
          >
            <div className="relative h-full w-full">
              {template.cells.map((cell, i) => (
                <span
                  key={i}
                  className={`absolute transition-[border-radius,left,top,width,height] duration-200 ${active ? 'bg-white' : 'bg-white/25'}`}
                  style={{
                    // calc(), not a plain percentage + margin, so the 1px gap actually
                    // insets the box instead of just shifting an absolutely-positioned
                    // element (margin doesn't shrink width/height there).
                    left: `calc(${(cell.col / template.cols) * 100}% + 1px)`,
                    top: `calc(${(cell.row / template.rows) * 100}% + 1px)`,
                    width: `calc(${(cell.colSpan / template.cols) * 100}% - 2px)`,
                    height: `calc(${(cell.rowSpan / template.rows) * 100}% - 2px)`,
                    borderRadius: cellRadius(shape),
                  }}
                />
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}
