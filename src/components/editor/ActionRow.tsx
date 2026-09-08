import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

interface ActionRowProps {
  /** Whether the row is showing. Its content stays mounted either way, so it
   *  can collapse with something still in it. */
  open: boolean
  children: ReactNode
}

/**
 * The strip of actions that appears under the canvas for whatever is selected.
 *
 * Mounting it outright was the problem: it takes real height, so the canvas
 * (flex-1) lost that height in a single frame and the whole collage jumped
 * smaller — CanvasStage recomputes its scale from the container, so the photos
 * visibly snapped down the instant a tap landed. Animating this row's own
 * height instead means the canvas is squeezed over ~300ms and the stage follows
 * it frame by frame, which reads as the picture easing back rather than
 * flinching.
 *
 * Same duration and curve as the tool panel above it, so the two behave alike.
 */
export function ActionRow({ open, children }: ActionRowProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  // Measured continuously, not once: the row's own content changes height (a
  // second button appearing, a hint wrapping to two lines on a narrow phone),
  // and that should ease too rather than jump.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => setHeight(el.scrollHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={`shrink-0 overflow-hidden transition-[height] duration-300 ${EASE}`}
      style={{ height: open ? height : 0 }}
    >
      <div
        ref={contentRef}
        // Its content stays mounted while collapsed (that's what lets it be
        // measured, and what gives the row something to show on the way out),
        // so it has to be taken out of play in every other sense too: `inert`
        // for focus and the accessibility tree — a collapsed row's buttons are
        // otherwise still announced and tabbable — and pointer-events-none so
        // a mid-collapse button can't catch a stray tap.
        inert={!open}
        // The border lives in here rather than on the animated box, so a
        // collapsed row leaves no hairline behind.
        className={`flex items-center justify-between gap-3 border-t border-white/10 bg-ink-900 px-4 py-2 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
