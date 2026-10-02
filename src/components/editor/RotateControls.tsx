import type { PhotoTransform } from '../../types'
import { flipTransform, rotateTransform } from '../../lib/cropMath'
import { useTranslation } from '../../store/languageStore'
import { IconFlip, IconRotate } from './icons'

interface RotateControlsProps {
  transform: PhotoTransform
  onChange: (transform: PhotoTransform) => void
}

/** Quarter turns and flips for the photo being edited — the border editor's
 *  Rotate panel. Free for everyone: it's arranging a photo, not an effect. */
export function RotateControls({ transform, onChange }: RotateControlsProps) {
  const tr = useTranslation()
  const actions = [
    { label: tr.borderEditor.rotateLeft, icon: <IconRotate className="h-5 w-5 -scale-x-100" />, apply: () => rotateTransform(transform, -1) },
    { label: tr.borderEditor.rotateRight, icon: <IconRotate className="h-5 w-5" />, apply: () => rotateTransform(transform, 1) },
    { label: tr.borderEditor.flipHorizontal, icon: <IconFlip className="h-5 w-5" />, apply: () => flipTransform(transform, 'h') },
    { label: tr.borderEditor.flipVertical, icon: <IconFlip className="h-5 w-5 rotate-90" />, apply: () => flipTransform(transform, 'v') },
  ]
  // Every label on exactly two lines — the verb, then which way — so the four
  // read as one even row. Left to wrap on their own, "Flip horizontal" took
  // two lines next to three one-liners and nothing lined up.
  const lines = (label: string) => {
    const space = label.indexOf(' ')
    return space < 0 ? [label, ''] : [label.slice(0, space), label.slice(space + 1)]
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((action) => {
        const [verb, direction] = lines(action.label)
        return (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            onClick={() => onChange(action.apply())}
            className="font-label flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 px-1 py-2.5 text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/70 transition duration-200 hover:bg-white/15 active:scale-95"
          >
            {action.icon}
            <span className="flex flex-col items-center text-center">
              <span>{verb}</span>
              <span className="text-white/45">{direction || '\u00a0'}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
