import { WORKSPACE_BACKGROUNDS } from '../../lib/workspaceBackgrounds'
import { useTranslation } from '../../store/languageStore'

interface WorkspaceBackgroundPickerProps {
  value: string
  onChange: (id: string) => void
}

/** Swatch picker for the editor's workspace backdrop (the area around the canvas). Cosmetic only — not part of the exported photo. */
export function WorkspaceBackgroundPicker({ value, onChange }: WorkspaceBackgroundPickerProps) {
  const tr = useTranslation()
  return (
    <div>
      <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.pickers.workspaceBackground}</p>
      <div className="flex flex-wrap justify-center gap-3">
        {WORKSPACE_BACKGROUNDS.map((bg) => {
          const active = value === bg.id
          const label = tr.workspaceBackgrounds[bg.id as keyof typeof tr.workspaceBackgrounds] ?? bg.label
          return (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChange(bg.id)}
              title={label}
              aria-label={label}
              className={`flex h-11 w-11 items-center justify-center rounded-full ring-2 transition duration-200 active:scale-90 ${
                active ? 'ring-white' : 'ring-transparent hover:ring-white/30'
              }`}
            >
              <span
                className={`h-9 w-9 rounded-full border border-black/10 ${
                  bg.hex ? '' : 'bg-[repeating-conic-gradient(#b6bcc4_0%_25%,#c2c6ca_0%_50%)] bg-[length:10px_10px]'
                }`}
                style={bg.hex ? { backgroundColor: bg.hex } : undefined}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
