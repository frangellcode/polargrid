# PolarGrid

**White borders and collages for your photos, in full quality, 100% in your browser.** Nothing gets uploaded to any server, it works with no internet connection, and it installs as an app on Android and iPhone. Free, no account, no watermark.

**→ [Open PolarGrid](https://frangellcode.github.io/polargrid/)**

## What it is

PolarGrid is a small web app (a PWA) for two things photographers keep needing and keep paying for:

1. Framing a photo in a clean border, the way a print or a Polaroid looks.
2. Laying several photos out into a single image.

It is built phone-first. Add it to your home screen and it opens like any other app — no browser chrome, no loading screen, and it keeps working on a plane or with no signal, because every photo is processed on your own device.

## What it does

### White border

- Frame a photo with an adjustable border.
- Seven border colours: White, Onyx, Graphite, Forest, Wine, Night, Sand.
- Aspect ratios: Original, 1:1, 4:5, 5:6, 3:4, 9:16, each with a vertical/horizontal toggle.
- **Locked** crops the photo to fill the frame; **Unlocked** shows the whole photo uncropped and fits the border around it.
- Drag to reposition, pinch to zoom.
- Adjustable film grain.
- **Batch mode**: load up to 5 photos, set the adjustment once, and it is applied to all of them on export.

### Collage

- Combine 2 to 9 photos into a single image.
- **Template mode**: preset grids, including creative ones with cells of different sizes, in vertical or horizontal layouts.
- **Free mode**: place, drag, pinch to resize and rotate each photo anywhere on the canvas; a photo close to straight snaps square on its own.
- Hold a photo in a grid cell to pick it up and swap it with another.
- Tap an empty cell to fill it; tap a photo to replace or remove it.
- Independent control of the outer border and the spacing between photos, or link the two.
- Rectangular or rounded cells.
- Adjustable film grain.

### In both

- Customisable workspace background (Onyx, Pearl, Beige, Mist, Terracotta, White, or none), remembered between sessions.
- Three export qualities — Maximum (native resolution), High (2048 px), Web (1080 px) — to trade sharpness against file size.
- Exporting opens the system share sheet, so the image saves straight to your camera roll.
- English and Spanish, switchable from the home screen.

## Your photos stay yours

There is no backend. No sign-up, no account, no analytics on your images. Every decode, crop, render and export happens in your browser using `<canvas>`, and no photo ever leaves your device — which is also why it works offline.

## Free, and how to support it

PolarGrid is free and always will be. No subscription, no paywalled export, no watermark on your photos.

If it is useful to you and you would like to help keep it running, you can chip in — entirely optional, and nothing in the app is locked behind it:

**[☕ Donate via PayPal](https://paypal.me/frangellgram)**

Sharing it with someone who would use it helps just as much.

## Supported files

JPEG, PNG and HEIC/HEIF, up to 25 MB per photo. RAW files (DNG, CR2, ARW, NEF, Apple ProRAW) are not supported — no browser can decode them.

## Install it as an app

- **iPhone / iPad**: open the link in Safari → Share → *Add to Home Screen*.
- **Android**: open the link in Chrome → menu → *Install app*.
- **Desktop**: Chrome or Edge show an install icon in the address bar.

## Running it locally

```bash
npm install
npm run dev       # dev server
npm run build     # production build (dist/)
npm run preview   # serve the production build locally
npm run lint      # linter (oxlint)
```

## Tech stack

- **React 19** + **TypeScript**, bundled with **Vite**.
- **Zustand** for app state (loaded photos, per-editor settings).
- **Konva** / **react-konva** for the interactive canvas (drag, zoom, rotate).
- **Tailwind CSS v4** for styling.
- **vite-plugin-pwa** (Workbox) for installability, offline support and background updates.
- Image export through the browser's native `<canvas>` — no backend, nothing uploaded.

## Deployment

Every push to `main` runs a GitHub Action (`.github/workflows/deploy.yml`) that builds the app and publishes it to GitHub Pages.

## Contact

Made by [@frangellgram](https://instagram.com/frangellgram).
