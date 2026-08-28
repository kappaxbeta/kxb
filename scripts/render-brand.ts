/**
 * The brand mark, rendered out to the formats that will not take a live SVG.
 *
 * Four things need a file on disk:
 *
 *  - `src/app/icon.svg`, the favicon. Written from here rather than hand-edited
 *    so that the tab, the home screen and the pasted logo cannot drift apart.
 *  - iOS home screens. Safari's `apple-touch-icon` has never accepted SVG, and
 *    when it cannot read one it falls back to a screenshot of the page - which
 *    is how a site ends up saved to somebody's home screen as an illegible
 *    thumbnail of its own header.
 *  - X, and everywhere else a logo is pasted rather than linked, which wants a
 *    transparent PNG to drop onto its own background.
 *  - The manifest's 192/512 pair, read by Android and the desktop install prompt.
 *
 * The geometry all comes from `src/lib/brand.ts`; this file only says how big
 * and on what ground. Run with `bun scripts/render-brand.ts`. The outputs are
 * committed, so this is a tool for when the mark changes, not a build step.
 */

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  CYAN,
  GLYPHS,
  INK,
  PINK,
  SURFACE,
  TEAM_COLS,
  TEAM_LINES,
  faviconSvg,
  teamWordPath,
} from '../src/lib/brand'

const ROOT = join(import.meta.dir, '..')

/**
 * The mark as the landing page draws it: a cyan wire box with the word inside,
 * both glowing, on nothing at all.
 *
 * This is the `.logo` rule in `globals.css` restated in SVG - the 50x40 box,
 * the 0.4rem corner, the 2px border, the translucent cyan ground and both glows
 * (outer `box-shadow` and inset) - because CSS shadows have no vector
 * equivalent, and a screenshot of the header would arrive with the header's
 * background attached.
 *
 * `pad` is not margin for taste: a Gaussian blur paints outside the shape it
 * blurs, so without room around the box the outer glow gets clipped square by
 * the canvas edge and the mark looks cut out with scissors.
 */
function markSvg(width: number, height: number, pad: number): string {
  // The box keeps the 50x40 proportion of the CSS rule whatever canvas it is
  // given, and is centred in what the padding leaves.
  const boxW = width - pad * 2
  const boxH = boxW * (40 / 50)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${markBox(pad, (height - boxH) / 2, boxH)}
</svg>`
}

/**
 * The mark itself, as a fragment: box, glow, word, no canvas.
 *
 * Split out from `markSvg` so the lockup below can place it beside the `team`
 * box instead of alone in the middle of a canvas. Takes a height rather than a
 * width because height is what the two boxes have to agree on.
 */
function markBox(boxX: number, boxY: number, boxH: number): string {
  const boxW = boxH * (50 / 40)

  // Every length below is a fraction of the box, so this is the same drawing at
  // 180px and at 1600px rather than a thin one and a fat one.
  const unit = boxW / 50
  const radius = 6.4 * unit // 0.4rem against a 16px root
  const stroke = 2 * unit
  // The word fills the box the way the italic 1.5rem text does. 14 is the
  // drawn height of the glyphs in their own 32-unit space.
  const glyphScale = (boxH * 0.62) / 14
  const glyphX = boxX + boxW / 2
  const glyphY = boxY + boxH / 2

  return `  <defs>
    <!-- The outer half of the CSS box-shadow. Blur radius is in user units here
         where CSS gave it in rem, so it scales with the box like everything else. -->
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${(unit * 4).toFixed(2)}"/>
    </filter>
    <filter id="textGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${(unit * 1.6).toFixed(2)}"/>
    </filter>
  </defs>

  <!-- Painted first and blurred: the glow reading out from behind the box,
       which is what the outer box-shadow does. -->
  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${radius}"
        fill="none" stroke="${CYAN}" stroke-width="${stroke * 2}"
        opacity="0.45" filter="url(#glow)"/>

  <!-- The box. Filled with the translucent cyan ground, not the page surface:
       this file is meant to sit on somebody else's background. -->
  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${radius}"
        fill="${CYAN}" fill-opacity="0.08" stroke="${CYAN}" stroke-width="${stroke}"/>

  <!-- The word twice: blurred for the text-shadow, then sharp on top. The skew
       is the italic of the CSS rule - these are paths, so there is no oblique
       face to ask for. -->
  <g transform="translate(${glyphX} ${glyphY}) skewX(-9) scale(${glyphScale.toFixed(4)}) translate(-16.3 -17.25)"
     fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="${CYAN}" stroke-width="3.4" opacity="0.8" filter="url(#textGlow)">${GLYPHS}</g>
    <g stroke="${INK}" stroke-width="2.1">${GLYPHS}</g>
  </g>`
}

/**
 * The other box: `team`, in the pink half of the palette.
 *
 * The same drawing as `.logo-team` in globals.css, and for the same reason as
 * the mark - a screenshot of the header would arrive with the header attached,
 * and the glows have no vector equivalent to export.
 *
 * Only the height is passed in. The width is whatever the word needs, because
 * the box is a wire around a bitmap: fixing it would either crop the word or
 * leave it swimming. Everything else is stated as a fraction of the height, so
 * this box and the mark stay siblings at any size - the same 2px border and
 * 0.4rem corner as the CSS, scaled by the same amount.
 */
function teamBox(boxX: number, boxY: number, boxH: number): string {
  const unit = boxH / 40
  const radius = 6.4 * unit
  const stroke = 2 * unit
  // The cell size the browser lands on: `.logo`'s 1.5rem font-size against the
  // `em` divisor in the TeamBadge markup. Restated rather than guessed at, so
  // the PNG is the header at another size and not a second design.
  const cell = (24 * unit) / 14
  const wordW = TEAM_COLS * cell
  const padX = 9.6 * unit // 0.6rem of padding-inline
  const boxW = wordW + padX * 2
  const wordX = boxX + padX
  const wordY = boxY + (boxH - TEAM_LINES * cell) / 2

  return `  <defs>
    <filter id="teamGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${(unit * 4).toFixed(2)}"/>
    </filter>
    <filter id="teamWordGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${(unit * 1.5).toFixed(2)}"/>
    </filter>
  </defs>

  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${radius}"
        fill="none" stroke="${PINK}" stroke-width="${stroke * 2}"
        opacity="0.45" filter="url(#teamGlow)"/>

  <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${radius}"
        fill="${PINK}" fill-opacity="0.10" stroke="${PINK}" stroke-width="${stroke}"/>

  <!-- The word three times, as the mark does it twice: the blurred copy is a
       fill rather than a stroke, so it has no width of its own to bleed past
       the letters with, and one pass of it under a solid white bitmap is
       invisible. Two stacked passes are the CSS drop-shadow's weight. -->
  <g transform="translate(${wordX} ${wordY}) scale(${cell.toFixed(4)})">
    <path d="${teamWordPath()}" fill="${PINK}" filter="url(#teamWordGlow)"/>
    <path d="${teamWordPath()}" fill="${PINK}" filter="url(#teamWordGlow)"/>
    <path d="${teamWordPath()}" fill="${INK}"/>
  </g>`
}

/** The width `teamBox` will take at a given height - the caller needs it to size a canvas. */
function teamBoxWidth(boxH: number): number {
  const unit = boxH / 40
  return TEAM_COLS * ((24 * unit) / 14) + 19.2 * unit
}

/**
 * Both boxes side by side: the header's lockup, on nothing.
 *
 * This is the file to hand anybody who asks for "the logo" - the mark alone is
 * a monogram, and it is the pair that reads as an address. The gap is the
 * header's `gap-3`, scaled like everything else.
 */
function lockupSvg(boxH: number, pad: number): string {
  const gap = 12 * (boxH / 40)
  const markW = boxH * (50 / 40)
  const width = pad * 2 + markW + gap + teamBoxWidth(boxH)
  const height = pad * 2 + boxH

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${markBox(pad, pad, boxH)}
${teamBox(pad + markW + gap, pad, boxH)}
</svg>`
}

