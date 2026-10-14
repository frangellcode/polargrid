/**
 * Edit and Retro: everything a person can do to ONE photo's look — the light
 * and colour sliders, grain, sharpness, and a Retro film style under them.
 *
 * Plain JS on ImageData, for the same reason as sharpen.ts: canvas filters only
 * reached WebKit with iOS 18 and the app supports iOS 16. The colour work is
 * per pixel — no neighbourhood — so the export can run it tile by tile with no
 * seams, and the preview and the export agree exactly at any size. The two
 * effects that do depend on position (grain and the Retro vignette) are drawn
 * as overlays over the photo's visible rect instead, both on screen and in the
 * export.
 */

/** The light and colour sliders, each -1..1 with 0 untouched. */
export const TONE_KEYS = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'temperature',
  'tint',
  'vibrance',
  'saturation',
] as const
export type ToneKey = (typeof TONE_KEYS)[number]

/** 0..1 sliders, 0 = off. */
export type DetailKey = 'vignette' | 'sharpness' | 'grain'
export type AdjustmentKey = ToneKey | DetailKey

/** The colour mix's bands, round the hue circle, and where each sits (degrees). */
export const HSL_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
export type HslBand = (typeof HSL_BANDS)[number]
export const HSL_BAND_HUES: Record<HslBand, number> = { red: 0, orange: 30, yellow: 60, green: 120, aqua: 180, blue: 240, purple: 270, magenta: 300 }
/** Hue, saturation and luminance shifts for one band, each -1..1. */
export type HslShift = [number, number, number]
export type HslMix = Partial<Record<HslBand, HslShift>>

/** Tone curve points, x and y in 0..1, sorted by x, both ends included. */
export type CurvePoint = [number, number]
export const CURVE_CHANNELS = ['rgb', 'r', 'g', 'b'] as const
export type CurveChannel = (typeof CURVE_CHANNELS)[number]
export type ToneCurves = Record<CurveChannel, CurvePoint[]>
export const IDENTITY_CURVE: CurvePoint[] = [
  [0, 0],
  [1, 1],
]

export type PhotoAdjustments = Record<AdjustmentKey, number> & {
  /** The colour mix (HSL): per-band hue, saturation and luminance. */
  hsl: HslMix
  /** Curves, master then per channel; null = untouched. */
  toneCurves: ToneCurves | null
  /** RETRO_PRESETS id, null = none. */
  retro: string | null
  /** 0..1 how strongly the Retro style is applied. */
  retroAmount: number
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  vignette: 0,
  sharpness: 0,
  grain: 0,
  hsl: {},
  toneCurves: null,
  retro: null,
  retroAmount: 1,
}

type Rgb = [number, number, number]

export interface RetroPreset {
  id: string
  /** The look, as the same light and colour sliders the person has. */
  tone: Partial<Record<ToneKey, number>>
  /** Lifts the black point, 0..~0.15 — the washed-out shadows of old prints. */
  fade?: number
  /** Black and white. */
  mono?: boolean
  /** Colour pushed into the shadows / highlights (split toning), 0..1 channels. */
  shadowTint?: Rgb
  highlightTint?: Rgb
  /** How hard the split toning pushes, 0..1. */
  tintStrength?: number
  /** Per-channel film curves, applied after the colour work: each channel
   *  becomes lift + (gain − lift) · c^gamma. This is where film crossovers
   *  live — blue lifted in the shadows, red bent warm in the mids. */
  curves?: { lift?: Rgb; gamma?: Rgb; gain?: Rgb }
  /** Built-in film grain and vignette, 0..1. */
  grain?: number
  vignette?: number
}

/**
 * Our own looks. Named for a feeling rather than a camera or film maker on
 * purpose: brand names are other companies' trademarks, and App Review
 * rejects apps that use them without permission (Guideline 5.2.1).
 */
