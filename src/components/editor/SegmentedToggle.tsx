interface SegmentedToggleProps<T extends string | boolean> {
  options: readonly [{ value: T; label: string }, { value: T; label: string }]
  value: T
  onChange: (value: T) => void
}

/**
 * Two choices in one pill, with the white highlight sliding to whichever is
 * picked — half the height of two separate buttons, and it reads as one
 * either/or setting rather than two unrelated buttons.
 */
export function SegmentedToggle<T extends string | boolean>({ options, value, onChange }: SegmentedToggleProps<T>) {
  const index = options[1].value === value ? 1 : 0
  return (
    <div className="relative grid shrink-0 grid-cols-2 rounded-full bg-white/10 p-0.5">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option, i) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={i === index}
          onClick={() => onChange(option.value)}
          className={`font-label relative whitespace-nowrap rounded-full px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-300 ${
            i === index ? 'text-ink-900' : 'text-white/70 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
