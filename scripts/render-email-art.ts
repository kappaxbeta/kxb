/**
 * The pictures the auth emails are built out of.
 *
 *     bun run mail:art
 *
 * Writes into `public/email/`, which is where the templates point: GoTrue
 * renders `{{ .SiteURL }}/email/<file>`, so these are fetched from the live site
 * by whichever inbox is showing the mail. That is also why they are committed
 * and why they live under `public/` rather than in `marketing/` - an email is
 * read for years, and an asset that only existed on somebody's laptop would be
 * a broken image in every copy of it.
 *
 * ---------------------------------------------------------------------------
 * Why any of this is an image
 * ---------------------------------------------------------------------------
 * The landing page's sky is fifteen stacked `radial-gradient`s and the logo is
 * a neon lockup with a blur behind it. Email clients have neither: Outlook
 * renders through Word, which has never supported CSS gradients, and no client
 * agrees about filters. So the sky is baked here into a tile, the lockup is
 * trimmed to a flat PNG, and the templates only have to place rectangles.
 *
 * PNG throughout, never the .webp the site uses. Outlook cannot decode webp and
 * shows a broken-image box in its place - see the note in build-mail-templates.
 *
 * The palette is the page's own, converted once: `#02000b` deep space, the
 * three corner blooms from `body::before` in globals.css, and the two neons the
 * lockup is drawn in (`#00ebec` cyan, `#e74dff` magenta).
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.join(import.meta.dir, '..')
const OUT = path.join(ROOT, 'public', 'email')
const SHOTS = path.join(ROOT, 'public', 'xo', 'shots')

const CYAN = '#00ebec'
const MAGENTA = '#e74dff'

mkdirSync(OUT, { recursive: true })

/**
 * A tiny deterministic PRNG.
 *
 * `Math.random` would rewrite every star on every run, so a rebuild after an
 * unrelated copy edit would show up as a changed binary in the diff and a
 * different sky in the mail. Seeded, this script is a pure function of itself.
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * The starfield, as one seamless tile.
 *
 * `globals.css` builds this from three coprime-sized gradient layers so the
 * seams never line up. That trick needs a real browser; here there is one tile,
 * so it has to be genuinely seamless instead - every star closer to an edge
 * than its own radius is drawn a second time on the opposite edge, which is
 * what makes the repeat invisible.
 *
 * The faint grid comes with it, at the page's 4rem spacing (64px). It divides
 * the tile exactly, or the repeat would show a doubled line every 400px.
 */
