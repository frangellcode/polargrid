interface BorderThicknessSliderProps {
  label: string
  value: number
  onChange: (pct: number) => void
  min?: number
  max?: number
}

export function BorderThicknessSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 0.15,
}: BorderThicknessSliderProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-label text-xs font-semibold uppercase tracking-wider text-white/40">{label}</span>
        <span className="tabular-nums text-white">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
      />
    </label>
  )
}
