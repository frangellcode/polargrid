import { registerPlugin } from '@capacitor/core'

interface PickedPhoto {
  /** A URL the webview can fetch the ORIGINAL file from. */
  webPath: string
  name: string
  mimeType: string
}

interface PhotoPickerPlugin {
  pick(options: { limit: number }): Promise<{ photos: PickedPhoto[]; failed: number }>
}

/** ios/App/App/PhotoPickerPlugin.swift */
const PhotoPicker = registerPlugin<PhotoPickerPlugin>('PhotoPicker')

/** Opens the iOS photo picker capped at `limit` photos — the picker itself
 *  stops the person at the limit, which an <input type="file"> can never do —
 *  and returns the picked originals as Files, so everything downstream (the
 *  format/size screening, the decoder) is exactly the web path's.
 *
 *  Read one at a time rather than all at once, so a pick of fifteen doesn't
 *  have fifteen reads in flight together. Cancelling resolves to []. */
export async function pickPhotosNatively(limit: number): Promise<File[]> {
  const { photos } = await PhotoPicker.pick({ limit: Math.max(1, limit) })
  const files: File[] = []
  for (const photo of photos) {
    const blob = await (await fetch(photo.webPath)).blob()
    files.push(new File([blob], photo.name, { type: photo.mimeType || blob.type }))
  }
  return files
}
