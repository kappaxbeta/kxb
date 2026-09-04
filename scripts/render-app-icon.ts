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
 * Two apps are cut from the one source. The site's home screen tile is the
 * first; `packages/shell` - kxb.team as an installed app - is the second, and
 * it needs the same picture at the sizes Expo asks for rather than the sizes
 * Safari does. Both are here because the alternative is a second script that
 * has to be remembered when the artwork changes.
 *
 * Four shapes come out of one source:
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
 *  - `rounded()`, which is the only shape the web never needs: a splash screen
 *    draws its image *onto* a background rather than into a mask, so a square
 *    one reads as a photograph somebody left on the launch screen.
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

/**
 * The picture with the corners taken off, alpha intact.
 *
 * Every other output here is square because the platform rounds it: iOS applies
 * its squircle to the app icon, Android its mask, and a pre-rounded PNG gets
 * rounded twice into four pale notches. A splash screen is the exception - the
 * image is composited onto `backgroundColor` with nothing applied to it - so
 * the rounding has to be in the file or it is nowhere.
 *
 * The radius is Apple's own for an app icon, 22.37% of the side, so the splash
 * and the icon on the home screen behind it are the same shape. `dest-in` keeps
 * the source's colour where the mask is opaque and drops it everywhere else,
 * which is what makes this a real transparent corner rather than a dark one
 * that happens to match today's background.
 */
async function rounded(size: number): Promise<Buffer> {
  const radius = Math.round(size * 0.2237)
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  )

  return sharp(SOURCE)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .flatten({ background: SURFACE })
    .composite([{ input: mask, blend: 'dest-in' }])
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

/**
 * The installed apps, which are repositories of their own now.
 *
 * These three used to be written straight into `packages/shell/assets`. The
 * shell moved out to kxbshell (and the phone app to kxbxo), and a script that
 * reached across a repository boundary by relative path would work on the one
 * machine where those folders happen to sit side by side and nowhere else.
 *
 * So the destination is asked for instead: pass `--apps <dir>` and the three
 * Expo sizes land in that project's `assets/`. Expo wants 1024 and cuts every
 * size the two platforms ask for out of it at prebuild, so there is nothing
 * smaller to write.
 *
 *     bun run scripts/render-app-icon.ts --apps ../kxbshell
 */
const appsFlag = process.argv.indexOf('--apps')
const appsDir = appsFlag === -1 ? null : process.argv[appsFlag + 1]

if (appsDir) {
  await write(await fullBleed(1024), `${appsDir}/assets/icon.png`, 'home screen')
  await write(await padded(1024), `${appsDir}/assets/adaptive-icon.png`, 'Android')
  await write(await rounded(1024), `${appsDir}/assets/splash-icon.png`, 'launch screen')
} else {
  console.log('  (no --apps <dir> given, so the installed apps\' icons were skipped)')
}
