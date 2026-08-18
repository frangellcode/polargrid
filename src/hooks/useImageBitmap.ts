import { useCallback } from 'react'
import type { LoadedPhoto } from '../types'

let idCounter = 0
function nextId() {
  idCounter += 1
  return `photo-${Date.now()}-${idCounter}`
}

/** Decodes File objects into ImageBitmaps, respecting EXIF orientation. */
export function useImageBitmap() {
  const loadFiles = useCallback(async (files: FileList | File[]): Promise<LoadedPhoto[]> => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    const loaded = await Promise.all(
      list.map(async (file) => {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
        const photo: LoadedPhoto = {
          id: nextId(),
          bitmap,
          width: bitmap.width,
          height: bitmap.height,
          name: file.name,
        }
        return photo
      }),
    )
    return loaded
  }, [])

  return { loadFiles }
}
