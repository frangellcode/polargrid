import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface BottomBarTool {
  id: string
  label: string
  icon: ReactNode
}

interface EditorBottomBarProps {
  tools: BottomBarTool[]
  activeId: string | null
  onSelect: (id: string | null) => void
  children: ReactNode
}

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

/** Most of the screen a panel may ever take, as a share of the viewport.
 *
 *  Phones are the target, and on a short one (an SE, or any phone with the URL
 *  bar showing) the tallest panels — Aspect with an orientation row, Template
 *  with orientation + shape + layouts — are taller than the room left under
 *  the canvas. They used to simply not fit: the bottom bar is a flex item and
 *  was shrinking, so its last row (Locked/Unlocked, say) ended up behind the
 *  tool icons with no way to reach it, since nothing on this screen scrolls.
 *  Now the panel stops growing here and scrolls inside itself instead, and
 *  the canvas keeps at least the rest. */
const MAX_PANEL_VIEWPORT_SHARE = 0.45

/**
 * App-style bottom toolbar: a row of icon buttons, tapping one smoothly expands
 * a panel above the row with that tool's controls. Tapping the active tool again
 * (or picking a different one that's already open) collapses/swaps it. Keeps the
 * canvas area tall by default since no panel is open until the user asks for one.
 *
 * Height is measured in JS (rather than an intrinsic-size CSS trick) so switching
 * directly between two open tools with different content height still animates —
 * a plain `grid-template-rows: 1fr` only interpolates open<->closed, it snaps
 * instantly when the content itself changes shape while already open.
 */
export function EditorBottomBar({ tools, activeId, onSelect, children }: EditorBottomBarProps) {
  const open = activeId != null
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  // Re-read on resize AND on orientation change: rotating a phone changes the
  // budget completely, and iOS also grows the viewport when the URL bar
  // collapses.
  const [maxHeight, setMaxHeight] = useState<number>(Number.POSITIVE_INFINITY)

  useEffect(() => {
    const update = () => setMaxHeight(Math.round(window.innerHeight * MAX_PANEL_VIEWPORT_SHARE))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el || !open) {
      setHeight(0)
      return
    }
    setHeight(el.scrollHeight)
    const observer = new ResizeObserver(() => setHeight(el.scrollHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [open, activeId])

  // The animation still runs against this clamped value, so opening a panel
  // that is taller than the budget eases to its capped height rather than
  // snapping.
  const panelHeight = Math.min(height, maxHeight)
  const scrolls = height > maxHeight

  return (
    <div className="border-t border-white/10 bg-ink-900">
      <div className={`overflow-hidden transition-[height] duration-300 ${EASE}`} style={{ height: panelHeight }}>
        <div
          ref={contentRef}
          // overscroll-contain so a flick that reaches the end of a scrolling
          // panel doesn't start dragging the page (or the canvas) behind it.
          className={`space-y-4 px-4 pb-3 pt-4 ${scrolls ? 'h-full overflow-y-auto overscroll-contain' : ''}`}
        >
          {children}
        </div>
      </div>
      <div className="flex items-stretch justify-around gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {tools.map((tool) => {
          const active = tool.id === activeId
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelect(active ? null : tool.id)}
              className="font-label group flex flex-1 flex-col items-center gap-1 rounded-xl py-1 text-[10px] font-semibold uppercase tracking-wide transition"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full transition duration-200 group-active:scale-90 ${
                  active ? 'bg-white text-ink-900' : 'bg-white/10 text-white/60'
                }`}
              >
                {tool.icon}
              </span>
              <span className={`transition-colors duration-200 ${active ? 'text-white' : 'text-white/45'}`}>
                {tool.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
