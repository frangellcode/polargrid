// Rasterizes the PolarGrid logo (kept in sync with src/components/Logo.tsx)
// into the PNG icons needed for the PWA manifest and iOS home screen.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')

const LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <defs>
    <radialGradient id="fur" cx="35%" cy="28%" r="75%">
      <stop offset="0%" stop-color="#f9fcff" /><stop offset="100%" stop-color="#c3d6e4" />
    </radialGradient>
    <radialGradient id="eye" cx="36%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#4a3a2a" /><stop offset="45%" stop-color="#221a12" /><stop offset="100%" stop-color="#0a0806" />
    </radialGradient>
    <linearGradient id="badge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#38bdf8" /><stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="cam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0ea5e9" /><stop offset="100%" stop-color="#0369a1" />
    </linearGradient>
    <filter id="blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" /></filter>
    <filter id="blur-sm" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.6" /></filter>
  </defs>

  <rect x="0" y="0" width="200" height="200" rx="46" fill="url(#badge)" />

  <g opacity="0.75" filter="url(#blur-sm)" stroke="#fff" stroke-width="2" stroke-linecap="round">
    <path d="M40,44 L40,54 M35,49 L45,49 M36.5,45.5 L43.5,52.5 M43.5,45.5 L36.5,52.5" />
    <path d="M164,40 L164,50 M159,45 L169,45" stroke-width="1.8" />
    <path d="M156,130 L156,138 M152,134 L160,134" stroke-width="1.6" />
  </g>

  <ellipse cx="100" cy="180" rx="46" ry="7" fill="#075985" opacity="0.22" filter="url(#blur)" />

  <circle cx="80" cy="167" r="13" fill="url(#fur)" />
  <circle cx="120" cy="167" r="13" fill="url(#fur)" />

  <circle cx="100" cy="140" r="34" fill="url(#fur)" />

  <circle cx="74" cy="50" r="13" fill="url(#fur)" />
  <circle cx="126" cy="50" r="13" fill="url(#fur)" />
  <circle cx="74" cy="53" r="6.5" fill="#a9c6da" opacity="0.85" />
  <circle cx="126" cy="53" r="6.5" fill="#a9c6da" opacity="0.85" />

  <circle cx="100" cy="82" r="36" fill="url(#fur)" />

  <circle cx="86" cy="78" r="7" fill="url(#eye)" />
  <circle cx="114" cy="78" r="7" fill="url(#eye)" />
  <circle cx="88" cy="75.5" r="2" fill="#fff" opacity="0.9" />
  <circle cx="116" cy="75.5" r="2" fill="#fff" opacity="0.9" />

  <ellipse cx="100" cy="91" rx="5" ry="3.6" fill="#1c1712" />
  <path d="M92,99 Q100,104 108,99" stroke="#1c1712" stroke-width="2" stroke-linecap="round" fill="none" />

  <rect x="82" y="122" width="36" height="26" rx="9" fill="url(#cam)" stroke="#fff" stroke-width="2.5" />
  <circle cx="100" cy="135" r="8" fill="#fff" />
  <circle cx="100" cy="135" r="4.6" fill="#075985" />

  <circle cx="72" cy="137" r="14" fill="url(#fur)" />
  <circle cx="128" cy="137" r="14" fill="url(#fur)" />
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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