function skyTile(size: number): Buffer {
  const random = rng(0x5eed)
  const stars: string[] = []

  // Three passes, biggest and brightest first, matching the near/mid/far bands
  // the page's own starfield is built in.
  const bands = [
    { count: 7, r: 1.5, alpha: 0.9, hues: ['#f3e2ff', '#e2ecff'] },
    { count: 16, r: 1.05, alpha: 0.62, hues: ['#ecdcff', '#dce8ff'] },
    { count: 34, r: 0.75, alpha: 0.4, hues: ['#e6dcf5', '#dfe6f5'] },
  ]

  for (const band of bands) {
    for (let i = 0; i < band.count; i += 1) {
      const x = random() * size
      const y = random() * size
      const fill = band.hues[Math.floor(random() * band.hues.length)]
      const dot = (cx: number, cy: number) =>
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${band.r}" fill="${fill}" fill-opacity="${band.alpha}"/>`

      stars.push(dot(x, y))

      // The wrap. Both axes, and the corner, so a star near a corner appears in
      // all four - anything less and the tile has a visible seam at the corners.
      const wrapX = x < band.r ? x + size : x > size - band.r ? x - size : null
      const wrapY = y < band.r ? y + size : y > size - band.r ? y - size : null
      if (wrapX !== null) stars.push(dot(wrapX, y))
      if (wrapY !== null) stars.push(dot(x, wrapY))
      if (wrapX !== null && wrapY !== null) stars.push(dot(wrapX, wrapY))
    }
  }

  const grid = 64
  const lines: string[] = []
  for (let x = 0; x < size; x += grid) {
    lines.push(
      `<rect x="${x}" y="0" width="1" height="${size}" fill="${MAGENTA}" fill-opacity="0.05"/>`,
    )
  }
  for (let y = 0; y < size; y += grid) {
    lines.push(
      `<rect x="0" y="${y}" width="${size}" height="1" fill="${CYAN}" fill-opacity="0.045"/>`,
    )
  }

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="#05030c"/>
  ${lines.join('')}
  ${stars.join('')}
</svg>`)
}

/**
 * The header: the sky's two top blooms and the lockup, in one picture.
 *
 * One image rather than a logo laid over a background, and that is a deliberate
 * retreat from the obvious markup. A cell with a background image and something
 * on top of it is the single least portable thing in HTML email - Outlook needs
 * a VML rectangle behind it, and gets the sizing wrong anyway - whereas an
 * `<img>` is the one element every client has always agreed about.
 *
 * So the blooms, the stars and the lockup are composited here, where there is a
 * real image library, and the template places one rectangle with alt text on
 * it. The stars in the band are the same tile that repeats below it, so the sky
 * runs continuously from the header into the body of the mail.
 */
function headerBand(width: number, height: number, tile: Buffer): Promise<Buffer> {
  const glow = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="magenta" cx="0.86" cy="0.02" r="0.78">
      <stop offset="0" stop-color="${MAGENTA}" stop-opacity="0.38"/>
      <stop offset="0.72" stop-color="${MAGENTA}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="indigo" cx="-0.02" cy="0.08" r="0.82">
      <stop offset="0" stop-color="#7b6bf5" stop-opacity="0.46"/>
      <stop offset="0.74" stop-color="#7b6bf5" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.62" stop-color="#05030c" stop-opacity="0"/>
      <stop offset="1" stop-color="#05030c" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#indigo)"/>
  <rect width="${width}" height="${height}" fill="url(#magenta)"/>
  <rect width="${width}" height="${height}" fill="url(#fade)"/>
</svg>`)

  // The band is the tiled sky with the blooms composited on top, so the stars
  // run continuously from the band into the repeat below it.
  return sharp({
    create: { width, height, channels: 4, background: '#05030c' },
  })
    .composite([
      { input: tile, tile: true, blend: 'over' },
      { input: glow, blend: 'over' },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** The lockup, trimmed of the transparent margin around its glow. */
async function lockup(width: number): Promise<Buffer> {
  return sharp(path.join(ROOT, 'public', 'lockup.png'))
    .trim({ threshold: 1 })
    .resize({ width })
    .png()
    .toBuffer()
}

/** A short neon rule: cyan into magenta, the two colours of the lockup. */
function rule(width: number, height: number): Buffer {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="neon" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CYAN}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${height / 2}" fill="url(#neon)"/>
</svg>`)
}

/**
 * The peeps, cropped to the animal.
 *
 * The shots on the site are 512px frames with the peep floating in the middle
 * of a lot of transparency - fine on a page that scales them, useless at 48px
 * in an email, where the animal ends up a speck in the corner of its tile. So
 * each one is trimmed to its own ink and re-centred in a square.
 */
async function peep(name: string) {
  const trimmed = await sharp(path.join(SHOTS, `${name}-front.webp`))
    .trim({ threshold: 1 })
    .toBuffer()

  const { width = 1, height = 1 } = await sharp(trimmed).metadata()
  const side = Math.round(Math.max(width, height) * 1.1)

  /**
   * Two passes, and they cannot be one.
   *
   * sharp resizes the base image *before* compositing, whatever order the calls
   * are written in - so a single chain would shrink the empty square to 128px
   * first and then refuse the full-size peep as too big to composite onto it.
   */
  const squared = await sharp({
    create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: trimmed, gravity: 'centre' }])
    .png()
    .toBuffer()

  await sharp(squared)
    .resize(128, 128)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `peep-${name}.png`))
}

const PEEPS = ['penguin', 'fox', 'panda', 'parrot', 'bunny', 'koala', 'cat', 'deer']

/**
 * Everything is drawn at twice its display size.
 *
 * The header is placed 600px wide and the peeps at 48; at 1x they would be soft
 * on every phone made in the last decade, and an email is mostly read on one.
 * The cost is bytes, and these are small flat images - the whole set is well
 * under the 100KB an inbox starts caring about.
 */
const tile = await sharp(skyTile(400)).png({ compressionLevel: 9 }).toBuffer()
await sharp(tile).toFile(path.join(OUT, 'sky.png'))

// Taller than the star tile on purpose: sharp tiles a composite by repeating it
// across the canvas, and refuses an input larger than what it is being drawn
// onto - so a band shorter than 400px cannot have the sky in it at all.
const BAND = { width: 1200, height: 440 }
const LOGO_WIDTH = 520

/**
 * Built tall, then cropped.
 *
 * The band has to be at least as tall as the star tile for sharp to repeat the
 * tile into it at all, but 440px of sky above a card is a lot of empty room -
 * the logo ends up floating with a dead strip under it. So it is composed at
 * the height the tiling needs and the bottom is trimmed off afterwards, which
 * also takes away the deadest part of the fade.
 */
const banded = await sharp(await headerBand(BAND.width, BAND.height, tile))
  // Placed by hand rather than by gravity: 'north' puts the lockup flush
  // against the top edge, and the glow around it needs room to be a glow.
  .composite([{ input: await lockup(LOGO_WIDTH), left: (BAND.width - LOGO_WIDTH) / 2, top: 44 }])
  .png()
  .toBuffer()

await sharp(banded)
  .extract({ left: 0, top: 0, width: BAND.width, height: 330 })
  .png({ compressionLevel: 9 })
  .toFile(path.join(OUT, 'header.png'))

await sharp(rule(240, 6)).png().toFile(path.join(OUT, 'rule.png'))
for (const name of PEEPS) await peep(name)

console.log(`email art written to public/email/ (sky, header, rule, ${PEEPS.length} peeps)`)
