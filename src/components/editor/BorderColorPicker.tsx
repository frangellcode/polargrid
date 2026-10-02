import { useRef } from 'react'
import { BORDER_COLORS, isCustomBorderColor } from '../../lib/borderColors'
import { ColorPicker } from '../../lib/colorPicker'
import { isNativeApp } from '../../lib/native'
import { useProStore } from '../../store/proStore'
import { useTranslation } from '../../store/languageStore'
import { IconLock } from './icons'

interface BorderColorPickerProps {
  /** A BORDER_COLORS id or a custom "#rrggbb". */
  value: string
  onChange: (id: string) => void
}

/** Every hue once around, so the custom swatch reads as "any colour". */
const RAINBOW = 'conic-gradient(#ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55, #ff3b30)'

/** Swatch picker for the border's own fill color — part of the exported photo,
 *  unlike WorkspaceBackgroundPicker's cosmetic-only backdrop. White is free;
 *  the rest of the palette and the custom colour are PolarGrid Pro. */
export function BorderColorPicker({ value, onChange }: BorderColorPickerProps) {
  const tr = useTranslation()
  const isPro = useProStore((s) => s.isPro)
  const openPaywall = useProStore((s) => s.openPaywall)
  const webInputRef = useRef<HTMLInputElement>(null)
  const custom = isCustomBorderColor(value)

  const pickCustom = async () => {
    if (!isPro) {
      openPaywall('colors')
      return
    }
    if (!isNativeApp) {
      webInputRef.current?.click()
      return
    }
    // The border follows the picker live while it's open; the final colour
    // is applied once more when it closes.
    const listener = await ColorPicker.addListener('colorChange', ({ color }) => onChange(color))
    try {
      const { color } = await ColorPicker.pick({ color: custom ? value : '#ffffff' })
      onChange(color)
    } catch {
      // Picker couldn't open; the border keeps its colour.
    } finally {
      listener.remove()
    }
  }

  return (
    <div>
      <p className="font-label mb-2 text-center text-xs font-semibold uppercase tracking-wider text-white/40">{tr.pickers.borderColor}</p>
      {/* One row, always — see WorkspaceBackgroundPicker. */}
      <div className="mx-auto grid max-w-[340px] gap-2" style={{ gridTemplateColumns: `repeat(${BORDER_COLORS.length + 1}, minmax(0, 1fr))` }}>
        {BORDER_COLORS.map((color) => {
          const active = value === color.id
          const locked = !isPro && color.id !== 'white'
          const label = tr.borderColors[color.id as keyof typeof tr.borderColors] ?? color.label
          return (
            <button
              key={color.id}
              type="button"
              onClick={() => (locked ? openPaywall('colors') : onChange(color.id))}
              title={label}
              aria-label={label}
              className={`relative flex aspect-square w-full items-center justify-center rounded-full ring-2 transition duration-200 active:scale-90 ${
                active ? 'ring-white' : 'ring-transparent hover:ring-white/30'
              }`}
            >
              <span className="h-[80%] w-[80%] rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
              <LockBadge shown={locked} />
            </button>
          )
        })}

        <button
          type="button"
          onClick={pickCustom}
          title={tr.borderColors.custom}
          aria-label={tr.borderColors.custom}
          className={`relative flex aspect-square w-full items-center justify-center rounded-full ring-2 transition duration-200 active:scale-90 ${
            custom ? 'ring-white' : 'ring-transparent hover:ring-white/30'
          }`}
        >
          <span className="relative flex h-[80%] w-[80%] items-center justify-center rounded-full" style={{ background: RAINBOW }}>
            <span
              className="flex h-[66%] w-[66%] items-center justify-center rounded-full border border-black/10 text-sm font-semibold leading-none text-ink-900"
              style={{ backgroundColor: custom ? value : '#ffffff' }}
            >
              {!custom && '+'}
            </span>
          </span>
          <LockBadge shown={!isPro} />
        </button>

        {!isNativeApp && (
          <input
            ref={webInputRef}
            type="color"
            value={custom ? value : '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}

/** Always mounted and faded, so the badges melt away the moment Pro unlocks. */
function LockBadge({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-ink-900 shadow transition duration-300 ease-out ${
        shown ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
      }`}
    >
      <IconLock className="h-2.5 w-2.5" />
    </span>
  )
}
