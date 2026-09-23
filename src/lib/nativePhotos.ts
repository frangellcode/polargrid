import { registerPlugin } from '@capacitor/core'
import type { NativePhotoRef } from './photoSource'

interface PickedPhoto {
  /** A URL the webview can fetch the ORIGINAL file from. */
  webPath: string
  name: string
  mimeType: string
  size: number
}

interface PhotoPickerPlugin {
  pick(options: { limit: number }): Promise<{ photos: PickedPhoto[]; failed: number }>
}

/** ios/App/App/PhotoPickerPlugin.swift */
const PhotoPicker = registerPlugin<PhotoPickerPlugin>('PhotoPicker')

/** Opens the iOS photo picker capped at `limit` photos — the picker itself
 *  stops the person at the limit, which an <input type="file"> can never do.
 *
 *  Nothing is read here: each photo comes back as a reference to its original
 *  on disk, read only when it's decoded (see photoSource.ts), so a pick of
 *  fifteen large photos costs no memory up front. Cancelling resolves to []. */
export async function pickPhotosNatively(limit: number): Promise<NativePhotoRef[]> {
  const { photos } = await PhotoPicker.pick({ limit: Math.max(1, limit) })
  return photos.map((photo) => ({ url: photo.webPath, name: photo.name, type: photo.mimeType, size: photo.size }))
}
