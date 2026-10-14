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
import { translations } from './translations'
import type { Language } from './translations'

/** VITE_SHOTS_LANG=es makes the Spanish set; English otherwise. */
const LANG: Language = import.meta.env.VITE_SHOTS_LANG === 'es' ? 'es' : 'en'
const tr = translations[LANG]

const SCENES = ['home', 'border', 'batch', 'edit', 'retro', 'story', 'layouts', 'carousel', 'carouselFree', 'paywall', 'tour', 'editPlain', 'retouch', 'caption', 'quality', 'audit'] as const

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

/** A bottom-bar tool by its label (its button may carry a badge too). */
function barTool(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim().endsWith(label)).at(-1) as HTMLButtonElement | undefined
}

/** Layout check: walks one part of the app (VITE_SHOTS_FEATURE), holding
 *  each screen AUDIT_STEP_MS for a screenshot taken from outside. */
const AUDIT_STEP_MS = 6000
async function audit(part: string) {
  const editor = useEditorStore.getState
  const hold = () => sleep(AUDIT_STEP_MS)
  const tap = async (label: string) => {
    barTool(label)?.click()
    await hold()
  }
  const open = async (title: string, photos: string[], multiple: boolean) => {
    ;(await waitFor(() => homeButton(title))).click()
    await sleep(900)
    await upload(photos, multiple)
  }
  if (part === 'tour') {
    ;(await waitFor(() => byLabel(tr.tour.help))).click()
    await sleep(900)
    const track = await waitFor(() => document.querySelector<HTMLElement>('[role=dialog] .snap-x'))
    for (let i = 0; i < tr.tour.slides.length; i++) {
      track.scrollTo({ left: i * track.clientWidth })
      await hold()
    }
    return
  }
  if (part === 'border') {
    await open(tr.home.borderTitle, ['resort'], false)
    editor().setBorderCaption({ text: tr.caption.sample })
    for (const t of [tr.borderEditor.toolAspect, tr.borderEditor.toolRotate, tr.tools.workspace, tr.borderEditor.toolBorder, tr.caption.tool, tr.tools.edit, tr.tools.retro]) await tap(t)
    await tap(tr.toolbar.export)
    return
  }
  if (part === 'edit') {
    await open(tr.home.editTitle, ['hotel'], false)
    await hold()
    for (const k of ['colorMix', 'curves', 'vignette', 'grain'] as const) {
      byLabel(tr.edit[k])?.click()
      await hold()
    }
    for (const t of [tr.borderEditor.toolAspect, tr.borderEditor.toolRotate, tr.tools.workspace, tr.tools.retro]) await tap(t)
    byLabel(tr.tools.retouch)?.click()
    await hold()
    return
  }
  if (part === 'carousel' || part === 'collage') {
    const carousel = part === 'carousel'
    await open(carousel ? tr.home.carouselTitle : tr.home.collageTitle, ['pano', 'boat', 'sandbar', 'bay'], true)
    const first = carousel ? tr.carousel.toolPosts : tr.collageEditor.toolAspect
    for (const t of [first, tr.collageEditor.toolTemplate, tr.tools.workspace, tr.collageEditor.toolBorder, tr.tools.edit, tr.tools.retro]) await tap(t)
    button(tr.collageEditor.modeFree)?.click()
    await hold()
    for (const t of [first, ...(carousel ? [tr.carousel.toolFrame] : []), tr.tools.workspace, tr.collageEditor.toolBackground, tr.tools.edit]) await tap(t)
    return
  }
  if (part === 'free') {
    useProStore.setState({ isPro: false })
    await open(tr.home.borderTitle, ['resort'], false)
    for (const t of [tr.tools.workspace, tr.borderEditor.toolBorder, tr.tools.edit]) await tap(t)
    await tap(tr.toolbar.export)
    useProStore.getState().openPaywall('quality')
    await hold()
    document.querySelector('[role=dialog] .overflow-y-auto, [role=dialog]')?.scrollTo({ top: 99999 })
    await hold()
  }
}

