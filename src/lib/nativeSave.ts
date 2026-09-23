import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

const EXPORT_DIR = 'exports'

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

async function writeToCache(file: File): Promise<string> {
  const path = `${EXPORT_DIR}/${file.name}`
  const { uri } = await Filesystem.writeFile({
    path,
    data: await toBase64(file.slice(0, CHUNK_BYTES)),
    directory: Directory.Cache,
    recursive: true,
  })
  for (let offset = CHUNK_BYTES; offset < file.size; offset += CHUNK_BYTES) {
    await Filesystem.appendFile({
      path,
      data: await toBase64(file.slice(offset, offset + CHUNK_BYTES)),
      directory: Directory.Cache,
    })
  }
  return uri
}

/** The native build's version of the export's final step: the files go to the
 *  real iOS share sheet — "Save Image" / "Save N Images" lands them in Photos —
 *  with none of the web path's user-activation rules, since a native call
 *  never expires the way a browser tap does.
 *
 *  The copies in the app's cache are cleared at the start of the NEXT export,
 *  not after this one: the share sheet (and whatever the person picks in it)
 *  may still be reading them after share() has resolved.
 *
 *  Never throws, like the web path it stands in for: a failure (a full disk,
 *  most likely) hands the rendered files back to the export card's button so
 *  the person can simply try again. */
export async function shareFilesNatively(files: File[]): Promise<'saved' | 'dismissed' | 'needs-gesture'> {
  try {
    await Filesystem.rmdir({ path: EXPORT_DIR, directory: Directory.Cache, recursive: true }).catch(() => {})
    const uris: string[] = []
    for (const file of files) uris.push(await writeToCache(file))
    await Share.share({ files: uris })
    return 'saved'
  } catch (err) {
    if (err instanceof Error && /cancel/i.test(err.message)) return 'dismissed'
    return 'needs-gesture'
  }
}
