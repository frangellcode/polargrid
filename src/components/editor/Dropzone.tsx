import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

interface DropzoneProps {
  label: string
  hint?: string
  /** Transient validation message (e.g. "need at least N photos"), shown in place of the hint. */
  error?: string | null
  onFiles: (files: FileList) => void
  multiple?: boolean
}

/** Accepts drag & drop across the whole box on desktop, but the actual tap
 *  target on touch is just the round upload button in the middle — making
 *  the entire (large, rounded, dashed-border) box itself pressable produced
 *  a momentary black flash right under the finger on tap, a WebKit
 *  compositing glitch on large `:active`-driven layers (the same family of
 *  bug App.tsx's screen-transition fix already worked around elsewhere). A
 *  small button doesn't trigger it. */
export function Dropzone({ label, hint, error, onFiles, multiple = true }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const openPicker = () => inputRef.current?.click()

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`fade-in-slow flex h-full w-full flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed text-center transition-colors duration-200 ${
        isDragOver ? 'border-white bg-white/10' : 'border-white/20 bg-white/5'
      }`}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleChange} />
      <button
        type="button"
        onClick={openPicker}
        aria-label={label}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-ink-900 shadow-sm transition duration-200 active:scale-90"
      >
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </button>
      <div className="px-6">
        <p className="font-label text-base font-semibold text-white">{label}</p>
        {error ? (
          <p className="font-label mt-1 text-xs text-red-300">{error}</p>
        ) : (
          hint && <p className="font-label mt-1 text-xs text-white/40">{hint}</p>
        )}
      </div>
    </div>
  )
}
