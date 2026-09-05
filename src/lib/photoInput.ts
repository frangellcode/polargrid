/** What the app will take in, and how big. Everything the editors accept goes
 *  through screenPhotoFiles() below — the `accept` attribute on a file input is
 *  a hint to the picker, not a guarantee, and drag & drop ignores it entirely. */

/** Only formats the browser can actually decode into a canvas. Notably absent:
 *  RAW (DNG/CR2/ARW/NEF, Apple ProRAW included). No browser can decode those —
 *  createImageBitmap() throws on them — and supporting them would mean shipping
 *  a decoder in the bundle, for files that are also the heaviest to handle. */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif']

/** Some pickers (and the Files app on iOS) hand over a HEIC with an empty or
 *  generic `type`, so the extension is the fallback when the MIME says nothing. */
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif']

/** For an <input type="file">'s accept attribute. */
export const PHOTO_ACCEPT_ATTR = [...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(',')

/**
 * Per-photo size ceiling.
 *
 * The export canvas is already bounded (see MAX_SAFE_LONG_EDGE), but DECODING
 * isn't: createImageBitmap holds width × height × 4 bytes at once, so a single
 * absurdly large photo can blow past iOS's per-tab memory budget before the app
 * ever gets to render anything. 25 MB clears any real photo comfortably — a
 * 48 MP iPhone HEIC is ~3-5 MB and its JPEG equivalent ~15-25 MB — while
 * stopping the pathological ones.
 */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const MAX_PHOTO_MB = 25

export interface ScreenedPhotos {
  accepted: File[]
  /** Files dropped for being an unsupported format. */
  rejectedType: number
  /** Files dropped for being over MAX_PHOTO_BYTES. */
  rejectedSize: number
}

function isAcceptedType(file: File) {
  if (ACCEPTED_TYPES.includes(file.type.toLowerCase())) return true
  // Only trust the extension when the MIME is missing or generic — a file that
  // positively claims image/gif shouldn't sneak through on a renamed .jpg.
  if (file.type && file.type !== 'application/octet-stream') return false
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/** Splits a selection into what the app will take and a count of why the rest
 *  was dropped, so the caller can say something instead of silently ignoring
 *  files (which reads as the app having lost them). */
export function screenPhotoFiles(files: FileList | File[]): ScreenedPhotos {
  const result: ScreenedPhotos = { accepted: [], rejectedType: 0, rejectedSize: 0 }
  for (const file of Array.from(files)) {
    if (!isAcceptedType(file)) result.rejectedType++
    else if (file.size > MAX_PHOTO_BYTES) result.rejectedSize++
    else result.accepted.push(file)
  }
  return result
}
