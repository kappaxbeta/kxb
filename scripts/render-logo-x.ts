/**
 * The wordmark for pasting: KXB in pink, on nothing.
 *
 * Not the same drawing as the favicon and the app icon, and deliberately so.
 * Everything that makes the mark work in the product - the cyan wire box, the
 * translucent ground, the neon bleed - is a dark-room effect. Pasted into a
 * timeline it has to survive whatever background it lands on and whatever size
 * the platform decides to show it at, so all of that comes off and what is left
 * is three letters and one colour.
 *
 * Uppercase, which is why these paths are not the ones in `src/lib/brand.ts`:
 * the mark's own lettering is a lowercase kappa and beta around a capital X,
 * and capitalising Greek gives Κ Χ Β - shapes indistinguishable from Latin
 * KXB. So they are drawn plainly here rather than pretending to be Greek.
 *
 * Kept as its own script rather than folded into `render-brand.ts` because
 * nothing here is shared with it: different letters, different colour, and a
 * different job. Run with `bun scripts/render-logo-x.ts`.
 */

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/**
 * `--color-accent` from globals.css, as hex.
 *
 * Written out rather than referenced because SVG has no oklch and this file is
 * read by X, not by a browser with the stylesheet loaded.
 */
const PINK = '#e74dff'

/**
 * The letters, drawn on a 20-unit cap height with a common baseline.
 *
 * Strokes rather than filled outlines, matching how the in-product mark is
 * built: one weight for all three so they read as a word, round caps and joins
 * so nothing shears to a point when a platform scales this down to 48px.
 *
 * Advances are hand-set, not a uniform grid. X is the narrowest of the three
 * and would float in an even one.
 */
const CAP_TOP = 8
const CAP_BOTTOM = 28

const LETTERS = [
  // K: stem, then both arms off a junction just above centre - high, so the leg
  // has room to kick out rather than hanging straight down.
  `M2 ${CAP_TOP}V${CAP_BOTTOM}`,
  `M13 ${CAP_TOP} 2.8 19.2`,
  `M5 17.6 13.6 ${CAP_BOTTOM}`,

  // X.
  `M18 ${CAP_TOP} 29 ${CAP_BOTTOM}`,
  `M29 ${CAP_TOP} 18 ${CAP_BOTTOM}`,

  // B: stem, then the two bowls. The lower bowl is the wider of the two, which
  // is what stops the letter looking like it is falling over.
  `M34 ${CAP_TOP}V${CAP_BOTTOM}`,
  `M34 ${CAP_TOP}h5.4a5 5 0 0 1 0 9.9H34`,
  `M34 17.9h6.1a5.05 5.05 0 0 1 0 10.1H34`,
]

/** The stroke weight, in the same units the paths are drawn in. */
const WEIGHT = 3.4

/**
 * The wordmark, drawn large on a canvas with room to spare.
 *
 * Deliberately not fitted here. The letters are strokes with round caps and a
 * skew, so their true extent is a good deal wider than the path coordinates
 * suggest, and every attempt to work it out by hand leaves the word sitting
 * slightly off-centre. The exports below crop to the ink instead, which cannot
 * be wrong by construction.
 *
 * The skew is the italic the mark has everywhere else. It is the one piece of
 * the product styling that survives, because it lives in the lettering rather
 * than around it.
 */
function wordmarkSvg(scale: number): string {
  const width = 70 * scale
  const height = 40 * scale

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 70 40">
  <g transform="translate(10 4) skewX(-9)"
     fill="none" stroke="${PINK}" stroke-width="${WEIGHT}"
     stroke-linecap="round" stroke-linejoin="round">
${LETTERS.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>`
}

/**
 * Crop to the ink, then give it back an even margin.
 *
 * `trim` is what makes the output tight and centred without any of the geometry
 * above having to be exactly right. The margin is not optional: X crops avatars
 * to a circle and pads nothing itself, so a wordmark flush to its own edges
 * arrives with the K and the B shaved off.
 */
async function render(out: string, note: string, margin: number, square = false) {
  const path = join(ROOT, out)
  await mkdir(dirname(path), { recursive: true })

  const ink = sharp(Buffer.from(wordmarkSvg(40))).trim({ threshold: 0 })
  const { data, info } = await ink.png().toBuffer({ resolveWithObject: true })

  // A square canvas sizes itself off the longer edge; a wide one just takes the
  // margin on all four sides and keeps the word's own proportion.
  const canvasW = square ? Math.max(info.width, info.height) + margin * 2 : info.width + margin * 2
  const canvasH = square ? canvasW : info.height + margin * 2

  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: data, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(path)

  console.log(`  ${out.padEnd(38)} ${note} (${canvasW}x${canvasH})`)
}

console.log('rendering the pink wordmark:')

// For a post, a header, anywhere the word goes beside something else.
await render('public/logo-x.png', 'transparent, tight', 90)

// For an avatar. The circle X crops to is inscribed in this, which the margin
// accounts for.
await render('public/logo-x-square.png', 'transparent, square', 190, true)

// The vector, for anywhere that will take one. No trimming here - an SVG can be
// cropped by whoever places it, and the untrimmed box keeps the letters on the
// same baseline as everything else drawn from these paths.
await writeFile(join(ROOT, 'public/logo-x.svg'), `${wordmarkSvg(10)}\n`)
console.log('  public/logo-x.svg                      transparent, vector')
