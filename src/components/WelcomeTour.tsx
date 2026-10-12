import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from '../store/languageStore'
import { Logo } from './Logo'
import { markTourSeen } from '../lib/tour'

/** Sky top, sky bottom, far hills, near hills, sun — same drawn landscapes
 *  idea as the paywall's batch example, so no stock photo ships in the app. */
const SCENES: [string, string, string, string, string][] = [
  ['#f6a65a', '#fde3b0', '#b4636a', '#5b3550', '#fff4d6'],
  ['#7ec8e3', '#d6f0fa', '#4f8a6b', '#2f5d45', '#ffffff'],
  ['#2e1f47', '#8d4f8a', '#4b2c5e', '#24163a', '#ffd9a8'],
  ['#3d5a80', '#98c1d9', '#29486b', '#16304d', '#e0fbfc'],
  ['#e85d75', '#f9b384', '#8c3b5a', '#4a2140', '#ffe2b8'],
]

function Scene({ index, className = '' }: { index: number; className?: string }) {
  const id = useId()
  const [skyTop, skyBottom, far, near, sun] = SCENES[index % SCENES.length]
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={`block h-full w-full ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={skyTop} />
          <stop offset="1" stopColor={skyBottom} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}-sky)`} />
      <circle cx={30 + index * 9} cy={30} r={9} fill={sun} />
      <path d="M0 100 L0 64 L18 50 L34 62 L52 44 L70 58 L86 46 L100 56 L100 100 Z" fill={far} />
      <path d="M0 100 L0 80 L22 70 L44 82 L64 72 L82 80 L100 74 L100 100 Z" fill={near} />
    </svg>
  )
}

/** Logo on a soft halo. */
function WelcomeArt() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="absolute h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <Logo size={112} />
    </div>
  )
}

/** A photo whose white border breathes thicker and thinner, over the aspect chips. */
function BorderArt() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="tour-breathe aspect-[4/5] w-[58%] rounded-sm bg-white shadow-2xl shadow-black/40">
        <div className="h-full w-full overflow-hidden">
          <Scene index={0} />
        </div>
      </div>
      <div className="flex gap-1.5">
        {['4:5', '1:1', '9:16'].map((r, i) => (
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

/** A template collage: one tall photo and two stacked beside it. */
function CollageArt() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="grid aspect-[4/5] w-[62%] grid-cols-2 grid-rows-2 gap-[3%] rounded-sm bg-white p-[3%] shadow-2xl shadow-black/40">
        <div className="row-span-2 overflow-hidden">
          <Scene index={2} />
        </div>
        <div className="overflow-hidden">
          <Scene index={1} />
        </div>
        <div className="overflow-hidden">
          <Scene index={3} />
        </div>
      </div>
    </div>
  )
}

/** The same photo before and after an edit, the divider sweeping across. */
function EditArt() {
  const sliders = [0.62, 0.38, 0.74]
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="relative aspect-[4/5] w-[56%] overflow-hidden rounded-sm shadow-2xl shadow-black/40">
        <Scene index={4} className="brightness-[0.82] saturate-[0.7]" />
        <div className="tour-split absolute inset-0">
          <Scene index={4} className="brightness-110 contrast-110 saturate-150" />
        </div>
        <div className="tour-divider absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" />
      </div>
      <div className="flex w-[56%] flex-col gap-2">
        {sliders.map((v, i) => (
          <div key={i} className="relative h-1 rounded-full bg-white/15">
            <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ left: `${v * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** One photo in three film styles, fanned out like prints on a table. */
function RetroArt() {
  const looks = [
    { filter: 'sepia(0.55) saturate(1.2) contrast(0.9) brightness(1.05)', rotate: -9, x: '-34%' },
    { filter: 'grayscale(1) contrast(1.35)', rotate: 0, x: '0%' },
    { filter: 'saturate(0.6) hue-rotate(-12deg) contrast(0.85) brightness(1.1)', rotate: 9, x: '34%' },
  ]
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {looks.map((look, i) => (
        <div
          key={i}
          className="absolute aspect-[4/5] w-[42%] bg-white p-[3%] pb-[9%] shadow-2xl shadow-black/50"
          style={{ transform: `translateX(${look.x}) rotate(${look.rotate}deg)`, zIndex: i === 1 ? 2 : 1 }}
        >
          <div className="relative h-full w-full overflow-hidden">
            <div className="h-full w-full" style={{ filter: look.filter }}>
              <Scene index={0} />
            </div>
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle, transparent 55%, rgba(0,0,0,0.35))' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A finished photo over the three export qualities, the Pro one marked. */
function ExportArt() {
  const tr = useTranslation()
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <div className="aspect-square w-[52%] rounded-sm bg-white p-[6%] shadow-2xl shadow-black/40">
        <div className="h-full w-full overflow-hidden">
          <Scene index={3} />
        </div>
      </div>
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

const ART: ReactNode[] = [<WelcomeArt key="w" />, <BorderArt key="b" />, <CollageArt key="c" />, <EditArt key="e" />, <RetroArt key="r" />, <ExportArt key="x" />]

interface WelcomeTourProps {
  onClose: () => void
}

/**
 * First-launch walkthrough: a few swipeable cards showing what the app does,
 * each with a drawn example. Shown once per device (Home's "?" brings it
 * back). Native scroll snapping does the swiping, so it moves exactly like any
 * other horizontal swipe on the phone.
 */
export function WelcomeTour({ onClose }: WelcomeTourProps) {
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
      className={`fixed inset-0 z-40 flex flex-col bg-ink-900 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] ${leaving ? 'view-exit' : 'view-enter'}`}
      onAnimationEnd={(e) => e.target === e.currentTarget && leaving && onClose()}
    >
      <div className="flex justify-end px-4">
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
            <div className="flex min-h-0 w-full max-w-xs flex-1 items-center justify-center py-4">{ART[i]}</div>
            <div className="flex w-full max-w-xs flex-col items-center gap-3 pb-4 text-center">
              <h2 className="font-display text-balance text-2xl font-bold text-white">{slide.title}</h2>
              <p className="font-label text-balance text-[14px] font-light leading-6 text-white/65">{slide.body}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-col items-center gap-5 px-8">
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
        <button
          type="button"
          onClick={() => (last ? close() : goTo(index + 1))}
          className="font-label w-full max-w-xs rounded-full bg-white py-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-900 transition active:scale-95"
        >
          {last ? tr.tour.start : tr.tour.next}
        </button>
      </div>
    </div>
  )
}
