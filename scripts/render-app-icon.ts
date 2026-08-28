/**
 * The home screen icon, cut from a piece of artwork rather than drawn.
 *
 * `render-brand.ts` builds every other brand file out of vectors, and used to
 * build these three too. It cannot build this one: the icon is now a rendered
 * image - the mark over the squad, on the night sky - and there is no SVG of
 * that to scale. So the artwork is committed as the source and this script cuts
 * it to the sizes iOS and Android ask for.
 *
 * Run with `bun scripts/render-app-icon.ts`. The outputs are committed, so this
 * is a tool for when the artwork changes, not a build step.
 *
 * Three shapes come out of one source:
 *
 *  - `apple-icon.png`, 180px, square corners. iOS applies its own squircle, and
 *    a pre-rounded PNG gets rounded twice, leaving four pale notches. 180 is the
 *    largest size any iPhone asks for and Safari scales it down for the rest.
 *  - `icon-192` / `icon-512`, the manifest pair: the install prompt and the
 *    Android splash screen.
 *  - `icon-512-maskable`, which is the same picture pulled back inside a safe
 *    zone. Android launchers crop an icon to their own shape - circle, squircle,
 *    teardrop, whatever the skin does - and only the middle 80% of a maskable
 *    icon is guaranteed to survive. Full-bleed artwork loses its corners there,
 *    which on this one means the corners of the wire box. See `padded()`.
 */

import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const SOURCE = join(ROOT, 'public/brand/app-icon-source.png')

/** `--surface` from globals.css, and `background_color` in the manifest. */
const SURFACE = '#03020e'

/**
 * How far the artwork is pulled back inside a maskable icon.
 *
 * The maskable spec only guarantees the circle inscribed in the middle 80% of
 * the canvas, and the usual advice is to shrink the art to that. Here that is
 * more than the picture needs and more than it can afford: the bleed is
 * mirrored (see `padded`), and an 80% inset leaves a band wide enough to show a
 * second bear down the left edge.
 *
 * 0.9 is measured rather than chosen. The furthest corner of the cyan box sits
 * 222px from the centre of the 512 canvas, against a 205px safe radius, so it
 * needs a scale of 0.922 to clear a circular crop - and nothing else in the
 * frame is load-bearing, the squad being scenery that may be cropped freely.
 * Rounding down to 0.9 keeps a little margin and a 26px mirror.
 */
const SAFE = 0.9

/** The picture, edge to edge. What iOS and the manifest's plain icons want. */
async function fullBleed(size: number): Promise<Buffer> {
  return sharp(SOURCE)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    // Flattened because the source may carry alpha and both platforms
    // composite a transparent icon onto black, which would swallow the sky.
    .flatten({ background: SURFACE })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * The picture inside the safe zone, with its own edges mirrored out to fill the
 * bleed.
 *
 * The obvious way to make a maskable icon is to shrink the art and pad it with
 * a flat colour, but then the crop has a visible seam: a ring of `--surface`
 * around the artwork's own darker, bluer corners. A blurred copy of the source
 * behind it is no better - the blur drags the pink pig and the orange bear out
 * into the corners, and the ring becomes a coloured one.
 *
 * Mirroring cannot seam, because the pixel on either side of the join is the
 * same pixel. The reflection is only `1 - SAFE` of the width and lands almost
 * entirely in sky, so what it actually buys is a few more stars.
 */
async function padded(size: number): Promise<Buffer> {
  const inner = Math.round(size * SAFE)
  const bleed = Math.round((size - inner) / 2)

  return sharp(SOURCE)
    .resize(inner, inner, { fit: 'cover', position: 'centre' })
    .extend({
      top: bleed,
      bottom: size - inner - bleed,
      left: bleed,
      right: size - inner - bleed,
      extendWith: 'mirror',
    })
    .flatten({ background: SURFACE })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function write(buffer: Buffer, out: string, note: string) {
  const path = join(ROOT, out)
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, buffer)
  console.log(`  ${out.padEnd(42)} ${note}`)
}

const { width, height } = await sharp(SOURCE).metadata()
if (!width || !height) throw new Error(`cannot read ${SOURCE}`)
if (width !== height) {
  console.warn(`  note: source is ${width}x${height}, not square - it will be centre-cropped`)
}
if (width < 512 || height < 512) {
  throw new Error(`source is ${width}x${height}; the 512 icon needs at least 512x512`)
}

console.log('rendering the app icon:')

await write(await fullBleed(180), 'src/app/apple-icon.png', 'iPhone home screen (180)')
await write(await fullBleed(192), 'public/icons/icon-192.png', 'manifest / install prompt')
await write(await fullBleed(512), 'public/icons/icon-512.png', 'manifest / Android splash')
await write(await padded(512), 'public/icons/icon-512-maskable.png', 'Android launcher crop')
