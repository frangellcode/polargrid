import type { GridTemplate } from '../types'

type CellSpec = { col: number; row: number; colSpan: number; rowSpan: number }

interface GeometryDef {
  key: string
  label: string
  count: number
  cols: number
  rows: number
  cells: CellSpec[]
}

/**
 * Hand-picked grid layouts (geometries). Most tile their cols x rows unit
 * grid exactly (no gaps) — sum of colSpan*rowSpan per row == cols. A couple
 * of small-count layouts (grid-2-diagonal, grid-3-corner) deliberately don't:
 * they leave part of the grid empty on purpose, as a designed accent rather
 * than a full tiling.
 *
 * Every photo count (2-9) gets 4 layouts. The cell "shape" (rect / rounded)
 * is a separate, orthogonal choice made in the UI, not baked into these.
 */
const GEOMETRIES: GeometryDef[] = [
  // ---- 2 photos ----
  {
    key: 'grid-2-normal',
    label: '2 fotos',
    count: 2,
    cols: 2,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    // 8:5 ~= golden ratio (0.615/0.385) — a subtler, less "cut in a blender"
    // asymmetry than the old plain 3:2 (0.6/0.4) split.
    key: 'grid-2-big-left',
    label: '2 fotos · grande y chica',
    count: 2,
    cols: 13,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 8, rowSpan: 1 },
      { col: 8, row: 0, colSpan: 5, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-2-big-right',
    label: '2 fotos · chica y grande',
    count: 2,
    cols: 13,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 5, rowSpan: 1 },
      { col: 5, row: 0, colSpan: 8, rowSpan: 1 },
    ],
  },
  {
    // Two square cells on the diagonal of a 2x2 grid, the other two units left
    // as deliberate negative space — reads as a designed accent rather than a
    // leftover gap.
    key: 'grid-2-diagonal',
    label: '2 fotos · acento diagonal',
    count: 2,
    cols: 2,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 3 photos ----
  {
    key: 'grid-3-normal',
    label: '3 fotos',
    count: 3,
    cols: 3,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    // 5:3 rows (62.5/37.5) instead of a flat 50/50 split.
    key: 'grid-3-big-top',
    label: '3 fotos · grande + 2',
    count: 3,
    cols: 2,
    rows: 8,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 5 },
      { col: 0, row: 5, colSpan: 1, rowSpan: 3 },
      { col: 1, row: 5, colSpan: 1, rowSpan: 3 },
    ],
  },
  {
    key: 'grid-3-big-bottom',
    label: '3 fotos · 2 + grande',
    count: 3,
    cols: 2,
    rows: 8,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 3 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 3 },
      { col: 0, row: 3, colSpan: 2, rowSpan: 5 },
    ],
  },
  {
    // Three square cells filling an L in a 2x2 block, one corner left open —
    // a compact, deliberate accent, not a leftover gap.
    key: 'grid-3-corner',
    label: '3 fotos · esquina',
    count: 3,
    cols: 2,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 4 photos ----
  {
    key: 'grid-4-normal',
    label: '4 fotos',
    count: 4,
    cols: 2,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-4-big-top',
    label: '4 fotos · grande + 3',
    count: 4,
    cols: 3,
    rows: 8,
    cells: [
      { col: 0, row: 0, colSpan: 3, rowSpan: 5 },
      { col: 0, row: 5, colSpan: 1, rowSpan: 3 },
      { col: 1, row: 5, colSpan: 1, rowSpan: 3 },
      { col: 2, row: 5, colSpan: 1, rowSpan: 3 },
    ],
  },
  {
    key: 'grid-4-big-bottom',
    label: '4 fotos · 3 + grande',
    count: 4,
    cols: 3,
    rows: 8,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 3 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 3 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 3 },
      { col: 0, row: 3, colSpan: 3, rowSpan: 5 },
    ],
  },
  {
    key: 'grid-4-row',
    label: '4 fotos · en fila',
    count: 4,
    cols: 4,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 5 photos ----
  {
    key: 'grid-5-normal-a',
    label: '5 fotos · 2 + 3',
    count: 5,
    cols: 6,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 3, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 3, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 4, row: 1, colSpan: 2, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-5-normal-b',
    label: '5 fotos · 3 + 2',
    count: 5,
    cols: 6,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 4, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 3, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 3, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-5-tall-left',
    label: '5 fotos · lateral izq. + 4',
    count: 5,
    cols: 3,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 2 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-5-tall-right',
    label: '5 fotos · lateral der. + 4',
    count: 5,
    cols: 3,
    rows: 2,
    cells: [
      { col: 2, row: 0, colSpan: 1, rowSpan: 2 },
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 6 photos ----
  {
    key: 'grid-6-normal',
    label: '6 fotos',
    count: 6,
    cols: 3,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-6-pairs',
    label: '6 fotos · 3 filas dobles',
    count: 6,
    cols: 4,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 2, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-6-big',
    label: '6 fotos · grande + 5',
    count: 6,
    cols: 4,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 4, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-6-row',
    label: '6 fotos · en fila',
    count: 6,
    cols: 6,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 4, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 5, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 7 photos ----
  {
    key: 'grid-7-normal',
    label: '7 fotos',
    count: 7,
    cols: 4,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 2, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-7-big-top',
    label: '7 fotos · grande arriba',
    count: 7,
    cols: 4,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-7-big-bottom',
    label: '7 fotos · grande abajo',
    count: 7,
    cols: 4,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    // A 3x3 grid with the center and top-middle left open — a "U" of 7 cells.
    key: 'grid-7-horseshoe',
    label: '7 fotos · herradura',
    count: 7,
    cols: 3,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 8 photos ----
  {
    key: 'grid-8-normal',
    label: '8 fotos',
    count: 8,
    cols: 4,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-8-big',
    label: '8 fotos · grande + 7',
    count: 8,
    cols: 4,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 2, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-8-row',
    label: '8 fotos · en fila',
    count: 8,
    cols: 8,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 4, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 5, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 6, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 7, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-8-col',
    label: '8 fotos · 2 columnas',
    count: 8,
    cols: 2,
    rows: 4,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 3, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 3, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 9 photos ----
  {
    key: 'grid-9-normal',
    label: '9 fotos',
    count: 9,
    cols: 3,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-9-big',
    label: '9 fotos · grande + 8',
    count: 9,
    cols: 4,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 2 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-9-row',
    label: '9 fotos · en fila',
    count: 9,
    cols: 9,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 4, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 5, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 6, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 7, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 8, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    key: 'grid-9-col',
    label: '9 fotos · en columna',
    count: 9,
    cols: 1,
    rows: 9,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 3, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 4, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 5, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 6, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 7, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 8, colSpan: 1, rowSpan: 1 },
    ],
  },
]

export const GRID_TEMPLATES: GridTemplate[] = GEOMETRIES.map((g) => ({
  id: g.key,
  label: g.label,
  count: g.count,
  cols: g.cols,
  rows: g.rows,
  cells: g.cells,
}))

export const MIN_COLLAGE_PHOTOS = 2
export const MAX_COLLAGE_PHOTOS = 9

/** All templates available for a given photo count (2-9), in a stable order. */
export function getTemplatesForCount(count: number): GridTemplate[] {
  const clamped = Math.min(MAX_COLLAGE_PHOTOS, Math.max(MIN_COLLAGE_PHOTOS, count))
  return GRID_TEMPLATES.filter((t) => t.count === clamped)
}

/** Looks up a template by id, falling back to the first template for that photo count. */
export function getTemplateById(id: string, fallbackCount: number): GridTemplate {
  return GRID_TEMPLATES.find((t) => t.id === id) ?? getTemplatesForCount(fallbackCount)[0]
}

/**
 * Mirrors a template along its diagonal: rows become columns and vice versa.
 * A simple side-by-side row (2 photos) becomes a top/bottom stack, a 3-in-a-row
 * becomes 3 stacked, etc. — works for any template since a transposed tiling is
 * still a valid tiling.
 */
export function transposeTemplate(template: GridTemplate): GridTemplate {
  return {
    ...template,
    id: `${template.id}-t`,
    cols: template.rows,
    rows: template.cols,
    cells: template.cells.map((cell) => ({
      col: cell.row,
      row: cell.col,
      colSpan: cell.rowSpan,
      rowSpan: cell.colSpan,
    })),
  }
}
