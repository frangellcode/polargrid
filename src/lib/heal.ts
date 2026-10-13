/**
 * The healing brush's fill: whatever was painted over is rebuilt from the rest
 * of the picture, with nothing for the person to pick — the same idea as
 * Photoshop's Content-Aware Fill (Wexler, Shechtman & Irani, "Space-Time
 * Completion of Video", with Barnes et al.'s PatchMatch to find the patches).
 *
 * Coarse to fine: at the smallest size the hole is only a few pixels across
 * and a rough fill is easy; each finer level starts from the one below and
 * only refines it, so big structures (a horizon, a shoreline) carry through
 * the hole and fine texture (sand, water) is copied in from real patches of
 * the same photo at the end. No model, no network: plain pixels, in a worker.
 *
 * Pure functions on typed arrays, so it runs the same in the worker and in a
 * Node test.
 */

/** Patch radius: 7×7 patches. */
const R = 3

interface Level {
  w: number
  h: number
  /** RGB, 0–255, three floats per pixel. */
  img: Float32Array
  /** 1 where the pixel is part of the hole. */
  hole: Uint8Array
}

export interface HealInput {
  width: number
  height: number
  /** RGBA, as from getImageData. */
  rgba: Uint8ClampedArray
  /** One byte per pixel, non-zero where the photo should be rebuilt. */
  mask: Uint8Array
}

/** A small seeded generator, so the same stroke heals the same way. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function toLevel({ width: w, height: h, rgba, mask }: HealInput): Level {
  const img = new Float32Array(w * h * 3)
  const hole = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    img[i * 3] = rgba[i * 4]
    img[i * 3 + 1] = rgba[i * 4 + 1]
    img[i * 3 + 2] = rgba[i * 4 + 2]
    hole[i] = mask[i] ? 1 : 0
  }
  return { w, h, img, hole }
}

/** Half size. A pixel is known only if all four it stands for are, so the
 *  hole never shrinks on the way down. */
function downsample(l: Level): Level {
  const w = Math.max(1, l.w >> 1)
  const h = Math.max(1, l.h >> 1)
  const img = new Float32Array(w * h * 3)
  const hole = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      let anyHole = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(l.w - 1, x * 2 + dx)
          const sy = Math.min(l.h - 1, y * 2 + dy)
          const si = sy * l.w + sx
          if (l.hole[si]) {
            anyHole = 1
            continue
          }
          r += l.img[si * 3]
          g += l.img[si * 3 + 1]
          b += l.img[si * 3 + 2]
          n++
        }
      }
      const i = y * w + x
      hole[i] = anyHole
      if (n) {
        img[i * 3] = r / n
        img[i * 3 + 1] = g / n
        img[i * 3 + 2] = b / n
      }
    }
  }
  return { w, h, img, hole }
}

function holeExtent(l: Level) {
  let minX = l.w
  let minY = l.h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < l.h; y++) {
    for (let x = 0; x < l.w; x++) {
      if (!l.hole[y * l.w + x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? 0 : Math.max(maxX - minX + 1, maxY - minY + 1)
}

/** The coarsest level's starting fill: peel the hole from its edge inward,
 *  each pixel the average of the known ones around it. */
function onionFill(l: Level) {
  const { w, h, img } = l
  const known = new Uint8Array(w * h)
  let remaining = 0
  for (let i = 0; i < w * h; i++) {
    known[i] = l.hole[i] ? 0 : 1
    if (!known[i]) remaining++
  }
  while (remaining > 0) {
    const ring: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (known[i]) continue
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const j = ny * w + nx
            if (!known[j]) continue
            r += img[j * 3]
            g += img[j * 3 + 1]
            b += img[j * 3 + 2]
            n++
          }
        }
        if (!n) continue
        img[i * 3] = r / n
        img[i * 3 + 1] = g / n
        img[i * 3 + 2] = b / n
        ring.push(i)
      }
    }
    // A hole that touches nothing known (the whole level) — nothing to peel.
    if (!ring.length) break
    for (const i of ring) known[i] = 1
    remaining -= ring.length
  }
}

/**
 * One level of the fill. `targets` are the pixels whose patch touches the
 * hole; `isSource` marks the patch centres lying wholly in known photo.
 */
