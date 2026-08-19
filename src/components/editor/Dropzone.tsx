import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react'

interface DropzoneProps {
  label: string
  hint?: string
  onFiles: (files: FileList) => void
  multiple?: boolean
}

/** Full-area tap target that opens the photo picker, and accepts drag & drop on desktop. */
export function Dropzone({ label, hint, onFiles, multiple = true }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const openPicker = () => inputRef.current?.click()

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openPicker()
    }
  }

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
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`group flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed text-center transition-colors duration-200 ${
        isDragOver ? 'border-white bg-white/10' : 'border-white/20 bg-white/5 active:bg-white/10'
      }`}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handleChange} />
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-ink-900 shadow-sm transition duration-200 group-active:scale-90">
        <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </div>
      <div className="px-6">
        <p className="font-label text-base font-semibold text-white">{label}</p>
        {hint && <p className="font-label mt-1 text-xs text-white/40">{hint}</p>}
      </div>
    </div>
  )
}
