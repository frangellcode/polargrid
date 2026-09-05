import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ExportQuality } from '../../types'
import { useTranslation } from '../../store/languageStore'
import { CLOSE_MS, ExportQualitySheet } from './ExportQualitySheet'
import { PHOTO_ACCEPT_ATTR } from '../../lib/photoInput'

interface ToolbarProps {
  title: string
  onBack: () => void
  onUpload: (files: FileList) => void
  onExport: (quality: ExportQuality) => void
  exportQuality: ExportQuality
  exporting?: boolean
  /** Overrides the default "Exporting…" label while `exporting` is true — e.g. a batch's "Exporting 3/10…". */
  exportingLabel?: string
  canExport?: boolean
  uploadLabel?: string
  multiple?: boolean
}

export interface ToolbarHandle {
  openFilePicker: () => void
}

export const Toolbar = forwardRef<ToolbarHandle, ToolbarProps>(function Toolbar(
  {
    title,
    onBack,
    onUpload,
    onExport,
    exportQuality,
    exporting,
    exportingLabel,
    canExport = true,
    uploadLabel,
    multiple = false,
  },
  ref,
) {
  const tr = useTranslation()
  const resolvedUploadLabel = uploadLabel ?? tr.toolbar.addPhoto
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Crossfades the upload label instead of letting it swap instantly, AND
  // animates the button's width to match. The two are staggered rather than
  // run together: while the old text is still fading out, the wrapper keeps
  // the OLD width, because starting the resize at the same instant made the
  // still-visible old text get visually clipped by its own shrinking box —
  // that's what read as "raro". Only once the old text is fully invisible
  // do we swap in the new text, resize to its measured width, and fade it
  // in — so nothing ever gets clipped mid-fade. A hidden mirror span (same
  // inherited font styles, absolutely positioned out of flow) measures the
  // incoming label's natural width ahead of that swap.
  const WIDTH_MS = 260
  const LABEL_FADE_MS = 130
  const [displayLabel, setDisplayLabel] = useState(resolvedUploadLabel)
  const [labelFading, setLabelFading] = useState(false)
  const [labelWidth, setLabelWidth] = useState<number | undefined>(undefined)
  const measureRef = useRef<HTMLSpanElement>(null)
  const measuredWidthRef = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    measuredWidthRef.current = measureRef.current?.offsetWidth
    // First mount: adopt the initial width immediately, no transition needed.
    setLabelWidth((current) => (current === undefined ? measuredWidthRef.current : current))
  }, [resolvedUploadLabel])

  useEffect(() => {
    if (resolvedUploadLabel === displayLabel) return
    setLabelFading(true)
    const fadeTimer = setTimeout(() => {
      setDisplayLabel(resolvedUploadLabel)
      setLabelWidth(measuredWidthRef.current)
      setLabelFading(false)
    }, LABEL_FADE_MS)
    return () => clearTimeout(fadeTimer)
  }, [resolvedUploadLabel, displayLabel])

  useImperativeHandle(ref, () => ({
    openFilePicker: () => inputRef.current?.click(),
  }))

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onUpload(e.target.files)
    e.target.value = ''
  }

  const handleConfirmExport = (quality: ExportQuality) => {
    setSheetOpen(false)
    // Let the sheet's own close transition actually play before the export
    // (a synchronous canvas render that blocks the main thread) kicks off.
    setTimeout(() => onExport(quality), CLOSE_MS)
  }

  return (
    <div className="flex items-end justify-between gap-3 border-b border-white/10 bg-ink-900 px-4 pb-1.5 pt-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))]">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 flex h-9 items-center gap-1.5 rounded-full pl-2 pr-3 text-white transition duration-200 hover:bg-white/10 active:scale-95 active:bg-white/15"
        aria-label={`${tr.toolbar.back}, ${title}`}
      >
        <span className="text-2xl leading-none">←</span>
        <span className="font-label text-sm font-semibold uppercase tracking-wide">{tr.toolbar.back}</span>
      </button>
      <div className="flex h-9 items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_ACCEPT_ATTR}
          multiple={multiple}
          className="hidden"
          onChange={handleChange}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-label relative inline-flex h-9 items-center rounded-full bg-white/10 px-3 text-xs font-semibold uppercase tracking-wide text-white transition duration-200 hover:bg-white/15 active:scale-95"
        >
          <span
            aria-hidden="true"
            ref={measureRef}
            className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
          >
            {resolvedUploadLabel}
          </span>
          <span
            className="inline-block overflow-hidden whitespace-nowrap"
            style={{ width: labelWidth, transition: `width ${WIDTH_MS}ms cubic-bezier(0.22,1,0.36,1)` }}
          >
            <span
              className="inline-block"
              style={{ opacity: labelFading ? 0 : 1, transition: `opacity ${LABEL_FADE_MS}ms ease` }}
            >
              {displayLabel}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={exporting || !canExport}
          className="font-label inline-flex h-9 items-center rounded-full bg-white px-4 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        >
          {exporting ? (exportingLabel ?? tr.toolbar.exporting) : tr.toolbar.export}
        </button>
      </div>

      <ExportQualitySheet
        open={sheetOpen}
        defaultQuality={exportQuality}
        onClose={() => setSheetOpen(false)}
        onExport={handleConfirmExport}
      />
    </div>
  )
})
