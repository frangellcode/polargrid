import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from '../store/languageStore'
import { Logo } from './Logo'
import { markTourSeen } from '../lib/tour'

/** The tour's photos (public/tour): the developer's own pictures, run through
 *  the app's own engine, so every card shows what the app really does. */
const photo = (name: string) => `${import.meta.env.BASE_URL}tour/${name}.jpg`

function Img({ name, className = '', style }: { name: string; className?: string; style?: CSSProperties }) {
  return <img src={photo(name)} alt="" draggable={false} className={`block h-full w-full object-cover ${className}`} style={style} />
}

/** A print: the photo in a white border, the app's signature look. */
function Print({ name, className = '', style, pad = '5%' }: { name: string; className?: string; style?: CSSProperties; pad?: string }) {
  return (
    <div className={`bg-white shadow-2xl shadow-black/50 ${className}`} style={{ padding: pad, ...style }}>
      <div className="h-full w-full overflow-hidden">
        <Img name={name} />
      </div>
    </div>
  )
}

/** Logo over a fan of prints that drift gently. */
function WelcomeArt() {
  const prints = [
    { name: 'boat', rotate: -14, x: '-58%', delay: '0s' },
    { name: 'sandbar', rotate: 13, x: '58%', delay: '-1.6s' },
    { name: 'resort', rotate: -2, x: '0%', delay: '-0.8s' },
  ]
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute h-56 w-56 rounded-full bg-amber-200/10 blur-3xl" />
      {prints.map((p) => (
        <div key={p.name} className="tour-float absolute aspect-[4/5] w-[44%]" style={{ animationDelay: p.delay }}>
          <Print name={p.name} className="h-full w-full" style={{ transform: `translateX(${p.x}) rotate(${p.rotate}deg)` }} />
        </div>
      ))}
      <div className="relative mt-[62%] rounded-[22px] bg-ink-900/80 p-2 shadow-2xl backdrop-blur">
        <Logo size={64} />
      </div>
    </div>
  )
}

