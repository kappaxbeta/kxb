/**
 * Turns the baked scenes into pictures you can actually post.
 *
 *     bun run scripts/build-social.ts          # everything
 *     bun run scripts/build-social.ts og-hero  # one scene
 *
 * Writes `public/og.png` - the card every link to the site unfurls as - and a
 * PNG per scene into `marketing/images/`, which is the folder to upload from.
 *
 * Run it after `scripts/shoot-scenes.ts`. That one draws the geometry; this one
 * puts a sky behind it. They are separate because the shots have a second life
 * on the landing page, where the sky is already there.
 *
 * ---------------------------------------------------------------------------
 * Why a sky has to be painted on at all
 * ---------------------------------------------------------------------------
 * Every shot in `public/xo/scenes` has a transparent background on purpose:
 * they land on the site's own starfield, so they end at the geometry rather
 * than at a rectangle of sky the page would have to match. Nothing posted
 * anywhere has a page under it. Handed transparency, Slack composites on white,
 * X on its own theme colour, Instagram flattens to whatever it likes - and the
 * animals end up standing in a void of the wrong colour, or a void that changes
 * colour depending on who is looking.
 *
 * So the sky `globals.css` draws in CSS is drawn here in SVG instead: the same
 * base colour, the same three blooms, at the same corners. The post and the
 * page it links to are then the same picture, which is the whole point of the
 * click.
 *
 * PNG, not webp, and not for the file size. These get handed to every chat
 * client, crawler and upload form anybody has ever written, and PNG is the one
 * they all read.
 */

import { mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.join(import.meta.dir, '..')
const SCENES = path.join(ROOT, 'public', 'xo', 'scenes')
const OUT = path.join(ROOT, 'marketing', 'images')

/** The link card, which is the one asset with a size somebody else chose. */
const OG_SCENE = 'og-hero'
const OG_FILE = path.join(ROOT, 'public', 'og.png')
const OG_WIDTH = 1200
const OG_HEIGHT = 630

/**
 * The page's sky, as an image.
 *
 * `globals.css` sets the body to `oklch(0.08 0.04 285)` and lays three blooms
 * over it - magenta off the top right, indigo off the top left, cyan out of the
 * bottom left. These are those, converted to sRGB and placed at the same
 * fractions of the frame, so they land in the same corners whatever the shape.
 *
 * The starfield is deliberately left out. At this size a 1px star is a
 * compression artefact, and every one of them would survive as a smudge in
 * whatever the receiving platform re-encodes the upload to.
 */
function sky(width: number, height: number): Buffer {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="magenta" cx="0.85" cy="-0.1" r="0.75">
      <stop offset="0" stop-color="#e05bd4" stop-opacity="0.26"/>
      <stop offset="0.7" stop-color="#e05bd4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="indigo" cx="-0.05" cy="0" r="0.8">
      <stop offset="0" stop-color="#7b6bf5" stop-opacity="0.38"/>
      <stop offset="0.72" stop-color="#7b6bf5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cyan" cx="0.12" cy="1.08" r="0.7">
      <stop offset="0" stop-color="#3fc3e8" stop-opacity="0.26"/>
      <stop offset="0.7" stop-color="#3fc3e8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#02000b"/>
  <rect width="${width}" height="${height}" fill="url(#indigo)"/>
  <rect width="${width}" height="${height}" fill="url(#magenta)"/>
  <rect width="${width}" height="${height}" fill="url(#cyan)"/>
</svg>`)
}

/** One scene, on the sky, at the given size. */
async function onSky(scene: string, file: string, width: number, height: number) {
  const art = await sharp(path.join(SCENES, `${scene}.webp`))
    .resize(width, height, { fit: 'cover' })
    .png()
    .toBuffer()

  const { size } = await sharp(sky(width, height))
    .composite([{ input: art }])
    .png({ compressionLevel: 9 })
    .toFile(file)

  console.log(`${path.relative(ROOT, file)} (${width}x${height}, ${Math.round(size / 1024)} kB)`)
}

const available = readdirSync(SCENES)
  .filter((f) => f.endsWith('.webp'))
  .map((f) => f.replace(/\.webp$/, ''))

const wanted = process.argv.slice(2)
const scenes = wanted.length > 0 ? wanted : available

for (const scene of wanted) {
  if (!available.includes(scene)) throw new Error(`no such scene: ${scene}`)
}

mkdirSync(OUT, { recursive: true })

for (const scene of scenes) {
  // Its own size, whatever the scene was composed at - a shot framed for 3:2
  // and re-cropped to something else loses the edge of itself, and every one of
  // these was framed on purpose.
  const { width, height } = await sharp(path.join(SCENES, `${scene}.webp`)).metadata()
  await onSky(scene, path.join(OUT, `${scene}.png`), width, height)
}

if (scenes.includes(OG_SCENE)) {
  await onSky(OG_SCENE, OG_FILE, OG_WIDTH, OG_HEIGHT)
}
