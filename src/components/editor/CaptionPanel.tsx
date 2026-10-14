import { useTranslation } from '../../store/languageStore'
import { CAPTION_FONTS, CAPTION_MAX_LENGTH, CAPTION_SIZE_MAX, CAPTION_SIZE_MIN, type BorderCaption, type CaptionAlign, type CaptionFont } from '../../lib/caption'

interface CaptionPanelProps {
  caption: BorderCaption
  onChange: (caption: Partial<BorderCaption>) => void
}

const FONTS: CaptionFont[] = ['hand', 'type', 'clean']

const alignIcon = (align: CaptionAlign) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
    {align === 'left' && <path d="M4 7h16M4 12h10M4 17h13" />}
    {align === 'center' && <path d="M4 7h16M7 12h10M5.5 17h13" />}
    {align === 'right' && <path d="M4 7h16M10 12h10M7 17h13" />}
  </svg>
)

/** The caption tool: the text, its letter, size and alignment. */
export function CaptionPanel({ caption, onChange }: CaptionPanelProps) {
  const tr = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={caption.text}
          maxLength={CAPTION_MAX_LENGTH}
          placeholder={tr.caption.placeholder}
          aria-label={tr.caption.tool}
          onChange={(e) => onChange({ text: e.target.value })}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2.5 text-[16px] text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-white/40"
          style={{ fontFamily: `"${CAPTION_FONTS[caption.font].family}"`, fontWeight: CAPTION_FONTS[caption.font].weight }}
        />
        {caption.text && (
          <button
            type="button"
            onClick={() => onChange({ text: '' })}
            className="font-label shrink-0 rounded-full bg-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white/70 transition active:scale-95"
          >
            {tr.caption.clear}
          </button>
        )}
      </div>
      <p className="font-label -mt-1 text-center text-[11px] text-white/40">{tr.caption.hint}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {FONTS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={caption.font === f}
            onClick={() => onChange({ font: f })}
            className={`rounded-xl px-2 py-2 text-[15px] transition active:scale-95 ${caption.font === f ? 'bg-white text-ink-900' : 'bg-white/5 text-white/80'}`}
            style={{ fontFamily: `"${CAPTION_FONTS[f].family}"`, fontWeight: CAPTION_FONTS[f].weight }}
          >
            {tr.caption.fonts[f]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-label shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/50">{tr.caption.size}</span>
        <input
          type="range"
          min={CAPTION_SIZE_MIN}
          max={CAPTION_SIZE_MAX}
          step={0.001}
          value={caption.size}
          aria-label={tr.caption.size}
          onChange={(e) => onChange({ size: Number(e.target.value) })}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
        />
        <div className="flex shrink-0 rounded-full bg-white/10 p-0.5" role="group" aria-label={tr.caption.align}>
          {(['left', 'center', 'right'] as CaptionAlign[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={caption.align === a}
              onClick={() => onChange({ align: a })}
              className={`flex h-7 w-8 items-center justify-center rounded-full transition duration-200 active:scale-90 ${
                caption.align === a ? 'bg-white text-ink-900' : 'text-white/70'
              }`}
            >
              {alignIcon(a)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
