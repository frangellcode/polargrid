// Rasterizes the PolarGrid logo (kept in sync with src/components/Logo.tsx)
// into the PNG icons needed for the PWA manifest and iOS home screen, plus the
// App Store icon and launch image for the native iOS app in ios/.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
const iosAssetsDir = join(__dirname, '..', 'ios', 'App', 'App', 'Assets.xcassets')
const INK = '#141e30'

const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect x="0" y="0" width="200" height="200" rx="46" fill="#141e30" />
  <rect x="58" y="41" width="42" height="14" rx="4" fill="#4E5058" />
  <rect x="34" y="50" width="132" height="66" rx="12" fill="#D8D9DC" />
  <path d="M46 50h-0a12 12 0 0 0-12 12v54h10V62a12 12 0 0 1 12-12z" fill="#C4C5C9" />
  <rect x="34" y="98" width="132" height="4" fill="#FFE88A" />
  <rect x="34" y="102" width="132" height="4" fill="#FD5E95" />
  <rect x="34" y="106" width="132" height="4" fill="#45CAE0" />
  <circle cx="100" cy="75" r="22" fill="#909296" />
  <circle cx="100" cy="75" r="17" fill="#64666D" />
  <circle cx="100" cy="75" r="10.5" fill="#3F4149" />
  <circle cx="105.5" cy="69.5" r="4" fill="#BDBDC0" />
  <circle cx="56" cy="66" r="7.5" fill="#D14D7B" />
  <circle cx="56" cy="66" r="4.8" fill="#FD5E95" />
  <rect x="48" y="80" width="18" height="3.5" rx="1.75" fill="#9A9CA2" />
  <rect x="48" y="87" width="18" height="3.5" rx="1.75" fill="#9A9CA2" />
  <rect x="133" y="59" width="22" height="17" rx="3.5" fill="#7A7C82" />
  <rect x="136.5" y="62.5" width="15" height="10" rx="1.5" fill="#E9E9EA" />
  <path d="M141 72.5l7-10h3.5l-7 10z" fill="#BDBDC0" />
  <rect x="30" y="110" width="140" height="34" rx="10" fill="#4E5058" />
  <path d="M30 134v0a10 10 0 0 0 10 10h120a10 10 0 0 0 10-10v0z" fill="#383A43" />
  <rect x="60" y="123" width="80" height="7" rx="3.5" fill="#2A2C33" />
  <rect x="67" y="127" width="66" height="42" rx="3" fill="#F2F2F3" />
  <rect x="67" y="127" width="66" height="4" fill="#D8D9DC" />
  <rect x="73" y="133" width="26" height="13" rx="1.5" fill="#45CAE0" />
  <rect x="101" y="133" width="26" height="13" rx="1.5" fill="#FFE88A" />
  <rect x="73" y="148" width="26" height="13" rx="1.5" fill="#FD5E95" />
  <rect x="101" y="148" width="26" height="13" rx="1.5" fill="#8FD9B6" />
</svg>
`.trim()

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

async function main() {
  await mkdir(outDir, { recursive: true })
  const svgBuffer = Buffer.from(LOGO_SVG)
  for (const { file, size } of targets) {
    const png = await sharp(svgBuffer, { density: 384 }).resize(size, size).png().toBuffer()
    await writeFile(join(outDir, file), png)
    console.log(`generated ${file} (${size}x${size})`)
  }
}

/** The App Store rejects an icon with transparency, and iOS applies its own
 *  corner mask — so the native icon is the same logo on a square, fully
 *  opaque tile rather than the PWA's pre-rounded one. */
async function generateIosAssets() {
  const squareSvg = Buffer.from(LOGO_SVG.replace('rx="46" ', ''))
  const icon = await sharp(squareSvg, { density: 1536 })
    .resize(1024, 1024)
    .flatten({ background: INK })
    .removeAlpha()
    .png()
    .toBuffer()
  await writeFile(join(iosAssetsDir, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), icon)
  console.log('generated ios AppIcon (1024x1024, opaque)')

  // Plain ink, no logo: index.html's boot splash draws the logo itself the
  // moment the webview paints, so the native launch screen only has to
  // match its background for the handoff to be invisible.
  const splash = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: INK } }).png().toBuffer()
  for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await writeFile(join(iosAssetsDir, 'Splash.imageset', file), splash)
  }
  console.log('generated ios launch images (2732x2732, ink)')
}

main()
  .then(generateIosAssets)
  .catch((err) => {
  console.error(err)
  process.exit(1)
})
