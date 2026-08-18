import { useRef } from 'react'
import { Group, Image as KonvaImage, Rect, Text } from 'react-konva'
import type Konva from 'konva'
import type { LoadedPhoto, PhotoTransform } from '../../types'
import { clampTransform, getImageDrawRect, MAX_ZOOM } from '../../lib/cropMath'

interface PhotoCellProps {
  x: number
  y: number
  width: number
  height: number
  photo: LoadedPhoto | null
  transform: PhotoTransform
  onTransformChange: (t: PhotoTransform) => void
  onEmptyClick?: () => void
}

/** One photo inside a clipped rect: cover-fit, draggable to pan, wheel/pinch to zoom. */
export function PhotoCell({
  x,
  y,
  width,
  height,
  photo,
  transform,
  onTransformChange,
  onEmptyClick,
}: PhotoCellProps) {
  const pinchDist = useRef<number | null>(null)
  const imageRef = useRef<Konva.Image>(null)

  if (width <= 0 || height <= 0) return null

  if (!photo) {
    return (
      <Group x={x} y={y} onClick={onEmptyClick} onTap={onEmptyClick}>
        <Rect width={width} height={height} fill="#f0f9ff" stroke="#bae6fd" strokeWidth={2} dash={[8, 6]} />
        <Text
          text="+"
          width={width}
          height={height}
          align="center"
          verticalAlign="middle"
          fontSize={Math.min(width, height) * 0.3}
          fill="#7dd3fc"
        />
      </Group>
    )
  }

  const draw = getImageDrawRect(width, height, photo.width, photo.height, transform)

  // Konva's dragBoundFunc receives/returns ABSOLUTE (stage) coordinates, which are
  // in canvas-pixel space — i.e. our virtual (unscaled) coordinates multiplied by
  // the Stage's scaleX/scaleY (see CanvasStage). Convert through that scale before
  // comparing against width/x/etc, which are all in virtual/unscaled units.
  const dragBounds = (pos: { x: number; y: number }) => {
    const scale = imageRef.current?.getStage()?.scaleX() || 1
    const minX = Math.min(0, width - draw.width)
    const maxX = Math.max(0, width - draw.width)
    const minY = Math.min(0, height - draw.height)
    const maxY = Math.max(0, height - draw.height)
    const localX = pos.x / scale - x
    const localY = pos.y / scale - y
    return {
      x: (Math.min(Math.max(localX, minX), maxX) + x) * scale,
      y: (Math.min(Math.max(localY, minY), maxY) + y) * scale,
    }
  }

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const slackX = Math.max(0, (draw.width - width) / 2)
    const slackY = Math.max(0, (draw.height - height) / 2)
    const centeredX = (width - draw.width) / 2
    const centeredY = (height - draw.height) / 2
    const offsetX = slackX === 0 ? 0 : (centeredX - e.target.x()) / slackX
    const offsetY = slackY === 0 ? 0 : (centeredY - e.target.y()) / slackY
    onTransformChange(clampTransform({ ...transform, offsetX, offsetY }))
  }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const delta = -e.evt.deltaY * 0.0015
    const zoom = Math.min(MAX_ZOOM, Math.max(1, transform.zoom + delta))
    onTransformChange(clampTransform({ ...transform, zoom }))
  }

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length < 2) return
    e.evt.preventDefault()
    const [a, b] = [touches[0], touches[1]]
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
    if (pinchDist.current != null) {
      const scaleDelta = dist / pinchDist.current
      const zoom = Math.min(MAX_ZOOM, Math.max(1, transform.zoom * scaleDelta))
      onTransformChange(clampTransform({ ...transform, zoom }))
    }
    pinchDist.current = dist
  }

  const handleTouchEnd = () => {
    pinchDist.current = null
  }

  return (
    <Group
      x={x}
      y={y}
      clipX={0}
      clipY={0}
      clipWidth={width}
      clipHeight={height}
      onWheel={handleWheel}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <KonvaImage
        ref={imageRef}
        image={photo.bitmap as unknown as CanvasImageSource}
        x={draw.x}
        y={draw.y}
        width={draw.width}
        height={draw.height}
        draggable
        dragBoundFunc={dragBounds}
        onDragEnd={handleDragEnd}
      />
    </Group>
  )
}
