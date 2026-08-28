import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface FadeTextProps {
  /** The text to render. */
  value: string
  /** What re-triggers the crossfade — defaults to `value` itself, but pass a
   *  shared key (e.g. the current language) when several FadeText instances
   *  need to fade in lockstep even if some of their own values happen not to
   *  change between languages (e.g. "Collage"). Without this, an unchanged
   *  value never fades, so it sits static while everything around it dips —
   *  reading as a stray leftover instead of part of one crossfade. */
  trigger?: string | number
  className?: string
  /** Also smoothly animates this element's own rendered width to the
   *  incoming text's natural width, instead of letting it snap. Needed
   *  whenever this text sits inline before other content (an icon, a
   *  static handle, a sibling button) that would otherwise visibly jump
   *  the instant the text's length changes between languages. */
  animateWidth?: boolean
}

const FADE_MS = 300
const WIDTH_MS = 300

/** Crossfades text content whenever `trigger` changes, instead of swapping instantly. */
export function FadeText({ value, trigger, className, animateWidth = false }: FadeTextProps) {
  const key = trigger ?? value
  const [display, setDisplay] = useState(value)
  const [visible, setVisible] = useState(true)
  const [width, setWidth] = useState<number | undefined>(undefined)
  const prevKey = useRef(key)
  const measureRef = useRef<HTMLSpanElement>(null)
  const measuredWidthRef = useRef<number | undefined>(undefined)

  // Keeps measuredWidthRef pointed at the CURRENT target's natural width on every
  // render, but only ever pushes it into state (triggering a resize) on first
  // mount here — later resizes are deliberately deferred to the fade-cycle
  // effect below, once the old text has actually finished fading out.
  useLayoutEffect(() => {
    if (!animateWidth) return
    measuredWidthRef.current = measureRef.current?.offsetWidth
    setWidth((current) => (current === undefined ? measuredWidthRef.current : current))
  }, [animateWidth, value])

  useEffect(() => {
    if (prevKey.current === key) return
    prevKey.current = key
    setVisible(false)
    const t = setTimeout(() => {
      setDisplay(value)
      if (animateWidth) setWidth(measuredWidthRef.current)
      setVisible(true)
    }, FADE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `key`, not `value`, on purpose
  }, [key])

  const textSpan = (
    <span
      className={animateWidth ? undefined : className}
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
    >
      {display}
    </span>
  )

  if (!animateWidth) return textSpan

  return (
    <span className={`relative inline-block align-top ${className ?? ''}`}>
      <span
        aria-hidden="true"
        ref={measureRef}
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
      >
        {value}
      </span>
      <span
        className="inline-block overflow-hidden align-top whitespace-nowrap"
        style={{ width, transition: `width ${WIDTH_MS}ms cubic-bezier(0.22,1,0.36,1)` }}
      >
        {textSpan}
      </span>
    </span>
  )
}
