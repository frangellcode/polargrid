import { useEffect } from 'react'
import { useEditorStore } from '../../store/editorStore'
import { useTranslation } from '../../store/languageStore'
import { IconCompare } from './icons'

/**
 * Before/after: while it's held down, every photo on the canvas is drawn as
 * it came in, without its Edit or Retro; letting go brings the edit back. A
 * hold rather than a toggle, like the Photos app and Lightroom — the edit can
 * never be left switched off by accident.
 */
export function CompareButton({ visible }: { visible: boolean }) {
  const tr = useTranslation()
  const setShowOriginal = useEditorStore((s) => s.setShowOriginal)
  const showOriginal = useEditorStore((s) => s.showOriginal)

  // Never left on: a hold that ends somewhere this button can't hear about
  // (the button disappearing under the finger, the editor closing).
  useEffect(() => {
    if (!visible) setShowOriginal(false)
    return () => setShowOriginal(false)
  }, [visible, setShowOriginal])

  const release = () => setShowOriginal(false)

  return (
    <button
      type="button"
      aria-label={tr.tools.compare}
      title={tr.tools.compare}
      // Taps on it must not count as tapping away from a collage selection.
      data-selection-actions
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setShowOriginal(true)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute bottom-2 right-2 z-20 flex h-9 w-9 touch-none select-none items-center justify-center rounded-full shadow-lg backdrop-blur transition duration-200 [-webkit-touch-callout:none] ${
        showOriginal ? 'scale-95 bg-white text-ink-900' : 'bg-black/45 text-white'
      } ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <IconCompare />
    </button>
  )
}