export const RETRO_PRESETS: RetroPreset[] = [
  {
    // Portrait colour negative: warm skin, soft contrast, peach highlights.
    id: 'retrato',
    tone: { temperature: 0.12, contrast: -0.08, saturation: -0.1, vibrance: 0.1, highlights: -0.1 },
    curves: { lift: [0.03, 0.02, 0.04], gamma: [0.95, 1, 1.05] },
    highlightTint: [1, 0.85, 0.7],
    tintStrength: 0.25,
    fade: 0.03,
    grain: 0.2,
    vignette: 0.15,
  },
  {
    // Fine-grain vivid colour: punchy, saturated, deep blacks.
    id: 'vivido',
    tone: { vibrance: 0.5, contrast: 0.22, saturation: 0.15, blacks: -0.08 },
    curves: { gamma: [0.97, 1, 1.03] },
    vignette: 0.12,
  },
  {
    // Consumer 400 film with its green cast in the shadows.
    id: 'verde',
    tone: { tint: -0.15, contrast: 0.1, saturation: -0.05 },
    curves: { lift: [0, 0.03, 0.04], gamma: [1.03, 0.97, 1] },
    shadowTint: [0.25, 0.45, 0.35],
    tintStrength: 0.3,
    grain: 0.3,
    vignette: 0.18,
  },
  {
    // Bright, soft, faded, mint-and-teal pastel.
    id: 'pastel',
    tone: { contrast: -0.2, temperature: -0.05, tint: -0.05, saturation: -0.1, exposure: 0.08 },
    fade: 0.07,
    shadowTint: [0.3, 0.5, 0.45],
    highlightTint: [0.9, 1, 0.92],
    tintStrength: 0.3,
  },
  {
    // Cross-processed slide film: yellow-green highlights, blue shadows.
    id: 'cruzado',
    tone: { contrast: 0.25, saturation: 0.2 },
    curves: { lift: [0, 0, 0.08], gamma: [0.85, 0.95, 1.25], gain: [1, 1, 0.85] },
    vignette: 0.3,
  },
  {
    // Punchy black and white with deep blacks.
    id: 'noir',
    tone: { contrast: 0.5, blacks: -0.25, highlights: 0.1 },
    mono: true,
    grain: 0.3,
    vignette: 0.4,
  },
  {
    // Classic 400-speed black and white: open shadows, heavy grain.
    id: 'plata',
    tone: { contrast: 0.25, shadows: 0.1 },
    mono: true,
    grain: 0.5,
    vignette: 0.2,
  },
  {
    // Soft, faded black and white.
    id: 'niebla',
    tone: { contrast: -0.15, highlights: -0.1 },
    mono: true,
    fade: 0.1,
    grain: 0.25,
    vignette: 0.15,
  },
  {
    // Golden-hour warmth with rosy highlights.
    id: 'atardecer',
    tone: { temperature: 0.25, tint: 0.1, contrast: 0.05 },
    curves: { gain: [1, 0.93, 0.85] },
    highlightTint: [1, 0.65, 0.55],
    tintStrength: 0.35,
    fade: 0.05,
    vignette: 0.25,
  },
  {
    // 80s mint: green-leaning, gently faded.
    id: 'menta',
    tone: { tint: -0.2, temperature: -0.1, contrast: -0.05 },
    curves: { gamma: [1.05, 0.95, 1] },
    fade: 0.06,
    highlightTint: [0.8, 1, 0.9],
    tintStrength: 0.3,
  },
  {
    // 90s drugstore film: warm, vivid, a little grain.
    id: 'verano',
    tone: { vibrance: 0.35, temperature: 0.2, highlights: -0.15 },
    curves: { gamma: [0.94, 0.98, 1.1] },
    fade: 0.04,
    grain: 0.25,
    vignette: 0.15,
  },
]

export function getRetroPreset(id: string | null | undefined): RetroPreset | null {
  return (id && RETRO_PRESETS.find((p) => p.id === id)) || null
}

function activeRetro(a: PhotoAdjustments | null | undefined): RetroPreset | null {
  return a && a.retroAmount > 0 ? getRetroPreset(a.retro) : null
}

export function hasHsl(mix: HslMix | null | undefined): boolean {
  return !!mix && Object.values(mix).some((v) => !!v && (v[0] !== 0 || v[1] !== 0 || v[2] !== 0))
}

