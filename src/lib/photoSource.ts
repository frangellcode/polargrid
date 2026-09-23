/** A photo the App Store build picked natively: the original stays on disk
 *  in the app's cache and is read only at the moment it's decoded. Holding
 *  the files themselves (as the web build does) would keep every one of them
 *  in memory for the whole session — fifteen 50 MB photos is 750 MB before a
 *  single pixel is decoded. */
export interface NativePhotoRef {
  /** A URL the webview can fetch the original from. */
  url: string
  name: string
  type: string
  size: number
}

/** Where a photo's original bytes live: a File from the browser's own picker
 *  or drag and drop, or a file on disk in the native build. Both carry the
 *  name, type and size the screening in photoInput.ts looks at. */
export type PhotoSource = File | NativePhotoRef

/** The original bytes, for decoding. A native photo is fetched fresh each
 *  time and let go right after, so only the one being decoded is in memory. */
export async function readPhoto(source: PhotoSource): Promise<Blob> {
  if (source instanceof Blob) return source
  const response = await fetch(source.url)
  if (!response.ok) throw new Error(`Could not read ${source.name}`)
  return response.blob()
}
