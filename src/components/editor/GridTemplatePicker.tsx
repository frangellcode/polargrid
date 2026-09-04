import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CellShape, CollageOrientation } from '../../types'
import { IconChevron } from './icons'
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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  // Which ends are still scrollable, so the fade only appears where there's
  // actually more to see (no fade at all when the row fits).
  const [fade, setFade] = useState({ start: false, end: false })
  // Whether the row overflows at all — the arrows only exist when there's
  // something past the edge to reach.
  const [scrollable, setScrollable] = useState(false)

  const syncFade = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    // 1px slack: fractional layout widths otherwise leave a permanent
    // hairline of "scrollable" at a fully scrolled end.
    setFade({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 })
    setScrollable(max > 1)
  }, [])

  useLayoutEffect(() => {
    syncFade()
    const el = scrollerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(syncFade)
    ro.observe(el)
    return () => ro.disconnect()
  }, [syncFade, templates.length])

  // Keep the selected layout visible when the list itself changes underneath
  // it (adding/removing a photo swaps in a whole new set of templates, and
  // the selection can land off-screen).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    syncFade()
  }, [count, value, syncFade])

  // Nudges the row by most of a screenful, keeping a couple of thumbnails
  // from the previous view as an anchor.
  function page(direction: 1 | -1) {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  // Fades the row out under each arrow, so thumbnails slide beneath it rather
  // than being abruptly cut off — and no fade at an end that's fully reached.
  const mask = `linear-gradient(to right, transparent 0, #000 ${fade.start ? '34px' : '0px'}, #000 calc(100% - ${
    fade.end ? '34px' : '0px'
  }), transparent 100%)`

  return (
    <div className="relative">
      <div className="transition-[mask-image] duration-200" style={{ WebkitMaskImage: mask, maskImage: mask }}>
      <div
        ref={scrollerRef}
        onScroll={syncFade}
        // Bleeds past the panel's px-4 so thumbnails scroll all the way to the
        // screen edge. The inner padding is wider than the bleed so a resting
        // thumbnail is never parked underneath an arrow.
        className="scroll-row -mx-4 overflow-x-auto overscroll-x-contain scroll-px-9 px-9"
      >
        {/* w-max keeps the row on one line; min-w-full lets justify-center
            take over when the whole set already fits. */}
        <div className="flex w-max min-w-full justify-center gap-2">
          {templates.map((base) => {
            const template = orientation === 'vertical' ? transposeTemplate(base) : base
            const active = value === base.id
            return (
              <button
                key={base.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onChange(base.id)}
                title={base.label}
                className={`h-11 w-11 shrink-0 rounded-lg border p-1 transition duration-200 active:scale-90 ${
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
      </div>
      </div>

      {scrollable &&
        ([
          { dir: -1 as const, side: 'left-0', enabled: fade.start, flip: 'rotate-180' },
          { dir: 1 as const, side: 'right-0', enabled: fade.end, flip: '' },
        ]).map(({ dir, side, enabled, flip }) => (
          <button
            key={dir}
            type="button"
            onClick={() => page(dir)}
            disabled={!enabled}
            aria-hidden
            tabIndex={-1}
            // Sits over the faded edge of the strip. Dimmed instead of removed
            // at the end of the run, so the row visibly *has* an end rather
            // than the arrow silently vanishing.
            className={`absolute top-1/2 ${side} flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink-900/80 text-white backdrop-blur-sm transition duration-200 active:scale-90 ${
              enabled ? 'opacity-100' : 'pointer-events-none opacity-25'
            }`}
          >
            <IconChevron className={`h-4 w-4 ${flip}`} />
          </button>
        ))}
    </div>
  )
}