export function isIdentityCurve(points: CurvePoint[]): boolean {
  return points.every(([x, y]) => Math.abs(x - y) < 1e-4)
}

export function hasCurves(c: ToneCurves | null | undefined): c is ToneCurves {
  return !!c && CURVE_CHANNELS.some((ch) => !isIdentityCurve(c[ch]))
}

/** Whether the photo's pixels change colour (the per-pixel pass). */
export function hasColourWork(a: PhotoAdjustments | null | undefined): a is PhotoAdjustments {
  return !!a && (TONE_KEYS.some((k) => a[k] !== 0) || hasHsl(a.hsl) || hasCurves(a.toneCurves) || activeRetro(a) !== null)
}

/** Whether anything at all is applied — what the before/after button asks. */
export function hasAdjustments(a: PhotoAdjustments | null | undefined): a is PhotoAdjustments {
  if (!a) return false
  return a.grain > 0 || a.sharpness > 0 || a.vignette > 0 || hasColourWork(a)
}

/** Stable key for the colour pass, for memoising on the values rather than the object. */
export function adjustmentsKey(a: PhotoAdjustments | null | undefined): string {
  if (!hasColourWork(a)) return ''
  const curves = hasCurves(a.toneCurves) ? JSON.stringify(a.toneCurves) : ''
  const hsl = hasHsl(a.hsl) ? JSON.stringify(a.hsl) : ''
  return `${TONE_KEYS.map((k) => a[k]).join(',')}|${activeRetro(a)?.id ?? ''}|${a.retroAmount}|${hsl}|${curves}`
}

/** The grain actually drawn: the person's own, or the Retro style's if stronger. */
export function effectiveGrain(a: PhotoAdjustments | null | undefined): number {
  if (!a) return 0
  const retro = activeRetro(a)
  return Math.max(a.grain, (retro?.grain ?? 0) * a.retroAmount)
}

/** 0..1 darkening at the photo's corners: the person's own, stacked on the
 *  Retro style's the way two vignettes over each other would. */
export function effectiveVignette(a: PhotoAdjustments | null | undefined): number {
  if (!a) return 0
  const retro = activeRetro(a)
  const fromRetro = retro ? (retro.vignette ?? 0) * a.retroAmount : 0
  return 1 - (1 - (a.vignette ?? 0)) * (1 - fromRetro)
}

