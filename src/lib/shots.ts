/**
 * Store-screenshot mode. Only compiled in with VITE_SHOTS=1 (see main.tsx) —
 * never part of a release build.
 *
 * Each launch sets up ONE scene, picked by `shots:scene` in localStorage, and
 * then advances that index, so relaunching the app in the simulator steps
 * through the whole set with a screenshot taken in between. Photos come from
 * public/shots/, which is copied into the native bundle only for this.
 */
import { useEditorStore } from '../store/editorStore'
import { useProStore } from '../store/proStore'

const SCENES = ['home', 'border', 'batch', 'edit', 'retro', 'story', 'layouts'] as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The LAST button with this text: the bottom bar's tools come after any
 *  same-named control higher up (Collage's Template/Free toggle). */
function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text).at(-1) as HTMLButtonElement | undefined
}

/** Home's buttons carry their description too, so match the title's start. */
function homeButton(title: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(title)) as HTMLButtonElement | undefined
}

function byLabel(label: string): HTMLElement | null {
  return document.querySelector(`[aria-label="${label}"]`)
}

async function waitFor<T>(get: () => T | null | undefined, ms = 8000): Promise<T> {
  const start = performance.now()
  for (;;) {
    const v = get()
    if (v) return v
    if (performance.now() - start > ms) throw new Error('shots: timed out')
    await sleep(100)
  }
}

async function files(names: string[]): Promise<File[]> {
  return Promise.all(
    names.map(async (n) => {
      const blob = await (await fetch(`shots/${n}.jpg`)).blob()
      return new File([blob], `${n}.jpg`, { type: 'image/jpeg' })
    }),
  )
}

async function upload(names: string[], multiple: boolean) {
  const input = await waitFor(() =>
    [...document.querySelectorAll<HTMLInputElement>('input[type=file]')].find((i) => i.multiple === multiple),
  )
  const dt = new DataTransfer()
  for (const f of await files(names)) dt.items.add(f)
  input.files = dt.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await sleep(2500)
}

function setRange(label: string, value: number) {
  const input = byLabel(label) as HTMLInputElement
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function tool(text: string) {
  ;(await waitFor(() => button(text))).click()
  await sleep(700)
}

async function run(scene: (typeof SCENES)[number]) {
  const editor = useEditorStore.getState
  if (scene === 'home') return

  if (scene === 'layouts') {
    (await waitFor(() => homeButton('Collage'))).click()
    await sleep(900)
    await upload(['decorA0', 'bay', 'decorA1', 'resort', 'decorA3', 'sandbar'], true)
    await tool('Template')
    return
  }

  (await waitFor(() => homeButton('White border'))).click()
  await sleep(900)

  if (scene === 'batch') {
    await upload(['resort', 'island', 'cliff', 'bay'], true)
    await tool('4:5')
    return
  }

  await upload([{ border: 'resort', edit: 'island', retro: 'cliff', story: 'island' }[scene] ?? 'resort'], false)
  // The tall resort photo reads best framed 4:5 rather than as-shot.
  if (scene === 'border') await tool('4:5')

  if (scene === 'edit') {
    const id = editor().border.photoId!
    editor().setBorderAdjustments(id, {
      ...editor().border.adjustments[id],
      exposure: 0.1,
      contrast: 0.25,
      shadows: 0.32,
      highlights: -0.2,
      vibrance: 0.38,
      temperature: 0.12,
      sharpness: 0.3,
      grain: 0,
      tint: 0,
      whites: 0,
      blacks: 0,
      saturation: 0,
      retro: null,
      retroAmount: 1,
    })
    await tool('Edit')
    byLabel('Shadows')?.click()
    return
  }

  if (scene === 'retro') {
    await tool('Retro')
    await tool('Sunset')
    setRange('Intensity', 0.9)
    return
  }

  if (scene === 'story') {
    editor().setWorkspaceBackground('sky')
    editor().setBorderExportWithBackground(true)
    await tool('Workspace')
  }
}

export async function startShots() {
  // The store screenshots are in English; the language is read once at
  // startup, so switching it costs one reload before the first scene.
  if (localStorage.getItem('polargrid:language') !== 'en' || !localStorage.getItem('polargrid:tourSeen')) {
    localStorage.setItem('polargrid:tourSeen', '1')
    localStorage.setItem('polargrid:language', 'en')
    location.reload()
    return
  }
  const index = Number(localStorage.getItem('shots:scene') ?? '0') % SCENES.length
  localStorage.setItem('shots:scene', String(index + 1))
  // After the boot flight, and after StoreKit's own answer (which would
  // otherwise put the locks back).
  await sleep(2200)
  useProStore.setState({ isPro: true })
  try {
    await run(SCENES[index])
  } catch (e) {
    console.error(e)
  }
}
