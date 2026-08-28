import { useEffect, useRef, useState } from 'react'

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
}

const FADE_MS = 300

/** Crossfades text content whenever `trigger` changes, instead of swapping instantly. */
export function FadeText({ value, trigger, className }: FadeTextProps) {
  const key = trigger ?? value
  const [display, setDisplay] = useState(value)
  const [visible, setVisible] = useState(true)
  const prevKey = useRef(key)

  useEffect(() => {
    if (prevKey.current === key) return
    prevKey.current = key
    setVisible(false)
    const t = setTimeout(() => {
      setDisplay(value)
      setVisible(true)
    }, FADE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `key`, not `value`, on purpose
  }, [key])

  return (
    <span className={className} style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}>
      {display}
    </span>
  )
}