/** sRGB byte -> linear light. */
const TO_LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Linear light 0..1 -> sRGB 0..1, sampled finely enough to be exact at 8 bits. */
const TO_SRGB_STEPS = 4096
const TO_SRGB = new Float32Array(TO_SRGB_STEPS + 1)
for (let i = 0; i <= TO_SRGB_STEPS; i++) {
  const c = i / TO_SRGB_STEPS
  TO_SRGB[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

function toSrgb(linear: number): number {
  if (linear <= 0) return 0
  if (linear >= 1) return 1
  return TO_SRGB[(linear * TO_SRGB_STEPS + 0.5) | 0]
}

/** Peak of L·(1−L)³, so the shadow and highlight bumps top out at exactly 1. */
const BUMP_PEAK = 0.25 * 0.75 ** 3

/** One pass over the pixels, worked out once per edit. */
interface Pass {
  linear: boolean
  rGain: number
  gGain: number
  bGain: number
  tone: boolean
  /** Tone curve on luminance, 256 entries. */
  curve: Float32Array
  colour: boolean
  saturation: number
  vibrance: number
  mono: boolean
  split: boolean
  shadowTint: Rgb
  highlightTint: Rgb
  tintStrength: number
  curves: boolean
  lift: Rgb
  gamma: Rgb
  gain: Rgb
  fade: number
  /** Blend of this pass's result over its input, 0..1. */
  amount: number
}

function compilePass(t: Partial<Record<ToneKey, number>>, extra: Partial<RetroPreset> = {}, amount = 1): Pass {
  const v = (k: ToneKey) => t[k] ?? 0
  // Exposure in stops, applied to linear light like a camera would. White
  // balance as channel gains: warm lifts red and cuts blue, tint pulls green
  // against magenta.
  const gain = 2 ** (v('exposure') * 2)
  const contrast = 1 + v('contrast') * (v('contrast') > 0 ? 0.8 : 0.6)
  const curve = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const l = i / 255
    let c = 0.5 + (l - 0.5) * contrast
    c += v('shadows') * 0.3 * ((l * (1 - l) ** 3) / BUMP_PEAK)
    c += v('highlights') * 0.3 * ((l ** 3 * (1 - l)) / BUMP_PEAK)
    c += v('whites') * 0.25 * l ** 3
    c += v('blacks') * 0.25 * (1 - l) ** 3
    curve[i] = c
  }
  return {
    linear: v('exposure') !== 0 || v('temperature') !== 0 || v('tint') !== 0,
    rGain: gain * (1 + v('temperature') * 0.3) * (1 + v('tint') * 0.12),
    gGain: gain * (1 - v('tint') * 0.25),
    bGain: gain * (1 - v('temperature') * 0.3) * (1 + v('tint') * 0.12),
    tone: v('contrast') !== 0 || v('shadows') !== 0 || v('highlights') !== 0 || v('whites') !== 0 || v('blacks') !== 0,
    curve,
    colour: v('saturation') !== 0 || v('vibrance') !== 0,
    saturation: 1 + v('saturation'),
    vibrance: v('vibrance'),
    mono: !!extra.mono,
    split: !!(extra.tintStrength && (extra.shadowTint || extra.highlightTint)),
    shadowTint: extra.shadowTint ?? [0.5, 0.5, 0.5],
    highlightTint: extra.highlightTint ?? [0.5, 0.5, 0.5],
    tintStrength: extra.tintStrength ?? 0,
    curves: !!extra.curves,
    lift: extra.curves?.lift ?? [0, 0, 0],
    gamma: extra.curves?.gamma ?? [1, 1, 1],
    gain: extra.curves?.gain ?? [1, 1, 1],
    fade: extra.fade ?? 0,
    amount,
  }
}

function runPass(data: Uint8ClampedArray, p: Pass) {
  const n = data.length
  const blend = p.amount < 1
  for (let i = 0; i < n; i += 4) {
    if (data[i + 3] === 0) continue
    const r0 = data[i] / 255
    const g0 = data[i + 1] / 255
    const b0 = data[i + 2] / 255
    let r: number
    let g: number
    let b: number
    if (p.linear) {
      r = toSrgb(TO_LINEAR[data[i]] * p.rGain)
      g = toSrgb(TO_LINEAR[data[i + 1]] * p.gGain)
      b = toSrgb(TO_LINEAR[data[i + 2]] * p.bGain)
    } else {
      r = r0
      g = g0
      b = b0
    }

    if (p.tone) {
      // Shifting all three channels by the curve's change in luminance keeps
      // the hue where it was; scaling them by a ratio would blow saturated
      // darks out.
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const idx = l <= 0 ? 0 : l >= 1 ? 255 : (l * 255 + 0.5) | 0
      const delta = p.curve[idx] - l
      r += delta
      g += delta
      b += delta
    }

    if (p.colour || p.mono) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      let k = p.mono ? 0 : p.saturation
      if (!p.mono && p.vibrance !== 0) {
        // Vibrance favours the colours that are still muted, so skin and an
        // already-vivid sky don't run away with it.
        const max = r > g ? (r > b ? r : b) : g > b ? g : b
        const min = r < g ? (r < b ? r : b) : g < b ? g : b
        k *= 1 + p.vibrance * (p.vibrance > 0 ? 1 - (max - min) : 1)
      }
      r = l + (r - l) * k
      g = l + (g - l) * k
      b = l + (b - l) * k
    }

    if (p.curves) {
      const cr = r <= 0 ? 0 : r >= 1 ? 1 : r
      const cg = g <= 0 ? 0 : g >= 1 ? 1 : g
      const cb = b <= 0 ? 0 : b >= 1 ? 1 : b
      r = p.lift[0] + (p.gain[0] - p.lift[0]) * (p.gamma[0] === 1 ? cr : cr ** p.gamma[0])
      g = p.lift[1] + (p.gain[1] - p.lift[1]) * (p.gamma[1] === 1 ? cg : cg ** p.gamma[1])
      b = p.lift[2] + (p.gain[2] - p.lift[2]) * (p.gamma[2] === 1 ? cb : cb ** p.gamma[2])
    }

    if (p.split) {
      // Split toning: soft-light the shadow colour into the darks and the
      // highlight colour into the lights, weighted by luminance.
      const l = Math.min(1, Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b))
      const ws = (1 - l) * (1 - l) * p.tintStrength
      const wh = l * l * p.tintStrength
      r += (p.shadowTint[0] - 0.5) * ws + (p.highlightTint[0] - 0.5) * wh
      g += (p.shadowTint[1] - 0.5) * ws + (p.highlightTint[1] - 0.5) * wh
      b += (p.shadowTint[2] - 0.5) * ws + (p.highlightTint[2] - 0.5) * wh
    }

    if (p.fade > 0) {
      // Lifts the black point and pulls the white point in a little, like a
      // print that has sat in the sun.
      const span = 1 - p.fade * 1.4
      r = p.fade + r * span
      g = p.fade + g * span
      b = p.fade + b * span
    }

    if (blend) {
      r = r0 + (r - r0) * p.amount
      g = g0 + (g - g0) * p.amount
      b = b0 + (b - b0) * p.amount
    }

    data[i] = r * 255
    data[i + 1] = g * 255
    data[i + 2] = b * 255
  }
}

