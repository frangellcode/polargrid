import type { CollageTemplateStyle, GridTemplate } from '../types'

/**
 * Hand-picked grid templates. Each tiles a cols x rows unit grid perfectly (no
 * gaps): sum of colSpan*rowSpan per row == cols. 'normal' = clean uniform grid,
 * 'creative' = asymmetric, magazine/collage-app style mix (big + small cells).
 * The orientation toggle in the UI mirrors any of these via transposeTemplate,
 * so a hand-authored "side by side" also gives you "stacked" for free.
 */
export const GRID_TEMPLATES: GridTemplate[] = [
  // ---- 2 photos ----
  {
    id: 'grid-2-normal',
    label: '2 fotos',
    count: 2,
    style: 'normal',
    cols: 2,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    id: 'grid-2-creative',
    label: '2 fotos · grande y chica',
    count: 2,
    style: 'creative',
    cols: 5,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 3, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 2, rowSpan: 1 },
    ],
  },

  // ---- 3 photos ----
  {
    id: 'grid-3-normal',
    label: '3 fotos',
    count: 3,
    style: 'normal',
    cols: 3,
    rows: 1,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    id: 'grid-3-creative',
    label: '3 fotos · grande + 2',
    count: 3,
    style: 'creative',
    cols: 2,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 2, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 4 photos ----
  {
    id: 'grid-4-normal',
    label: '4 fotos',
    count: 4,
    style: 'normal',
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
    id: 'grid-4-creative',
    label: '4 fotos · grande + 3',
    count: 4,
    style: 'creative',
    cols: 3,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 3, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 5 photos ----
  {
    id: 'grid-5-normal',
    label: '5 fotos',
    count: 5,
    style: 'normal',
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
    id: 'grid-5-creative',
    label: '5 fotos · lateral + 4',
    count: 5,
    style: 'creative',
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

  // ---- 6 photos ----
  {
    id: 'grid-6-normal',
    label: '6 fotos',
    count: 6,
    style: 'normal',
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
    id: 'grid-6-creative',
    label: '6 fotos · 2 grandes + 4',
    count: 6,
    style: 'creative',
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

  // ---- 7 photos ----
  {
    id: 'grid-7-normal',
    label: '7 fotos',
    count: 7,
    style: 'normal',
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

  // ---- 8 photos ----
  {
    id: 'grid-8-normal',
    label: '8 fotos',
    count: 8,
    style: 'normal',
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

  // ---- 9 photos ----
  {
    id: 'grid-9-normal',
    label: '9 fotos',
    count: 9,
    style: 'normal',
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

  // ---- 10 photos ----
  {
    id: 'grid-10-normal',
    label: '10 fotos',
    count: 10,
    style: 'normal',
    cols: 5,
    rows: 2,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 4, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 4, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },

  // ---- 11 photos ----
  {
    id: 'grid-11-normal',
    label: '11 fotos',
    count: 11,
    style: 'normal',
    cols: 4,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 2, rowSpan: 1 },
    ],
  },

  // ---- 12 photos ----
  {
    id: 'grid-12-normal',
    label: '12 fotos',
    count: 12,
    style: 'normal',
    cols: 4,
    rows: 3,
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 0, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },
]

export const MAX_COLLAGE_PHOTOS = 12

/** All templates available for a given photo count (2-12), in a stable order. */
export function getTemplatesForCount(count: number): GridTemplate[] {
  const clamped = Math.min(MAX_COLLAGE_PHOTOS, Math.max(2, count))
  return GRID_TEMPLATES.filter((t) => t.count === clamped)
}

/** Best-match template for a count + style, falling back to 'normal' if that count has no creative variant. */
export function getTemplate(count: number, style: CollageTemplateStyle): GridTemplate {
  const candidates = getTemplatesForCount(count)
  return candidates.find((t) => t.style === style) ?? candidates.find((t) => t.style === 'normal') ?? candidates[0]
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
