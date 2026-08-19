import { WORKSPACE_BACKGROUNDS } from '../../lib/workspaceBackgrounds'

interface WorkspaceBackgroundPickerProps {
  value: string
  onChange: (id: string) => void
}

/** Swatch picker for the editor's workspace backdrop (the area around the canvas). Cosmetic only — not part of the exported photo. */
export function WorkspaceBackgroundPicker({ value, onChange }: WorkspaceBackgroundPickerProps) {
  return (
    <div>
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">Fondo del área de trabajo</p>
      <div className="flex flex-wrap justify-center gap-3">
        {WORKSPACE_BACKGROUNDS.map((bg) => {
          const active = value === bg.id
          return (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChange(bg.id)}
              title={bg.label}
              aria-label={bg.label}
              className={`flex h-11 w-11 items-center justify-center rounded-full ring-2 transition duration-200 active:scale-90 ${
                active ? 'ring-polar-500' : 'ring-transparent hover:ring-polar-200'
              }`}
            >
              <span
                className={`h-9 w-9 rounded-full border border-black/10 ${
                  bg.hex ? '' : 'bg-[repeating-conic-gradient(#e2e8f0_0%_25%,#eef2f6_0%_50%)] bg-[length:10px_10px]'
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