/** A photo whose white border breathes thicker and thinner, over the aspect chips. */
function BorderArt() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="tour-breathe aspect-[4/5] w-[62%] bg-white shadow-2xl shadow-black/50">
        <div className="h-full w-full overflow-hidden">
          <Img name="resort" />
        </div>
      </div>
      <div className="flex gap-1.5">
        {['4:5', '1:1', '9:16', '3:4'].map((r, i) => (
          <span
            key={r}
            className={`font-label rounded-full px-2.5 py-1 text-[10px] font-semibold ${i === 0 ? 'bg-white text-ink-900' : 'bg-white/10 text-white/60'}`}
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A tall template collage of real event photos, cells easing into place. */
function CollageArt() {
  // One big cell top-left, two beside it, then two rows of three.
  const cells = ['col-span-2 row-span-2', '', '', '', '', '', '', '', '']
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="grid aspect-[9/16] h-[92%] grid-cols-3 grid-rows-4 gap-[1%] bg-white p-[1%] shadow-2xl shadow-black/50">
        {cells.map((span, i) => (
          <div key={i} className={`tour-pop overflow-hidden ${span}`} style={{ animationDelay: `${i * 0.08}s` }}>
            <Img name={`collage-${i + 1}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Before and after an edit, the divider sweeping across, over a row of dials. */
function EditArt() {
  const tr = useTranslation()
  const dials = [
    { label: tr.edit.exposure, v: 0.35 },
    { label: tr.edit.contrast, v: 0.55 },
    { label: tr.edit.shadows, v: 0.7 },
    { label: tr.edit.vibrance, v: 0.45 },
  ]
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="relative aspect-[4/5] w-[60%] overflow-hidden shadow-2xl shadow-black/50">
        <Img name="edit-before" />
        <div className="tour-split absolute inset-0">
          <Img name="edit-after" />
        </div>
        <div className="tour-divider absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" />
      </div>
      <div className="flex gap-3">
        {dials.map((d, i) => (
          <div key={d.label} className="flex flex-col items-center gap-1">
            <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="tour-dial"
                style={{ strokeDasharray: `${d.v * 94.2} 94.2`, animationDelay: `${i * 0.15}s` }}
              />
            </svg>
            <span className="font-label w-14 truncate text-center text-[8px] font-semibold uppercase tracking-wide text-white/50">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A close-up under a loupe: soft on one side, crisp with film grain on the other. */
function DetailArt() {
  const tr = useTranslation()
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="relative aspect-square w-[64%] overflow-hidden rounded-full shadow-2xl shadow-black/60 ring-4 ring-white">
        <Img name="detail-soft" />
        <div className="tour-split absolute inset-0">
          <Img name="detail-crisp" />
        </div>
        <div className="tour-divider absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" />
      </div>
      <div className="flex gap-1.5">
        {[tr.edit.sharpness, tr.edit.grain].map((t) => (
          <span key={t} className="font-label rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-ink-900">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The same photo in three Retro styles, fanned out like prints on a table. */
function RetroArt() {
  const looks = [
    { name: 'retro-vivido', rotate: -12, x: '-62%' },
    { name: 'retro-cruzado', rotate: 12, x: '62%' },
    { name: 'retro-plata', rotate: 0, x: '0%' },
  ]
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {looks.map((look, i) => (
        <div key={look.name} className="tour-float absolute aspect-[4/5] w-[40%]" style={{ animationDelay: `${-i * 0.9}s` }}>
          <Print
            name={look.name}
            pad="4%"
            className="h-full w-full"
            style={{ transform: `translateX(${look.x}) rotate(${look.rotate}deg)`, paddingBottom: '14%' }}
          />
        </div>
      ))}
    </div>
  )
}

/** Sky blue — the "Cielo" workspace background the Stories cards show. */
const SKY = '#9ccbea'

/** Stories in one card: the same bordered photo without the background and
 *  with it (centred on the 9:16 sky-blue canvas it exports onto), over
 *  "Export with this background" switching on. */
function StoryArt() {
  const tr = useTranslation()
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="flex w-full items-start justify-center gap-4">
        {[false, true].map((withBg) => (
          <div key={String(withBg)} className="flex w-[36%] flex-col items-center gap-2">
            <div
              className={`flex aspect-[9/16] w-full items-center justify-center rounded-lg ${withBg ? 'shadow-2xl shadow-black/50 ring-1 ring-white/10' : ''}`}
              style={withBg ? { backgroundColor: SKY } : undefined}
            >
              <Print name="sandbar" pad="4%" className="aspect-[4/5] w-[91%]" />
            </div>
            <span
              className={`font-label rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                withBg ? 'bg-white text-ink-900' : 'bg-white/10 text-white/70'
              }`}
            >
              {withBg ? tr.tour.withBackground : tr.tour.withoutBackground}
            </span>
          </div>
        ))}
      </div>
      <div className="flex w-[78%] items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
        <span className="flex flex-col">
          <span className="font-label text-[11px] font-semibold text-white">{tr.pickers.exportWithBackground}</span>
          <span className="font-label text-[9px] text-white/45">{tr.pickers.exportWithBackgroundHint}</span>
        </span>
        <span className="tour-switch relative h-5 w-9 shrink-0 rounded-full">
          <span className="tour-knob absolute top-0.5 h-4 w-4 rounded-full shadow" />
        </span>
      </div>
    </div>
  )
}

/** A finished print over the three export qualities, the Pro one marked. */
function ExportArt() {
  const tr = useTranslation()
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5">
      <Print name="boat" className="aspect-[4/5] w-[58%]" />
      <div className="flex gap-1.5">
        {[tr.quality.native.label, tr.quality.high.label, tr.quality.web.label].map((q, i) => (
          <span
            key={q}
            className={`font-label relative rounded-full px-2.5 py-1 text-[10px] font-semibold ${i === 0 ? 'bg-white text-ink-900' : 'bg-white/10 text-white/60'}`}
          >
            {q}
            {i === 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-amber-300 px-1 text-[7px] font-bold leading-[14px] text-ink-900">PRO</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

const ART: ReactNode[] = [
  <WelcomeArt key="w" />,
  <BorderArt key="b" />,
  <CollageArt key="c" />,
  <EditArt key="e" />,
  <DetailArt key="d" />,
  <RetroArt key="r" />,
  <StoryArt key="s" />,
  <ExportArt key="x" />,
]

interface WelcomeTourProps {
  onClose: () => void
  /** First launch, straight out of the splash: the screen is already there
   *  (same colour as the splash), and its contents ease in one after another
   *  instead of the whole view sliding in. */
  soft?: boolean
}

/**
 * First-launch walkthrough: a few swipeable cards showing what the app does,
 * each with a real photo processed the way the app would. Shown once per device (Home's "?" brings it
 * back). Native scroll snapping does the swiping, so it moves exactly like any
 * other horizontal swipe on the phone.
 */
export function WelcomeTour({ onClose, soft = false }: WelcomeTourProps) {
  /** Staggered entrance, first launch only. */
  const softIn = (delay: number, on = true) => ({
    cls: soft && on ? 'tour-soft-in' : '',
    style: soft && on ? { animationDelay: `${delay}ms` } : undefined,
  })
  const tr = useTranslation()
  const slides = tr.tour.slides
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const last = index === slides.length - 1

  const close = () => {
    markTourSeen()
    setLeaving(true)
  }

  useEffect(() => {
    if (!leaving) return
    // Backstop for a swallowed animationend (see App.tsx's TRANSITION_BACKSTOP_MS).
    const t = setTimeout(onClose, 260)
    return () => clearTimeout(t)
  }, [leaving, onClose])

  const goTo = (i: number) => {
    const track = trackRef.current
    if (!track) return
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={slides[0].title}
      className={`fixed inset-0 z-40 flex flex-col bg-ink-900 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] ${leaving ? 'view-exit' : soft ? '' : 'view-enter'}`}
      onAnimationEnd={(e) => e.target === e.currentTarget && leaving && onClose()}
    >
      <div className={`flex justify-end px-4 ${softIn(1100).cls}`} style={softIn(1100).style}>
        <button
          type="button"
          onClick={close}
          className={`font-label rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 transition hover:text-white active:scale-90 ${last ? 'invisible' : ''}`}
        >
          {tr.tour.skip}
        </button>
      </div>

      <div
        ref={trackRef}
        className="scroll-row flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onScroll={(e) => {
          const el = e.currentTarget
          setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth))))
        }}
      >
        {slides.map((slide, i) => (
          <section key={i} className="flex w-full shrink-0 snap-center flex-col items-center px-8" aria-hidden={i !== index}>
            <div
              className={`flex min-h-0 w-full max-w-xs flex-1 items-center justify-center py-4 ${softIn(250, i === 0).cls}`}
              style={softIn(250, i === 0).style}
            >
              {ART[i]}
            </div>
            <div
              className={`flex w-full max-w-xs flex-col items-center gap-3 pb-4 text-center ${softIn(550, i === 0).cls}`}
              style={softIn(550, i === 0).style}
            >
              <h2 className="font-display text-balance text-2xl font-bold text-white">{slide.title}</h2>
              <p className="font-label text-balance text-[14px] font-light leading-6 text-white/65">{slide.body}</p>
            </div>
          </section>
        ))}
      </div>

      <div className={`flex flex-col items-center gap-5 px-8 ${softIn(800).cls}`} style={softIn(800).style}>
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1} / ${slides.length}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/25'}`}
            />
          ))}
        </div>
        <div className="flex w-full max-w-xs gap-2">
          {/* Back as well as Next — swiping isn't the only way people page. */}
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="font-label w-[38%] shrink-0 rounded-full bg-white/10 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white transition active:scale-95 disabled:opacity-30"
          >
            {tr.tour.back}
          </button>
          <button
            type="button"
            onClick={() => (last ? close() : goTo(index + 1))}
            className="font-label flex-1 rounded-full bg-white py-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-900 transition active:scale-95"
          >
            {last ? tr.tour.start : tr.tour.next}
          </button>
        </div>
      </div>
    </div>
  )
}
