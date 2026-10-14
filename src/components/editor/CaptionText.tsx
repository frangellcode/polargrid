import { useEffect, useState } from 'react'
import { Text } from 'react-konva'
import { captionInk, CAPTION_FONTS, loadCaptionFont, type BorderCaption } from '../../lib/caption'

interface CaptionTextProps {
  caption: BorderCaption
  /** The frame's size and short side, in canvas units. */
  width: number
  height: number
  shortSide: number
  borderPx: number
  /** The bottom border's height, caption included. */
  bandPx: number
  borderHex: string
}

/** The caption on the preview canvas — placed and sized like the export's. */
export function CaptionText({ caption, width, height, shortSide, borderPx, bandPx, borderHex }: CaptionTextProps) {
  const font = CAPTION_FONTS[caption.font]
  // Konva measures with whatever font is ready; draw again once ours is.
  const [, setLoaded] = useState(0)
  useEffect(() => {
    let cancelled = false
    void loadCaptionFont(caption).then(() => !cancelled && setLoaded((n) => n + 1))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the letter and the text decide what to load
  }, [caption.font, caption.text])

  const size = caption.size * shortSide
  const pad = Math.max(borderPx, size)
  return (
    <Text
      listening={false}
      text={caption.text}
      x={pad}
      y={height - bandPx}
      width={width - pad * 2}
      height={bandPx}
      align={caption.align}
      verticalAlign="middle"
      wrap="none"
      ellipsis
      fontFamily={font.family}
      fontStyle={String(font.weight)}
      fontSize={size}
      fill={captionInk(borderHex)}
    />
  )
}