async function run(scene: (typeof SCENES)[number]) {
  const editor = useEditorStore.getState
  if (scene === 'audit') return audit(import.meta.env.VITE_SHOTS_FEATURE ?? 'border')
  if (scene === 'home') return

  if (scene === 'paywall') {
    // The paywall straight from Home, before any photo: its own sample.
    useProStore.setState({ isPro: false })
    useProStore.getState().openPaywall(import.meta.env.VITE_SHOTS_FEATURE ?? 'quality')
    return
  }

  if (scene === 'tour') {
    // The welcome tour, on the card VITE_SHOTS_FEATURE names by number.
    ;(await waitFor(() => byLabel(tr.tour.help))).click()
    await sleep(900)
    const track = await waitFor(() => document.querySelector<HTMLElement>('[role=dialog] .snap-x'))
    track.scrollTo({ left: Number(import.meta.env.VITE_SHOTS_FEATURE ?? 0) * track.clientWidth })
    return
  }

  if (scene === 'carousel' || scene === 'carouselFree') {
    (await waitFor(() => homeButton(tr.home.carouselTitle))).click()
    await sleep(900)
    if (scene === 'carouselFree') editor().setCollageLayoutMode('free')
    // pano: a wide band of the resort, for the panorama across the posts.
    await upload(scene === 'carousel' ? ['pano', 'boat', 'sandbar'] : ['bay', 'boat', 'sandbar', 'resort'], true)
    if (scene === 'carousel') {
      editor().setWorkspaceBackground('onyx')
      await tool(tr.collageEditor.toolTemplate)
    } else {
      const ids = editor().collage.freeItems.map((f) => f.photoId)
      editor().setCollageBackdrop({ photoId: ids[0], blur: true })
      await tool(tr.carousel.toolFrame)
    }
    return
  }

  if (scene === 'editPlain' || scene === 'retouch') {
    (await waitFor(() => homeButton(tr.home.editTitle))).click()
    await sleep(900)
    await upload([scene === 'editPlain' ? 'hotel' : 'boats'], false)
    const id = editor().border.photoId!
    if (scene === 'editPlain') {
      // A warm, punchy grade with a gentle S curve, Curves open.
      editor().setBorderAdjustments(id, {
        ...editor().border.adjustments[id],
        contrast: 0.15,
        shadows: 0.25,
        vibrance: 0.3,
        temperature: 0.1,
        toneCurves: {
          rgb: [[0, 0], [0.25, 0.2], [0.75, 0.82], [1, 1]],
          r: [[0, 0], [1, 1]],
          g: [[0, 0], [1, 1]],
          b: [[0, 0], [1, 1]],
        },
      })
      byLabel(tr.edit.curves)?.click()
      return
    }
    // The healing brush mid-stroke, painting over one boat.
    byLabel(tr.tools.retouch)?.click()
    await sleep(2500)
    const canvas = await waitFor(() => document.querySelector<HTMLCanvasElement>('.touch-none canvas'))
    const viewport = canvas.closest('.touch-none')!
    const r = canvas.getBoundingClientRect()
    const at = (fx: number, fy: number) => ({ clientX: r.left + fx * r.width, clientY: r.top + fy * r.height })
    const fire = (type: string, fx: number, fy: number) =>
      viewport.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, ...at(fx, fy) }))
    const path: [number, number][] = [
      [0.47, 0.455], [0.56, 0.45], [0.575, 0.47], [0.465, 0.475], [0.46, 0.49], [0.57, 0.49], [0.56, 0.505], [0.47, 0.5],
    ]
    fire('pointerdown', ...path[0])
    for (const [x, y] of path.slice(1)) {
      await sleep(40)
      fire('pointermove', x, y)
    }
    return
  }

  if (scene === 'layouts') {
    (await waitFor(() => homeButton(tr.home.collageTitle))).click()
    await sleep(900)
    // The event collage from the welcome tour: the big ceiling shot, the
    // cake, the tent, the table and the buffet, laid out tall.
    await upload(['wedding1', 'wedding2', 'wedding3', 'wedding6', 'wedding9', 'wedding4', 'wedding5', 'wedding7', 'wedding8'], true)
    editor().setCollageTemplateId('grid-9-big')
    editor().setCollageAspectRatio('9-16')
    editor().setCollageOrientation('vertical')
    await tool(tr.collageEditor.toolTemplate)
    return
  }

  (await waitFor(() => homeButton(tr.home.borderTitle))).click()
  await sleep(900)

  if (scene === 'batch') {
    await upload(['resort', 'boat', 'sandbar', 'island'], true)
    await tool('4:5')
    return
  }

  await upload([{ border: 'resort', edit: 'boat', retro: 'bay', story: 'story', caption: 'resort', quality: 'pano' }[scene] ?? 'resort'], false)
  // The tall photos read best framed 4:5 rather than as-shot.
  if (scene === 'border' || scene === 'retro' || scene === 'caption' || scene === 'quality') await tool('4:5')

  if (scene === 'caption') {
    editor().setBorderCaption({ text: tr.caption.sample, font: 'hand', size: 0.06 })
    await tool(tr.caption.tool)
    return
  }

  if (scene === 'quality') {
    await tool(tr.toolbar.export)
    await sleep(600)
    button(tr.quality.native.label)?.click()
    return
  }
  // Square on a phone, so the blurred photo behind it shows above and below;
  // 4:5 on the iPad's wider canvas, so it shows either side.
  if (scene === 'story') await tool(window.innerWidth > 700 ? '4:5' : '1:1')

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
    await tool(tr.tools.edit)
    byLabel(tr.edit.shadows)?.click()
    return
  }

  if (scene === 'retro') {
    await tool(tr.tools.retro)
    await tool(tr.retro.names.plata)
    button(tr.retro.names.plata)?.scrollIntoView({ inline: 'center' })
    setRange(tr.retro.intensity, 0.9)
    return
  }

  if (scene === 'story') {
    // The photo itself, blurred, behind it — the Pro backdrop.
    editor().setWorkspaceBackground('blur')
    editor().setBorderExportWithBackground(true)
    await tool(tr.tools.workspace)
  }
}

export async function startShots() {
  // The language is read once at startup, so switching it costs one reload
  // before the first scene.
  if (localStorage.getItem('polargrid:language') !== LANG || !localStorage.getItem('polargrid:tourSeen')) {
    localStorage.setItem('polargrid:tourSeen', '1')
    localStorage.setItem('polargrid:language', LANG)
    location.reload()
    return
  }
  // VITE_SHOTS_SCENE=<name> pins one scene, for checking a single screen.
  const pinned = SCENES.indexOf(import.meta.env.VITE_SHOTS_SCENE)
  const index = pinned >= 0 ? pinned : Number(localStorage.getItem('shots:scene') ?? '0') % SCENES.length
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
