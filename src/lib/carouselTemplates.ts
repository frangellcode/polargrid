import type { GridTemplate } from '../types'
import { MAX_COLLAGE_PHOTOS, MIN_COLLAGE_PHOTOS } from './collageTemplates'

/**
 * Carousel layouts: a strip of `posts` 4:5 posts side by side, swiped through
 * one after another on Instagram. A layout can put a photo across the cut
 * between two posts — that is what makes a carousel read as one piece.
 *
 * Every design is built for the photos actually there: pick three photos and
 * every layout on offer holds exactly three. Each design is a family that
 * works out its cells from the photo count (and the post count), so adding or
 * removing a photo keeps the same design, one cell more or fewer.
 *
 * Ids are `car-<posts>-<photos>-<family>` and are rebuilt from the id itself,
 * so nothing has to list every combination up front.
 */

export const MIN_CAROUSEL_POSTS = 2
export const MAX_CAROUSEL_POSTS = 5
export const DEFAULT_CAROUSEL_POSTS = 3
/** One post's width / height. */
export const CAROUSEL_POST_RATIO = 4 / 5

type Cell = GridTemplate['cells'][number]
const cell = (col: number, row: number, colSpan: number, rowSpan: number): Cell => ({ col, row, colSpan, rowSpan })

interface Layout {
  label: string
  cols: number
  rows: number
  cells: Cell[]
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
const lcm = (a: number, b: number) => (a && b ? (a * b) / gcd(a, b) : a || b)

/** `count` equal cells side by side across `cols` units, starting at `col`. */
function row(count: number, cols: number, r: number, rowSpan: number, col = 0): Cell[] {
  const w = cols / count
  return Array.from({ length: count }, (_, i) => cell(col + i * w, r, w, rowSpan))
}

/** `count` equal cells stacked down `rows` units in one column. */
function stack(count: number, rows: number, col: number, colSpan: number): Cell[] {
  const h = rows / count
  return Array.from({ length: count }, (_, i) => cell(col, i * h, colSpan, h))
}

/** Two rows sharing `count` photos (the top one taking the odd one out),
 *  across `units` columns, rows 0..2. One photo fills both rows. */
function twoRows(count: number): { cols: number; cells: Cell[] } {
  const a = Math.ceil(count / 2)
  const b = count - a
  if (!b) return { cols: a, cells: row(a, a, 0, 2) }
  const units = lcm(a, b)
  return { cols: units, cells: [...row(a, units, 0, 1), ...row(b, units, 1, 1)] }
}

/** Each family, for `n` posts and `k` photos — or null where it doesn't fit. */
const FAMILIES: Record<string, (n: number, k: number) => Layout | null> = {
  // A panorama across the top, the rest under it — and the other way up.
  'pano-top': (_n, k) => {
    const m = k - 1
    return { label: 'Panorama on top', cols: m, rows: 2, cells: [cell(0, 0, m, 1), ...row(m, m, 1, 1)] }
  },
  'pano-bottom': (_n, k) => {
    const m = k - 1
    return { label: 'Panorama below', cols: m, rows: 2, cells: [...row(m, m, 0, 1), cell(0, 1, m, 1)] }
  },

  // One big photo leading, the rest in two rows after it — and at the end.
  'big-first': (n, k) => {
    const rest = twoRows(k - 1)
    const big = Math.max(1, Math.round(rest.cols * (n >= 3 ? 1.4 : 1)))
    return { label: 'Big first', cols: big + rest.cols, rows: 2, cells: [cell(0, 0, big, 2), ...rest.cells.map((c) => ({ ...c, col: c.col + big }))] }
  },
  'big-last': (n, k) => {
    const rest = twoRows(k - 1)
    const big = Math.max(1, Math.round(rest.cols * (n >= 3 ? 1.4 : 1)))
    return { label: 'Big last', cols: big + rest.cols, rows: 2, cells: [...rest.cells, cell(rest.cols, 0, big, 2)] }
  },

  // One big photo in the middle, across the cuts, the rest stacked either side.
  'hero-middle': (n, k) => {
    if (k < 3) return null
    const left = Math.ceil((k - 1) / 2)
    const right = k - 1 - left
    const rows = lcm(left, right)
    const hero = 2 * n - 2
    return {
      label: 'Big in the middle',
      cols: hero + 2,
      rows,
      cells: [...stack(left, rows, 0, 1), cell(1, 0, hero, rows), ...stack(right, rows, hero + 1, 1)],
    }
  },

  // Every photo its own tall column, cutting across the posts.
  columns: (_n, k) => ({ label: 'Columns', cols: k, rows: 1, cells: row(k, k, 0, 1) }),

  // Two rows, the second one shifted so it straddles the first.
  rows: (_n, k) => {
    if (k < 3) return null
    const { cols, cells } = twoRows(k)
    return { label: 'Two rows', cols, rows: 2, cells }
  },

  // Steps: photos climbing and falling across the strip, with air around them.
  steps: (_n, k) => ({
    label: 'Steps',
    cols: 3 * k - 1,
    rows: 4,
    cells: Array.from({ length: k }, (_, i) => cell(3 * i, i % 2 === 0 ? 0 : 1, 2, 3)),
  }),

  // One print after another with room under each, like polaroids in a row.
  prints: (n, k) => {
    if (k > 2 * n) return null
    return { label: 'Prints', cols: 6 * k, rows: 7, cells: Array.from({ length: k }, (_, i) => cell(6 * i + 1, 1, 4, 4)) }
  },
}

export const CAROUSEL_FAMILIES = Object.keys(FAMILIES)
const DEFAULT_FAMILY = 'pano-top'

function make(n: number, k: number, family: string): GridTemplate | null {
  const build = FAMILIES[family]
  if (!build) return null
  const layout = build(n, k)
  if (!layout || layout.cells.length !== k) return null
  return { id: `car-${n}-${k}-${family}`, label: layout.label, count: k, cols: layout.cols, rows: layout.rows, cells: layout.cells }
}

export function isCarouselTemplate(id: string): boolean {
  return id.startsWith('car-')
}

function parse(id: string): { posts: number; count: number; family: string } | null {
  const m = /^car-(\d+)-(\d+)-(.+)$/.exec(id)
  return m ? { posts: Number(m[1]), count: Number(m[2]), family: m[3] } : null
}

/** A carousel template from its id, or null if it isn't one. */
export function findCarouselTemplate(id: string): GridTemplate | null {
  const p = parse(id)
  return p ? make(p.posts, p.count, p.family) : null
}

/** Every layout for `posts` posts holding exactly `count` photos. */
export function getCarouselTemplates(posts: number, count: number): GridTemplate[] {
  const k = Math.min(MAX_COLLAGE_PHOTOS, Math.max(MIN_COLLAGE_PHOTOS, count))
  return CAROUSEL_FAMILIES.flatMap((f) => make(posts, k, f) ?? [])
}

/** The layout for `count` photos on `posts` posts, in `family` when it fits. */
export function carouselTemplateFor(posts: number, count: number, family = DEFAULT_FAMILY): GridTemplate {
  const k = Math.min(MAX_COLLAGE_PHOTOS, Math.max(MIN_COLLAGE_PHOTOS, count))
  return make(posts, k, family) ?? getCarouselTemplates(posts, k)[0]
}

/** Which family a template belongs to, to keep the design through changes. */
export function carouselFamily(id: string): string {
  return parse(id)?.family ?? DEFAULT_FAMILY
}
