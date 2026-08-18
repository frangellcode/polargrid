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
    <div className="flex items-center justify-between gap-3 border-b border-polar-100 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full p-2 text-slate-500 hover:bg-polar-50"
          aria-label="Volver"
        >
          ←
        </button>
        <h1 className="text-base font-semibold text-slate-800">{title}</h1>
      </div>
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
          className="rounded-full bg-polar-50 px-3 py-1.5 text-sm font-medium text-polar-700 hover:bg-polar-100"
        >
          {uploadLabel}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={exporting || !canExport}
          className="rounded-full bg-polar-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-polar-600 disabled:cursor-not-allowed disabled:opacity-40"
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
