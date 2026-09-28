import type { GridTemplate } from '../types'

/**
 * Where a collage grid's lines sit once the person has resized its cells.
 *
 * A template is a cols × rows unit grid with cells spanning whole units; by
 * default every column and row is the same size. Resizing moves the grid
 * LINES instead: `x` holds the cols + 1 vertical lines and `y` the rows + 1
 * horizontal ones, as fractions 0..1 of the space the cells share (the content
 * area minus the gutters). The template's structure never changes — a cell
 * still spans the same columns and rows — only how wide and tall they are.
 *
 * `key` ties the sizes to one template and orientation; switching to another
 * falls back to the even split instead of applying lines that don't belong.
 */
export interface GridSizes {
  key: string
  x: number[]
  y: number[]
}

export interface GridLines {
  x: number[]
  y: number[]
}

/** No line may come closer than this to the next line that bounds a cell. */
export const MIN_LINE_GAP = 0.12

export function gridKey(template: GridTemplate): string {
  return `${template.id}:${template.cols}x${template.rows}`
}

function evenLines(count: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => i / count)
}

export function gridLines(template: GridTemplate, sizes: GridSizes | null | undefined): GridLines {
  if (sizes && sizes.key === gridKey(template) && sizes.x.length === template.cols + 1 && sizes.y.length === template.rows + 1) {
    return { x: sizes.x, y: sizes.y }
  }
  return { x: evenLines(template.cols), y: evenLines(template.rows) }
}

/** A cell's rect inside the content area, gutters included between the
 *  units it spans. With even lines this is exactly the old uniform layout. */
export function gridCellRect(
  cell: GridTemplate['cells'][number],
  template: GridTemplate,
  lines: GridLines,
  content: { x: number; y: number; w: number; h: number },
  gutter: number,
) {
  const availW = content.w - gutter * (template.cols - 1)
  const availH = content.h - gutter * (template.rows - 1)
  const x0 = lines.x[cell.col]
  const x1 = lines.x[cell.col + cell.colSpan]
  const y0 = lines.y[cell.row]
  const y1 = lines.y[cell.row + cell.rowSpan]
  return {
    x: content.x + x0 * availW + cell.col * gutter,
    y: content.y + y0 * availH + cell.row * gutter,
    w: (x1 - x0) * availW + gutter * (cell.colSpan - 1),
    h: (y1 - y0) * availH + gutter * (cell.rowSpan - 1),
  }
}

/** Grid lines some cell actually has an edge on, per axis. Unit lines no
 *  cell edge touches (a 13-column golden split uses only 0, 8 and 13) just
 *  follow along with their neighbours. */
function usedLines(template: GridTemplate, axis: 'x' | 'y'): number[] {
  const set = new Set<number>()
  for (const cell of template.cells) {
    if (axis === 'x') {
      set.add(cell.col)
      set.add(cell.col + cell.colSpan)
    } else {
      set.add(cell.row)
      set.add(cell.row + cell.rowSpan)
    }
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * Moves grid line `index` on `axis` to `position` (0..1), keeping it at least
 * MIN_LINE_GAP from the used lines on either side. Everything between those
 * neighbours stretches or squeezes in proportion, so the cells on one side
 * grow as the ones on the other shrink and nothing further away moves.
 */
export function moveGridLine(template: GridTemplate, lines: GridLines, axis: 'x' | 'y', index: number, position: number): GridLines {
  const current = lines[axis]
  const used = usedLines(template, axis)
  const prev = [...used].reverse().find((l) => l < index)
  const next = used.find((l) => l > index)
  if (prev === undefined || next === undefined) return lines
  const lo = current[prev]
  const hi = current[next]
  const v = Math.min(hi - MIN_LINE_GAP, Math.max(lo + MIN_LINE_GAP, position))
  if (!(v > lo && v < hi)) return lines

  const moved = [...current]
  const oldAt = current[index]
  for (let i = prev + 1; i < next; i++) {
    if (i === index) moved[i] = v
    else if (i < index) moved[i] = lo + ((current[i] - lo) / (oldAt - lo)) * (v - lo)
    else moved[i] = v + ((current[i] - oldAt) / (hi - oldAt)) * (hi - v)
  }
  return axis === 'x' ? { x: moved, y: lines.y } : { x: lines.x, y: moved }
}