class LevelFill {
  readonly targets: Int32Array
  readonly isSource: Uint8Array
  readonly sources: Int32Array
  /** For each target (by its index in `targets`), its best source centre. */
  readonly nnf: Int32Array
  readonly nnd: Float32Array
  readonly l: Level
  /** How much each pixel can be trusted: 1 for the photo itself, less and
   *  less deeper into the hole, where it's only this fill's own guess. */
  readonly conf: Float32Array
  private readonly rand: () => number

  constructor(l: Level, seed: number) {
    this.l = l
    const { w, h, hole } = l
    this.rand = rng(seed)
    // Hole grown by the patch radius: those centres' patches touch the hole.
    const near = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!hole[y * w + x]) continue
        for (let dy = -R; dy <= R; dy++) {
          const ny = y + dy
          if (ny < 0 || ny >= h) continue
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx
            if (nx >= 0 && nx < w) near[ny * w + nx] = 1
          }
        }
      }
    }
    const targets: number[] = []
    const sources: number[] = []
    this.isSource = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (near[i]) targets.push(i)
        else if (x >= R && y >= R && x < w - R && y < h - R) {
          this.isSource[i] = 1
          sources.push(i)
        }
      }
    }
    this.conf = confidence(l)
    this.targets = Int32Array.from(targets)
    this.sources = Int32Array.from(sources)
    this.nnf = new Int32Array(targets.length)
    this.nnd = new Float32Array(targets.length)
  }

  get usable() {
    return this.sources.length > 0
  }

  randomSource() {
    return this.sources[Math.floor(this.rand() * this.sources.length)]
  }

  /** Sum of squared differences between the patches at p and q, stopping as
   *  soon as it passes `limit`. q is a source, so its patch is in bounds;
   *  p's may hang off the edge and is clamped. */
  distance(p: number, q: number, limit: number) {
    const { w, h, img } = this.l
    const conf = this.conf
    const px = p % w
    const py = (p - px) / w
    const qx = q % w
    const qy = (q - qx) / w
    let d = 0
    for (let dy = -R; dy <= R; dy++) {
      const ty = Math.min(h - 1, Math.max(0, py + dy))
      const sRow = (qy + dy) * w
      const tRow = ty * w
      for (let dx = -R; dx <= R; dx++) {
        const tx = Math.min(w - 1, Math.max(0, px + dx))
        const ti = (tRow + tx) * 3
        const si = (sRow + qx + dx) * 3
        const a = img[ti] - img[si]
        const b = img[ti + 1] - img[si + 1]
        const c = img[ti + 2] - img[si + 2]
        d += (a * a + b * b + c * c) * conf[tRow + tx]
      }
      if (d > limit) return d
    }
    return d
  }

  /** Starting matches: each target's nearest guess from the level below
   *  (scaled up), else anywhere at random. */
  initialise(previous?: { fill: LevelFill; w: number }) {
    const { w } = this.l
    const prevIndex = new Map<number, number>()
    if (previous) previous.fill.targets.forEach((t, k) => prevIndex.set(t, k))
    for (let k = 0; k < this.targets.length; k++) {
      const p = this.targets[k]
      let q = -1
      if (previous) {
        const x = p % w
        const y = (p - x) / w
        const cp = (y >> 1) * previous.w + (x >> 1)
        const ck = prevIndex.get(cp)
        if (ck !== undefined) {
          const cq = previous.fill.nnf[ck]
          const cqx = cq % previous.w
          const cqy = (cq - cqx) / previous.w
          const cand = (cqy * 2 + (y & 1)) * w + cqx * 2 + (x & 1)
          if (cqx * 2 + (x & 1) < w && cand < this.isSource.length && this.isSource[cand]) q = cand
        }
      }
      if (q < 0) q = this.randomSource()
      this.nnf[k] = q
      this.nnd[k] = this.distance(p, q, Infinity)
    }
  }

  /** PatchMatch: pass good matches along to neighbours, then look around
   *  each match at shrinking distances for a better one. */
  improve(iterations: number) {
    const { w, h } = this.l
    const index = new Int32Array(w * h).fill(-1)
    this.targets.forEach((t, k) => (index[t] = k))
    const n = this.targets.length
    for (let it = 0; it < iterations; it++) {
      const forward = it % 2 === 0
      const step = forward ? -1 : 1
      for (let s = 0; s < n; s++) {
        const k = forward ? s : n - 1 - s
        const p = this.targets[k]
        const px = p % w
        let best = this.nnf[k]
        let bestD = this.nnd[k]
        // Propagation from the neighbour just visited, left/up or right/down.
        for (const nb of [px + step >= 0 && px + step < w ? p + step : -1, p + step * w]) {
          if (nb < 0 || nb >= w * h) continue
          const nk = index[nb]
          if (nk < 0) continue
          const cand = this.nnf[nk] - (nb - p)
          if (cand < 0 || cand >= w * h || !this.isSource[cand]) continue
          // Same row for a horizontal step, or the shift wrapped a row.
          if (nb - p === step && Math.floor(cand / w) !== Math.floor(this.nnf[nk] / w)) continue
          const d = this.distance(p, cand, bestD)
          if (d < bestD) {
            best = cand
            bestD = d
          }
        }
        // Random search around the best so far.
        let radius = Math.max(w, h)
        const bx0 = best % w
        const by0 = (best - bx0) / w
        let bx = bx0
        let by = by0
        while (radius >= 1) {
          const cx = Math.round(bx + (this.rand() * 2 - 1) * radius)
          const cy = Math.round(by + (this.rand() * 2 - 1) * radius)
          if (cx >= 0 && cy >= 0 && cx < w && cy < h) {
            const cand = cy * w + cx
            if (this.isSource[cand]) {
              const d = this.distance(p, cand, bestD)
              if (d < bestD) {
                best = cand
                bestD = d
                bx = cx
                by = cy
              }
            }
          }
          radius >>= 1
        }
        this.nnf[k] = best
        this.nnd[k] = bestD
      }
    }
  }

  /** The last word on the finest level: each hole pixel takes the centre of
   *  its own best match outright. Averaging overlapping patches, as vote()
   *  does, is what keeps the coarse levels coherent, but it smooths water
   *  ripples and sand grain into a flat smear; one real pixel per pixel keeps
   *  the photo's own texture. */
  copyCentres() {
    const { img, hole } = this.l
    for (let k = 0; k < this.targets.length; k++) {
      const p = this.targets[k]
      if (!hole[p]) continue
      const q = this.nnf[k]
      img[p * 3] = img[q * 3]
      img[p * 3 + 1] = img[q * 3 + 1]
      img[p * 3 + 2] = img[q * 3 + 2]
    }
  }

  /** Every hole pixel becomes the weighted average of what each matched
   *  patch overlapping it says it should be; close matches count more. */
  vote() {
    const { w, h, img, hole } = this.l
    const acc = new Float32Array(w * h * 3)
    const wsum = new Float32Array(w * h)
    // Scale for the weights: a typical match distance at this step.
    const sorted = Float32Array.from(this.nnd).sort()
    const sigma = Math.max(1, sorted[Math.floor(sorted.length * 0.75)] || 1)
    for (let k = 0; k < this.targets.length; k++) {
      const p = this.targets[k]
      const q = this.nnf[k]
      const wt = Math.exp(-this.nnd[k] / sigma) * this.conf[p]
      const px = p % w
      const py = (p - px) / w
      const qx = q % w
      const qy = (q - qx) / w
      for (let dy = -R; dy <= R; dy++) {
        const ty = py + dy
        if (ty < 0 || ty >= h) continue
        for (let dx = -R; dx <= R; dx++) {
          const tx = px + dx
          if (tx < 0 || tx >= w) continue
          const t = ty * w + tx
          if (!hole[t]) continue
          const si = ((qy + dy) * w + qx + dx) * 3
          acc[t * 3] += img[si] * wt
          acc[t * 3 + 1] += img[si + 1] * wt
          acc[t * 3 + 2] += img[si + 2] * wt
          wsum[t] += wt
        }
      }
    }
    for (let t = 0; t < w * h; t++) {
      if (!hole[t] || wsum[t] <= 0) continue
      img[t * 3] = acc[t * 3] / wsum[t]
      img[t * 3 + 1] = acc[t * 3 + 1] / wsum[t]
      img[t * 3 + 2] = acc[t * 3 + 2] / wsum[t]
    }
  }
}

