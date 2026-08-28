import { BORDER_COLORS } from '../../lib/borderColors'
import { useTranslation } from '../../store/languageStore'

interface BorderColorPickerProps {
  value: string
  onChange: (id: string) => void
}

/** Swatch picker for the border's own fill color — part of the exported photo,
 *  unlike WorkspaceBackgroundPicker's cosmetic-only backdrop. */
export function BorderColorPicker({ value, onChange }: BorderColorPickerProps) {
  const tr = useTranslation()
  return (
    <div>
      <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.pickers.borderColor}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {BORDER_COLORS.map((color) => {
          const active = value === color.id
          const label = tr.borderColors[color.id as keyof typeof tr.borderColors] ?? color.label
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => onChange(color.id)}
              title={label}
              aria-label={label}
              className={`flex h-11 w-11 items-center justify-center rounded-full ring-2 transition duration-200 active:scale-90 ${
                active ? 'ring-white' : 'ring-transparent hover:ring-white/30'
              }`}
            >
              <span className="h-9 w-9 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