// --- Colour mix (HSL) ---------------------------------------------------------

/** Per-degree hue, saturation and luminance shifts, each band blending
 *  linearly into its neighbours round the circle. */
function compileHsl(mix: HslMix): Float32Array {
  const table = new Float32Array(360 * 3)
  const centres = HSL_BANDS.map((b) => HSL_BAND_HUES[b])
  for (let deg = 0; deg < 360; deg++) {
    let i = centres.length - 1
    for (let k = 0; k < centres.length; k++) if (centres[k] <= deg) i = k
    const j = (i + 1) % centres.length
    const from = centres[i]
    const to = j === 0 ? 360 : centres[j]
    const t = (deg - from) / (to - from)
    const a = mix[HSL_BANDS[i]] ?? [0, 0, 0]
    const b = mix[HSL_BANDS[j]] ?? [0, 0, 0]
    for (let c = 0; c < 3; c++) table[deg * 3 + c] = a[c] + (b[c] - a[c]) * t
  }
  return table
}

function runHsl(data: Uint8ClampedArray, table: Float32Array) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const max = r > g ? (r > b ? r : b) : g > b ? g : b
    const min = r < g ? (r < b ? r : b) : g < b ? g : b
    const d = max - min
    if (d < 1e-4) continue // greys have no hue to shift
    const l = (max + min) / 2
    let s = d / (1 - Math.abs(2 * l - 1))
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
    const at = ((h + 0.5) | 0) % 360
    const dh = table[at * 3]
    const ds = table[at * 3 + 1]
    const dl = table[at * 3 + 2]
    // Weighted by how colourful the pixel is, so near-greys barely move.
    const weight = s < 0.15 ? s / 0.15 : 1
    h = (h + dh * 30 * weight + 360) % 360
    s = Math.min(1, Math.max(0, s * (1 + ds * weight)))
    const nl = Math.min(1, Math.max(0, l + dl * 0.25 * s * weight))
    // Back to RGB.
    const c = (1 - Math.abs(2 * nl - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = nl - c / 2
    let r1: number, g1: number, b1: number
    if (h < 60) [r1, g1, b1] = [c, x, 0]
    else if (h < 120) [r1, g1, b1] = [x, c, 0]
    else if (h < 180) [r1, g1, b1] = [0, c, x]
    else if (h < 240) [r1, g1, b1] = [0, x, c]
    else if (h < 300) [r1, g1, b1] = [x, 0, c]
    else [r1, g1, b1] = [c, 0, x]
    data[i] = (r1 + m) * 255
    data[i + 1] = (g1 + m) * 255
    data[i + 2] = (b1 + m) * 255
  }
}

// --- Curves -------------------------------------------------------------------