/** Wexler's confidence: 1 outside the hole, falling by a constant factor
 *  per pixel of distance from its edge. */
function confidence(l: Level): Float32Array {
  const { w, h, hole } = l
  const dist = new Int32Array(w * h).fill(-1)
  const queue: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (!hole[i]) {
      dist[i] = 0
      queue.push(i)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const x = i % w
    const y = (i - x) / w
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (dist[j] >= 0) continue
      dist[j] = dist[i] + 1
      queue.push(j)
    }
  }
  const conf = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) conf[i] = dist[i] === 0 ? 1 : dist[i] < 0 ? 0.05 : Math.max(0.05, 1.3 ** -dist[i])
  return conf
}

/** The finer level's hole starts as the coarser one's fill, scaled up. */
function seedFromCoarser(fine: Level, coarse: Level) {
  for (let y = 0; y < fine.h; y++) {
    for (let x = 0; x < fine.w; x++) {
      const i = y * fine.w + x
      if (!fine.hole[i]) continue
      // Bilinear, so the starting point has no blocks for patches to copy.
      const cx = Math.min(coarse.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5))
      const cy = Math.min(coarse.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5))
      const x0 = Math.floor(cx)
      const y0 = Math.floor(cy)
      const x1 = Math.min(coarse.w - 1, x0 + 1)
      const y1 = Math.min(coarse.h - 1, y0 + 1)
      const fx = cx - x0
      const fy = cy - y0
      for (let c = 0; c < 3; c++) {
        const a = coarse.img[(y0 * coarse.w + x0) * 3 + c]
        const b = coarse.img[(y0 * coarse.w + x1) * 3 + c]
        const d = coarse.img[(y1 * coarse.w + x0) * 3 + c]
        const e = coarse.img[(y1 * coarse.w + x1) * 3 + c]
        fine.img[i * 3 + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy
      }
    }
  }
}