/** The pink box on its own, for the places that already have the mark. */
function teamSvg(boxH: number, pad: number): string {
  const width = pad * 2 + teamBoxWidth(boxH)
  const height = pad * 2 + boxH

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${teamBox(pad, pad, boxH)}
</svg>`
}

/**
 * The mark as a home screen app icon: the same drawing, on a ground.
 *
 * Both differences from the transparent version are iOS. The background is
 * full-bleed and opaque because iOS composites the icon onto black and then
 * rounds it itself, so a transparent PNG becomes a black tile with a logo
 * floating in it. And the canvas corners stay square for the same reason - the
 * system applies its own squircle, and a pre-rounded PNG gets rounded twice,
 * leaving four pale notches.
 *
 * The inset is the other half of that mask. iOS crops a little off every edge,
 * and Android launchers crop considerably more, so the wire box is drawn well
 * inside the canvas rather than against it.
 */
export function appIconSvg(size: number): string {
  const pad = size * 0.19
  const inner = markSvg(size, size, pad)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${SURFACE}"/>
  <defs>
    <!-- A cold wash behind the mark, so the icon is not a black tile lost on a
         black home screen wallpaper. -->
    <radialGradient id="wash" cx="50%" cy="46%" r="62%">
      <stop offset="0%" stop-color="${CYAN}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${CYAN}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#wash)"/>
  ${inner}
</svg>`
}

async function render(svg: string, out: string, note: string) {
  const path = join(ROOT, out)
  await mkdir(dirname(path), { recursive: true })
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(path)
  console.log(`  ${out.padEnd(42)} ${note}`)
}

async function write(text: string, out: string, note: string) {
  await writeFile(join(ROOT, out), text.endsWith('\n') ? text : `${text}\n`)
  console.log(`  ${out.padEnd(42)} ${note}`)
}

console.log('rendering the mark:')

// The tab. Generated from the same module the runtime imports, so the red-wired
// version the connection indicator swaps in is this icon and not a lookalike.
await write(
  `<!-- Generated by scripts/render-brand.ts from src/lib/brand.ts. Edit there. -->\n${faviconSvg()}`,
  'src/app/icon.svg',
  'browser tab',
)

// The home screen and manifest icons are no longer drawn here. They are cut
// from a piece of artwork by scripts/render-app-icon.ts - `appIconSvg` below is
// kept because it is what to fall back to if that artwork is ever retired.

// For pasting: the mark on nothing, at its own 5:4 proportion, and squared up
// for the places that want an avatar.
await render(markSvg(1600, 1280, 200), 'public/logo.png', 'transparent, 5:4 (X posts)')
await render(markSvg(1024, 1024, 150), 'public/logo-square.png', 'transparent, square (avatars)')

// The vector too: a logo handed to anybody outside the repo should be the one
// that never blurs.
await write(markSvg(500, 400, 62), 'public/logo.svg', 'transparent, vector')

// The lockup, and the pink box on its own. Sized off a 400px box so the wire is
// 20px and the glow has somewhere to go - anything smaller and the blur is the
// only thing that survives the downscale a profile header does to it.
await render(lockupSvg(400, 120), 'public/lockup.png', 'transparent, mark + team')
await render(teamSvg(400, 120), 'public/team.png', 'transparent, team only')
await write(lockupSvg(400, 120), 'public/lockup.svg', 'transparent, vector')
await write(teamSvg(400, 120), 'public/team.svg', 'transparent, vector')
