import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ExportQuality } from '../../types'
import { ExportQualitySheet } from './ExportQualitySheet'

interface ToolbarProps {
  title: string
  onBack: () => void
  onUpload: (files: FileList) => void
  onExport: (quality: ExportQuality) => void
  exportQuality: ExportQuality
  exporting?: boolean
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
    canExport = true,
    uploadLabel = 'Agregar foto',
    multiple = false,
  },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useImperativeHandle(ref, () => ({
    openFilePicker: () => inputRef.current?.click(),
  }))

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onUpload(e.target.files)
    e.target.value = ''
  }

  const handleConfirmExport = (quality: ExportQuality) => {
    setSheetOpen(false)
    onExport(quality)
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-ink-900 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 flex items-center gap-1.5 rounded-full py-2 pl-2 pr-3 text-white transition duration-200 hover:bg-white/10 active:scale-95 active:bg-white/15"
        aria-label={`Volver, ${title}`}
      >
        <span className="text-2xl leading-none">←</span>
        <span className="font-label text-sm font-semibold uppercase tracking-wide">Atrás</span>
      </button>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={handleChange}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-label rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition duration-200 hover:bg-white/15 active:scale-95"
        >
          {uploadLabel}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={exporting || !canExport}
          className="font-label rounded-full bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-900 transition duration-200 hover:bg-white/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
        >
          {exporting ? 'Exportando…' : 'Exportar'}
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