/**
 * Rebuilds the masked part of `input`. Returns the whole RGBA image with the
 * hole filled; everything outside the mask is left exactly as it was.
 */
export function heal(input: HealInput, seed = 7): Uint8ClampedArray {
  const levels: Level[] = [toLevel(input)]
  // Down until the hole is only a few patches across, keeping enough photo
  // around it to copy from.
  while (holeExtent(levels[levels.length - 1]) > R * 4) {
    const top = levels[levels.length - 1]
    if (Math.min(top.w, top.h) < R * 8) break
    levels.push(downsample(top))
  }
  onionFill(levels[levels.length - 1])

  let previous: { fill: LevelFill; w: number } | undefined
  for (let li = levels.length - 1; li >= 0; li--) {
    const level = levels[li]
    if (li < levels.length - 1) seedFromCoarser(level, levels[li + 1])
    const fill = new LevelFill(level, seed + li)
    if (!fill.usable || !fill.targets.length) {
      previous = undefined
      continue
    }
    fill.initialise(previous)
    // The fine levels are the big ones and only polish what the coarse ones
    // settled, so they get fewer rounds.
    const coarse = li >= levels.length - 2
    const heavy = fill.targets.length > 120_000
    const rounds = coarse ? 6 : li === 0 ? (heavy ? 1 : 2) : 3
    const passes = heavy ? 1 : 2
    if (previous) fill.vote()
    for (let r = 0; r < rounds; r++) {
      fill.improve(passes)
      fill.vote()
    }
    if (li === 0) {
      fill.improve(passes)
      fill.copyCentres()
    }
    previous = { fill, w: level.w }
  }

  const out = new Uint8ClampedArray(input.rgba)
  const fine = levels[0]
  for (let i = 0; i < fine.w * fine.h; i++) {
    if (!fine.hole[i]) continue
    out[i * 4] = fine.img[i * 3]
    out[i * 4 + 1] = fine.img[i * 3 + 1]
    out[i * 4 + 2] = fine.img[i * 3 + 2]
  }
  return out
}
