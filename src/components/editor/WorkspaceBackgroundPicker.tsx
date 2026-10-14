import { getWorkspaceBackground, WORKSPACE_BACKGROUNDS } from '../../lib/workspaceBackgrounds'
import { useTranslation } from '../../store/languageStore'

interface WorkspaceBackgroundPickerProps {
  value: string
  onChange: (id: string) => void
  /** White border only: the photo, for the swatches of the backgrounds made
   *  from it. Without it those aren't offered (and "No background" stands in
   *  for one picked elsewhere). */
  photoThumb?: string | null
}

/** Swatch picker for the editor's workspace backdrop (the area around the canvas). Cosmetic only — not part of the exported photo. */
export function WorkspaceBackgroundPicker({ value, onChange, photoThumb }: WorkspaceBackgroundPickerProps) {
  const tr = useTranslation()
  const options = photoThumb ? WORKSPACE_BACKGROUNDS : WORKSPACE_BACKGROUNDS.filter((bg) => !bg.fromPhoto)
  const fromPhotoPicked = !photoThumb && !!getWorkspaceBackground(value).fromPhoto
  return (
    <div>
      <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.pickers.workspaceBackground}</p>
      {/* One row, always: the swatches size themselves to the width, so all of
          them fit from the smallest phone up instead of one wrapping onto a
          row of its own (which also cost the photo above that much height). */}
      <div className="mx-auto grid max-w-[340px] gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((bg) => {
          const active = value === bg.id || (fromPhotoPicked && bg.id === 'checkered')
          const label = tr.workspaceBackgrounds[bg.id as keyof typeof tr.workspaceBackgrounds] ?? bg.label
          return (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChange(bg.id)}
              title={label}
              aria-label={label}
              className={`flex aspect-square w-full items-center justify-center rounded-full ring-2 transition duration-200 active:scale-90 ${
                active ? 'ring-white' : 'ring-transparent hover:ring-white/30'
              }`}
            >
              {bg.fromPhoto && photoThumb ? (
                <span className="relative h-[80%] w-[80%] overflow-hidden rounded-full border border-black/10">
                  <img
                    src={photoThumb}
                    alt=""
                    draggable={false}
                    className={`absolute inset-0 h-full w-full object-cover ${bg.fromPhoto === 'blur' ? 'scale-125 blur-[3px]' : ''}`}
                  />
                </span>
              ) : (
                <span
                  className={`h-[80%] w-[80%] rounded-full border border-black/10 ${
                    bg.hex ? '' : 'bg-[repeating-conic-gradient(#b6bcc4_0%_25%,#c2c6ca_0%_50%)] bg-[length:10px_10px]'
                  }`}
                  style={bg.hex ? { backgroundColor: bg.hex } : undefined}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
