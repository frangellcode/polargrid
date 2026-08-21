import type { CellShape, GridTemplate } from '../types'

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
 * grid exactly (no gaps) — sum of colSpan*rowSpan per row == cols. A few
 * deliberately don't: the single-photo layouts inset their one cell so the
 * workspace background shows through as a mat/frame, and a couple of
 * small-count layouts (grid-2-diagonal, grid-3-corner) leave part of the
 * grid empty on purpose, as a designed accent rather than a full tiling.
 *
 * Every photo count (1-9) gets 4 layouts. The cell "shape" (rect / rounded /
 * circle) is a separate, orthogonal choice made in the UI — not baked into
 * separate near-duplicate template entries — so each layout appears exactly
 * once here. `circleEligible` (computed below) says whether that layout's
 * cells are close enough to square for a circle crop to look intentional
 * rather than leaving stray dead space.
 */
const GEOMETRIES: GeometryDef[] = [
  // ---- 1 photo (inset within a 20x20 unit grid, so the mat shows around it) ----
  {
    key: 'grid-1-full',
    label: '1 foto · completa',
    count: 1,
    cols: 20,
    rows: 20,
    cells: [{ col: 0, row: 0, colSpan: 20, rowSpan: 20 }],
  },
  {
    key: 'grid-1-inset-sm',
    label: '1 foto · marco fino',
    count: 1,
    cols: 20,
    rows: 20,
    cells: [{ col: 1, row: 1, colSpan: 18, rowSpan: 18 }],
  },
  {
    key: 'grid-1-inset-lg',
    label: '1 foto · marco grande',
    count: 1,
    cols: 20,
    rows: 20,
    cells: [{ col: 3, row: 3, colSpan: 14, rowSpan: 14 }],
  },
  {
    key: 'grid-1-mat',
    label: '1 foto · estilo polaroid',
    count: 1,
    cols: 20,
    rows: 20,
    cells: [{ col: 2, row: 2, colSpan: 16, rowSpan: 13 }],
  },

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
    // leftover gap, and (being genuinely square) is the one 2-photo layout
    // that also looks right with the circle-crop shape.
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
    // a compact, deliberate accent (not a leftover gap) and, being square
    // cells, the one 3-photo layout that also works with circle crops.
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
    // A 3x3 grid with the center and top-middle left open — a "U" of 7 square
    // cells. All-square, so (unlike a plain 7-in-a-row strip) it also works
    // as a circle-crop layout.
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

/** How far a cell's box may stray from square (as width/height) and still get
 *  a circle crop that looks intentional. Outside this range the inscribed
 *  circle leaves so much bare box on the long axis that it reads as a
 *  mistake rather than a design choice — so a 'circle' shape pick falls back
 *  to 'rect' for that layout (see resolveShape). */
const CIRCLE_MIN_ASPECT = 0.6
const CIRCLE_MAX_ASPECT = 1.67

function cellAspect(cell: CellSpec, cols: number, rows: number): number {
  return (cell.colSpan / cols) / (cell.rowSpan / rows)
}

function isCircleEligible(g: GeometryDef): boolean {
  return g.cells.every((c) => {
    const a = cellAspect(c, g.cols, g.rows)
    return a >= CIRCLE_MIN_ASPECT && a <= CIRCLE_MAX_ASPECT
  })
}

export const GRID_TEMPLATES: GridTemplate[] = GEOMETRIES.map((g) => ({
  id: g.key,
  label: g.label,
  count: g.count,
  cols: g.cols,
  rows: g.rows,
  cells: g.cells,
  circleEligible: isCircleEligible(g),
}))

export const MIN_COLLAGE_PHOTOS = 1
export const MAX_COLLAGE_PHOTOS = 9

/** All templates available for a given photo count (1-9), in a stable order. */
export function getTemplatesForCount(count: number): GridTemplate[] {
  const clamped = Math.min(MAX_COLLAGE_PHOTOS, Math.max(MIN_COLLAGE_PHOTOS, count))
  return GRID_TEMPLATES.filter((t) => t.count === clamped)
}

/** Looks up a template by id, falling back to the first template for that photo count. */
export function getTemplateById(id: string, fallbackCount: number): GridTemplate {
  return GRID_TEMPLATES.find((t) => t.id === id) ?? getTemplatesForCount(fallbackCount)[0]
}

/** The shape actually usable for a layout: 'circle' falls back to 'rect' when
 *  the layout's cells aren't square-ish enough (see circleEligible). */
export function resolveShape(templateId: string, shape: CellShape, fallbackCount: number): CellShape {
  const template = getTemplateById(templateId, fallbackCount)
  return shape === 'circle' && !template.circleEligible ? 'rect' : shape
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
