/**
 * The mark, as geometry.
 *
 * Everything that draws κXβ outside a stylesheet reads from here: the favicon
 * checked in at `src/app/icon.svg`, the home screen and manifest icons, the
 * transparent PNGs handed to anyone pasting the logo somewhere, and the
 * red-wired favicon the tab shows while the connection is down. They were three
 * separate drawings before and the letters were subtly different in each.
 *
 * The letters are strokes, not type. The mark needs Greek, neither font in
 * `public/font` carries it, and neither does the face `next/og` falls back to -
 * a generated icon renders the word as two tofu boxes around an X. Drawn as
 * paths it owes nothing to a font file at build or at paint time.
 *
 * The colours are hex rather than the tokens they come from. These files are
 * served standalone - a favicon inherits no custom properties - and SVG has no
 * oklch.
 */

/** `--color-accent-2`. The cold half of the palette, and the mark's own colour. */
export const CYAN = '#00ebec'
/** `--color-accent`. The warm half, and the colour of the `team` half of the lockup. */
export const PINK = '#e74dff'
/** `--color-ink`. */
export const INK = '#f6f3fe'
/** `--surface`. */
export const SURFACE = '#03020e'
/**
 * The wire colour for a tab that has lost its connection.
 *
 * Not `--color-accent` (the pink the app uses for emphasis): pink beside cyan
 * reads as a second brand colour rather than as a warning, and at 16 pixels the
 * two are nearly the same value. Red is the one hue nobody mistakes for decoration.
 */
export const ALERT = '#ff2d55'

/**
 * The word, drawn in a 32-unit square.
 *
 * One stroke width for all three glyphs so they read as one word rather than
 * three marks; round caps keep the diagonals from shearing off into single dark
 * pixels at 16px. The beta keeps both its ascender and its descender - that
 * asymmetry is the whole silhouette, and without them it turns into a B.
 */
export const GLYPHS = `
    <path d="M6.5 11.5V21.5"/>
    <path d="M10.8 12.2 6.9 16.5"/>
    <path d="M7.4 16.2 10.8 21.5"/>
    <path d="M13.3 10.5 18.9 21.5"/>
    <path d="M18.9 10.5 13.3 21.5"/>
    <path d="M22.4 24V12.4a2.9 2.9 0 0 1 5.1 1.9 2.6 2.6 0 0 1-2.6 2.4"/>
    <path d="M24.9 16.7a2.9 2.9 0 0 1 0 5.2h-2.5"/>
`

/**
 * The other half of the lockup: `team`, on a 23x7 grid.
 *
 * The header sets this word in PixelMillennium, and the honest thing would be
 * to render the PNGs from the same file. Nothing outside a browser will load
 * it: sharp draws SVG through librsvg, which finds faces via fontconfig and has
 * never heard of `public/font`, so a `<text>` here comes out in whatever the
 * system hands back - which is how a pixel wordmark ships as Helvetica.
 *
 * So the word is a bitmap, and the page draws the same bitmap (see
 * `components/logo.tsx`) rather than the font. One drawing in one place, the
 * same argument as the glyphs above: the alternative is a badge on the site and
 * a badge in the press kit that are subtly different words.
 *
 * Five columns a letter, one column between, which is where 23 comes from.
 */
export const TEAM_ROWS = [
  '.#.....................',
  '.#.....................',
  '####...###...###..#####',
  '.#....#...#.....#.#.#.#',
  '.#....#####..####.#.#.#',
  '.#....#.....#...#.#.#.#',
  '..##...###...####.#.#.#',
]

/** The width and height of `TEAM_ROWS`, in cells. */
export const TEAM_COLS = TEAM_ROWS[0].length
export const TEAM_LINES = TEAM_ROWS.length

/**
 * The word as one `<path>`, in its own 23x7 space.
 *
 * A path of square subpaths rather than one `<rect>` per lit cell: there are
 * around ninety of them, and as elements they are ninety chances for a renderer
 * to leave a hairline seam between neighbours. As one path with a single fill
 * they merge into solid strokes, which is what a bitmap letter is.
 */
export function teamWordPath(): string {
  const cells: string[] = []
  TEAM_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') cells.push(`M${x} ${y}h1v1h-1z`)
    }
  })
  return cells.join('')
}

/**
 * The tab-strip mark: a dark rounded square with a bright wire around it.
 *
 * Redrawn for 32 pixels rather than scaled down from the landing page version -
 * the glow, the inset shadow and the italic all go, because at this size they
 * read as mud rather than neon. What survives is the shape a favicon is
 * recognised by.
 *
 * The background is opaque, not the page's translucent surface: a favicon sits
 * on whatever the browser paints behind it and cannot inherit a ground.
 *
 * `wire` is the one thing that varies. Cyan is the site; `ALERT` is the same
 * icon with a red border, which is what the tab shows while this client cannot
 * reach anybody - see `components/connection-favicon.tsx`.
 */
export function faviconSvg(wire: string = CYAN): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect x="1" y="1" width="30" height="30" rx="7" fill="${SURFACE}" stroke="${wire}" stroke-width="2"/>

  <!-- The transform recentres the word rather than the paths being drawn on
       centre: the beta's descender pulls the ink low and past the right edge,
       and these offsets are easier to read than that bias smeared across eight
       path commands. Scale is under 1, so the stroke width below lands a little
       lighter than it is written. -->
  <g transform="translate(16 16) scale(0.92) translate(-16.3 -17.25)"
     fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS}</g>
</svg>`
}

/**
 * The same SVG as something an `href` will take.
 *
 * Percent-encoded rather than base64: it survives in a `url()` and in a `link`
 * either way, but this one stays legible in devtools, which matters for the
 * thing you only ever look at when it is wrong.
 *
 * A data URI and not a route, because the case this exists for is the browser
 * being unable to fetch anything at all.
 */
export function faviconDataUri(wire: string = CYAN): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(wire))}`
}
