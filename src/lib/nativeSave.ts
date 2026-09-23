import { registerPlugin } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

const EXPORT_DIR = 'exports'

/** An export the native build already wrote to the app's cache — a finished
 *  full-resolution image never has to come back into the webview's memory,
 *  which is what lets a batch of fifteen hold nothing but paths. */
export interface NativeExport {
  name: string
  uri: string
}

/** What an export produces: a File on the web, a file on disk in the app. */
export type ExportedImage = File | NativeExport

interface ImageComposerPlugin {
  compose(options: { width: number; height: number; quality: number; bands: string[]; output: string }): Promise<{ uri: string }>
}

/** ios/App/App/ImageComposerPlugin.swift */
const ImageComposer = registerPlugin<ImageComposerPlugin>('ImageComposer')

/** Bytes per trip across the native bridge. A multiple of 3, so every chunk
 *  base64-encodes on its own with no padding in the middle of the file — the
 *  appended pieces then decode back to exactly the original bytes. Chunking at
 *  all is what keeps a full-resolution export (easily 20 MB+) from being
 *  turned into one giant base64 string in memory at once. */
const CHUNK_BYTES = 3 * 1024 * 1024

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Writes a blob into the app's cache and returns its file:// URI. */
async function writeToCache(blob: Blob, path: string): Promise<string> {
  const { uri } = await Filesystem.writeFile({
    path,
    data: await toBase64(blob.slice(0, CHUNK_BYTES)),
    directory: Directory.Cache,
    recursive: true,
  })
  for (let offset = CHUNK_BYTES; offset < blob.size; offset += CHUNK_BYTES) {
    await Filesystem.appendFile({
      path,
      data: await toBase64(blob.slice(offset, offset + CHUNK_BYTES)),
      directory: Directory.Cache,
    })
  }
  return uri
}

/** Clears out the previous export's files. Called when a NEW export starts
 *  rendering — not after sharing, because the share sheet (and whatever the
 *  person picks in it) may still be reading them after share() has resolved. */
export async function resetNativeExports(): Promise<void> {
  await Filesystem.rmdir({ path: EXPORT_DIR, directory: Directory.Cache, recursive: true }).catch(() => {})
}

/** Stores one rendered band of an export until composeBands() joins them. */
export function writeBand(band: Blob, filename: string, index: number): Promise<string> {
  return writeToCache(band, `${EXPORT_DIR}/.bands/${filename}-${index}.jpg`)
}

/** Joins the bands (top to bottom) into the finished JPEG, natively. The band
 *  files are deleted as they're consumed. */
export async function composeBands(width: number, height: number, bands: string[], filename: string, quality: number): Promise<NativeExport> {
  const { uri: output } = await Filesystem.getUri({ path: `${EXPORT_DIR}/${filename}`, directory: Directory.Cache })
  const { uri } = await ImageComposer.compose({ width, height, quality, bands, output })
  return { name: filename, uri }
}

/** The native build's version of the export's final step: the files go to the
 *  real iOS share sheet — "Save Image" / "Save N Images" lands them in Photos —
 *  with none of the web path's user-activation rules, since a native call
 *  never expires the way a browser tap does.
 *
 *  Never throws, like the web path it stands in for: a failure (a full disk,
 *  most likely) hands the rendered files back to the export card's button so
 *  the person can simply try again. */
export async function shareFilesNatively(images: ExportedImage[]): Promise<'saved' | 'dismissed' | 'needs-gesture'> {
  try {
    const uris: string[] = []
    for (const image of images) {
      uris.push(image instanceof File ? await writeToCache(image, `${EXPORT_DIR}/${image.name}`) : image.uri)
    }
    await Share.share({ files: uris })
    return 'saved'
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return 'dismissed'
    return 'needs-gesture'
  }
}
