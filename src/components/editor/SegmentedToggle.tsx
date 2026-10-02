import { useLayoutEffect, useRef, useState } from 'react'

interface SegmentedToggleProps<T extends string | boolean> {
  options: readonly [{ value: T; label: string }, { value: T; label: string }]
  value: T
  onChange: (value: T) => void
}

/**
 * Two choices in one pill, with the white highlight sliding to whichever is
 * picked — half the height of two separate buttons, and it reads as one
 * either/or setting rather than two unrelated buttons.
 *
 * Each choice is only as wide as its own label (equal halves sized to the
 * longer one cost enough width that two toggles no longer fit side by side
 * on a phone), so the highlight is measured off the buttons themselves.
 */
export function SegmentedToggle<T extends string | boolean>({ options, value, onChange }: SegmentedToggleProps<T>) {
  const index = options[1].value === value ? 1 : 0
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [highlight, setHighlight] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      const button = buttonRefs.current[index]
      if (button) setHighlight({ left: button.offsetLeft, width: button.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    buttonRefs.current.forEach((b) => b && observer.observe(b))
    return () => observer.disconnect()
  }, [index])

  return (
    <div className="relative flex shrink-0 rounded-full bg-white/10 p-0.5">
      {highlight && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-full bg-white shadow transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: highlight.left, width: highlight.width }}
        />
      )}
      {options.map((option, i) => (
        <button
          key={String(option.value)}
          ref={(el) => {
            buttonRefs.current[i] = el
          }}
          type="button"
          aria-pressed={i === index}
          onClick={() => onChange(option.value)}
          className={`font-label relative whitespace-nowrap rounded-full px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.02em] transition-colors duration-300 ${
            i === index ? 'text-ink-900' : 'text-white/70 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