/** A smooth curve through `points` that never overshoots between them
 *  (monotone cubic, Fritsch–Carlson), sampled to `size` entries. */
export function sampleCurve(points: CurvePoint[], size = 256): Float32Array {
  const out = new Float32Array(size)
  const n = points.length
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const delta: number[] = []
  for (let k = 0; k < n - 1; k++) delta.push((ys[k + 1] - ys[k]) / Math.max(1e-6, xs[k + 1] - xs[k]))
  const m: number[] = new Array(n)
  m[0] = delta[0] ?? 0
  m[n - 1] = delta[n - 2] ?? 0
  for (let k = 1; k < n - 1; k++) m[k] = delta[k - 1] * delta[k] <= 0 ? 0 : (delta[k - 1] + delta[k]) / 2
  for (let k = 0; k < n - 1; k++) {
    if (delta[k] === 0) {
      m[k] = 0
      m[k + 1] = 0
      continue
    }
    const a = m[k] / delta[k]
    const b = m[k + 1] / delta[k]
    const h = a * a + b * b
    if (h > 9) {
      const t = 3 / Math.sqrt(h)
      m[k] = t * a * delta[k]
      m[k + 1] = t * b * delta[k]
    }
  }
  let k = 0
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1)
    let y: number
    if (x <= xs[0]) y = ys[0]
    else if (x >= xs[n - 1]) y = ys[n - 1]
    else {
      while (k < n - 2 && x > xs[k + 1]) k++
      const h = xs[k + 1] - xs[k]
      const t = (x - xs[k]) / h
      const t2 = t * t
      const t3 = t2 * t
      y = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1]
    }
    out[i] = y < 0 ? 0 : y > 1 ? 1 : y
  }
  return out
}

/** Master curve, then each channel's own, as one lookup per channel. */
function runCurves(data: Uint8ClampedArray, c: ToneCurves) {
  const master = sampleCurve(c.rgb)
  const luts = [c.r, c.g, c.b].map((pts) => {
    const own = sampleCurve(pts)
    const lut = new Uint8ClampedArray(256)
    for (let i = 0; i < 256; i++) lut[i] = own[Math.round(master[i] * 255)] * 255
    return lut
  })
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    data[i] = luts[0][data[i]]
    data[i + 1] = luts[1][data[i + 1]]
    data[i + 2] = luts[2][data[i + 2]]
  }
}

/** One Retro style's colour work on its own, at `amount` — for previews of a
 *  style that isn't in RETRO_PRESETS yet. */
export function applyRetroPreset(image: ImageData, preset: RetroPreset, amount = 1) {
  runPass(image.data, compilePass(preset.tone, preset, Math.min(1, amount)))
}

/** Applies the photo's colour work to `image` in place: the Retro style first
 *  (at its strength), then the person's own sliders on top, then the colour
 *  mix, then curves. Grain, sharpness and the vignette are not per pixel and
 *  are applied elsewhere. Fully transparent pixels are skipped. */
export function applyAdjustments(image: ImageData, a: PhotoAdjustments) {
  if (!hasColourWork(a)) return
  const retro = activeRetro(a)
  if (retro) runPass(image.data, compilePass(retro.tone, retro, Math.min(1, a.retroAmount)))
  if (TONE_KEYS.some((k) => a[k] !== 0)) runPass(image.data, compilePass(a))
  if (hasHsl(a.hsl)) runHsl(image.data, compileHsl(a.hsl))
  if (hasCurves(a.toneCurves)) runCurves(image.data, a.toneCurves)
}

/** Darkens the corners of a `w`×`h` rect at the origin of ctx's current
 *  coordinates — the Retro vignette, same in the export as on screen. */
export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  if (strength <= 0 || w <= 0 || h <= 0) return
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
  for (const [stop, alpha] of vignetteStops(strength)) g.addColorStop(stop, `rgba(0,0,0,${alpha})`)
  ctx.save()
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** Gradient stops shared by the export and the Konva preview. */
export function vignetteStops(strength: number): [number, number][] {
  return [
    [0, 0],
    [0.55, 0],
    [0.8, 0.35 * strength],
    [1, 0.75 * strength],
  ]
}
