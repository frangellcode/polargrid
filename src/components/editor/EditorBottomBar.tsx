import { useLayoutEffect, useRef, useState } from 'react'
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

  return (
    <div className="border-t border-white/10 bg-ink-900">
      <div className={`overflow-hidden transition-[height] duration-300 ${EASE}`} style={{ height }}>
        <div ref={contentRef} className="space-y-4 px-4 pb-3 pt-4">
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
