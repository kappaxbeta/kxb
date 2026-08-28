/**
 * A composed hero, as a document.
 *
 * The third thing the studio makes. A still (`?s=`) is a render of the room, a
 * shot (`?v=`) is that render with a clock, and a hero (`?h=`) is the finished
 * banner: sky, drifting blocks, a headline and — usually — a still exported
 * from one of the other two, dropped in the middle.
 *
 * ---------------------------------------------------------------------------
 * Why it is its own document and not the landing page in an editor
 * ---------------------------------------------------------------------------
 * The temptation is to point the composer at `page.tsx`'s hero and let it edit
 * that: same markup, same CSS, guaranteed to match. It would also mean the
 * landing page could never change its layout without breaking the tool, and
 * that every knob the composer wants — reroll the blocks, nudge the picture,
 * tilt it, bob it — becomes a prop on a production component that ships to
 * every visitor to serve one admin.
 *
 * So this is a separate thing that happens to look like the hero. It borrows
 * the ingredients (the same `public/xo/blocks/*.png` renders, the same pixel
 * face, the same magenta) and owns its own arrangement. The landing page is
 * untouched; the output is a PNG or a WebM you place by hand.
 *
 * ---------------------------------------------------------------------------
 * Why it lives in the URL
 * ---------------------------------------------------------------------------
 * Same reason a scene does — see the long note in `@/domain/studio/scene`. A
 * composition is worth keeping and is not user data, so it is encoded into the
 * query string and a hero is a link. `decodeHero` never throws for the same
 * reason `decodeScene` does not: a URL is a thing people truncate.
 *
 * The one thing that cannot survive the link is a picture dropped in off the
 * desktop. A data URL for a 2MB PNG is a 2.7MB query string, which no browser
 * and no chat client will carry — so a dropped file is held as a blob URL for
 * the session and the panel says so. Point `image.src` at a path under
 * `public/` (`/xo/scenes/…`) and the composition travels.
 */

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

/**
 * Where the copy sits, and therefore where everything else may not.
 *
 * `centred` is the landing page's arrangement: one column down the middle with
 * the picture under it. The split layouts are the ask this document was built
 * for — headline and body in one half, the picture in the other — and they are
 * the reason `heroBlocks` below takes the layout into account rather than
 * shipping a fixed set of positions.
 */
export type HeroLayout = 'centred' | 'text-left' | 'text-right'

/**
 * How the copy and the picture arrive.
 *
 * Only meaningful in a recording — a still is painted at `posterTime`, by which
 * point every entrance has finished. `none` is not redundant: it is what you
 * want when the clip is going to loop, where a rise on every pass reads as a
 * stutter rather than as an entrance.
 */
export type HeroEntrance = 'none' | 'fade' | 'rise' | 'pop' | 'type'

export interface HeroSky {
  /** Both ends of the vertical gradient, as CSS hex. */
  top: string
  bottom: string
  /** A bloom behind the copy, in the accent colour. Zero turns it off. */
  glow: number
  /** The faint square grid, as an opacity. */
  grid: number
  /** How many stars are scattered. They twinkle off the same clock as the drift. */
  stars: number
  /** Darkening at the corners, as an opacity. */
  vignette: number
}

export interface HeroText {
  /** The small line above the headline, or nothing. */
  eyebrow: string | null
  /**
   * The headline, in two parts.
   *
   * Split rather than marked up because the whole typographic idea of this hero
   * is that the second clause is the one that glows: "not here to chat" in ink,
   * "here to play." in magenta. A single string with a marker in it (`*…*`, or
   * a `<span>`) would need a parser and would let somebody write six of them.
   * Two fields can express exactly the one arrangement the design has.
   */
  headline: string
  accent: string | null
  /** The sentence underneath. Wrapped by the painter, so newlines are not needed. */
  body: string | null
  ink: string
  accentColour: string
  /** Multiplies every type size at once, so the block can be tuned as a unit. */
  size: number
}

/**
 * The button, or the pair of them.
 *
 * Drawn, not clickable — this is a picture of a hero, and the export is a PNG
 * or a video. It is here because a hero without one does not read as a hero: the
 * shape of a filled pill under the copy is most of what tells somebody at a
 * glance that they are looking at a landing page rather than a wallpaper, and
 * every banner this tool exists to make is going to want one.
 *
 * Two labels rather than a list, matching the landing page's own row: one thing
 * to do and one quieter way to look first. A third button is not a hero, it is a
 * menu.
 */
export interface HeroCta {
  label: string
  /** The quieter one beside it — outlined rather than filled. Nothing turns it off. */
  secondary: string | null
  /** The filled pill. Defaults to the accent, which is the point of an accent. */
  colour: string
  /** The label on the filled pill. */
  ink: string
}

export interface HeroImage {
  /**
   * A path under `public/`, an absolute URL, or a session-only `blob:`.
   *
   * See the note at the top: a blob does not survive the link, and the panel is
   * the thing that says so.
   */
  src: string
  /** The picture's centre, in percent across and down the frame. */
  x: number
  y: number
  /** Its width, as a fraction of the frame's. */
  scale: number
  rotation: number
  /** How far it bobs, in percent of the frame's height. Zero holds it still. */
  float: number
  /** A soft ellipse under it, so it stands on the sky instead of floating over it. */
  shadow: boolean
}

/**
 * Where the lockup sits.
 *
 * A corner rather than a free x/y, which is the one place in this document that
 * takes a choice away on purpose. A logo is not part of the composition — it is
 * the thing that says whose composition it is, and every arrangement where it
 * is somewhere other than a corner is one where it is competing with the
 * headline. The margin is the knob that actually gets turned.
 */
export type HeroCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface HeroLogo {
  /** A path under `public/`. `/lockup.png` is the mark and `team` together. */
  src: string
  corner: HeroCorner
  /** Its width, as a fraction of the frame's. */
  scale: number
  /** Distance from both edges of its corner, in percent of the frame's width. */
  margin: number
  opacity: number
}

export interface HeroBlocks {
  /** How many drift. Capped by how many slots the layout leaves free. */
  count: number
  /** The pool they are drawn from. Empty means every render there is. */
  models: string[]
  /** Multiplies the lot. One is about a fourteenth of the frame's width. */
  scale: number
  /** How far each one bobs and tumbles. Zero pins them. */
  drift: number
  /** Crescents, hearts and stars scattered between them. */
  shapes: number
}

export interface HeroMotion {
  fps: number
  /** Seconds of finished video. */
  duration: number
  entrance: HeroEntrance
  /** Seconds between one element's entrance and the next's. */
  stagger: number
  /**
   * When a still is taken, in seconds.
   *
   * Past the end of the entrance by default, so "Export PNG" gives you the
   * composition rather than a frame of it arriving. Editable because a bob is a
   * loop and the flattering moment in it is a matter of taste.
   */
  posterTime: number
}

export interface StudioHero {
  width: number
  height: number
  /**
   * Everything arranged at random, arranged from this.
   *
   * The blocks, the stars and the shapes are all a pure function of the seed —
   * so "reroll" is one number changing, the arrangement is reproducible from
   * the link, and nothing has to be stored per block. That is the whole reason
   * the drift is generated rather than authored the way `block-drift.tsx`'s is:
   * that file is one hero forever, and this is a tool for finding one.
   */
  seed: number
  layout: HeroLayout
  sky: HeroSky
  text: HeroText
  /** The button under the copy, or nothing. */
  cta: HeroCta | null
  image: HeroImage | null
  /** The lockup in a corner, or nothing when the banner is going somewhere already branded. */
  logo: HeroLogo | null
  blocks: HeroBlocks
  motion: HeroMotion
}

// ---------------------------------------------------------------------------
// What there is to draw with
// ---------------------------------------------------------------------------

/**
 * The block renders that actually exist on disk.
 *
 * Not the whole palette. `public/xo/blocks/*.png` is shot by
 * `scripts/render-blocks.ts` on demand, and it has only ever been run for these
 * — so offering the full fifty-eight names would let the composer pick a block
 * whose picture 404s, which in a canvas is not a broken-image icon but a
 * silently missing block. Add a name here only after shooting it:
 *
 *   bun run scripts/render-blocks.ts <model>
 */
export const HERO_BLOCK_MODELS = [
  'anvil',
  'apple',
  'barrel',
  'battery',
  'books_A',
  'bricks_A',
  'chest',
  'computer',
  'crate',
  'dirt_with_grass',
  'dynamite',
  'gift',
  'glass',
  'hay_bale',
  'lava',
  'melon',
  'stone_with_gold',
  'vault',
  'water',
] as const

/**
 * The neon each block is lit by, spread around the wheel.
 *
 * Hues rather than colours so the painter can mix its own alpha and lightness
 * for the glow; the numbers are degrees, matching the `--hue` custom property
 * `block-drift.tsx` feeds its CSS drop-shadows.
 */
const HUES = [145, 55, 230, 85, 200, 35, 330, 265, 175, 10]

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_HERO: StudioHero = {
  // 16:9 at a size that is still a sensible PNG. Wide enough that the split
  // layouts have two real columns, which a 4:3 does not.
  width: 1920,
  height: 1080,
  seed: 7,
  layout: 'text-left',
  sky: {
    top: '#120b26',
    bottom: '#04030d',
    glow: 0.5,
    grid: 0.06,
    stars: 90,
    vignette: 0.45,
  },
  text: {
    eyebrow: 'Live · a room that fits in a link',
    headline: 'Not here to chat |',
    accent: 'here to play.',
    body: 'A room you send as a link. Whoever opens it picks a name and an animal and is standing in it. No account, no install, nothing to download.',
    ink: '#f4f1ff',
    // The page's own magenta, `oklch(0.72 0.23 355)`, as hex — canvas has no
    // oklch, and converting one at paint time to keep the token would be a
    // colour-space library in service of a value that changes about never.
    accentColour: '#ff3ec8',
    size: 1,
  },
  cta: {
    label: 'Open a room',
    secondary: 'See the demo',
    colour: '#ff3ec8',
    ink: '#12071a',
  },
  image: null,
  logo: {
    // The mark and `team` as one picture, shot by `scripts/render-brand.ts`.
    // Not the two `<div>`s the header builds out of `lib/brand`: those are CSS
    // boxes with a glow on them, and a canvas cannot borrow either.
    src: '/lockup.png',
    corner: 'top-left',
    scale: 0.11,
    margin: 3.5,
    opacity: 1,
  },
  blocks: {
    count: 8,
    models: [],
    scale: 1,
    drift: 1,
    shapes: 4,
  },
  motion: {
    fps: 30,
    duration: 6,
    entrance: 'rise',
    stagger: 0.18,
    posterTime: 3,
  },
}

// ---------------------------------------------------------------------------
// The arrangement
// ---------------------------------------------------------------------------

/**
 * A small deterministic generator.
 *
 * mulberry32: thirty-two bits of state, four lines, good enough for scattering
 * decoration. The requirement is not statistical quality, it is that the same
 * seed gives the same hero on every machine forever — which rules out
 * `Math.random` and rules in something written out in full here rather than
 * pulled from a package that may change its algorithm in a minor version.
 */
function rng(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A rectangle in percent of the frame. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Where the copy sits, in percent.
 *
 * Exported because the painter lays the text out inside exactly this box, and
 * `heroBlocks` keeps out of exactly this box. Two constants that must agree is
 * how a block ends up sitting on a word.
 */
export function textBox(hero: StudioHero): Rect {
  switch (hero.layout) {
    case 'text-left':
      return { x: 6, y: 18, w: 46, h: 64 }
    case 'text-right':
      return { x: 48, y: 18, w: 46, h: 64 }
    default:
      return { x: 15, y: 12, w: 70, h: 52 }
  }
}

/**
 * Where the picture sits, in percent, or nothing if there is not one.
 *
 * Derived from the image's own centre and scale rather than from the layout: the
 * whole point of the position controls is that it can be dragged off the half
 * the layout nominally gives it, and a block that keeps out of where the
 * picture *would* be is not keeping out of where it is.
 *
 * Square, because the aspect of the file is not known until it has loaded and
 * the blocks are placed before that. Erring wide is the right way round — the
 * cost is a slot left empty, and the cost of erring narrow is a block behind
 * the picture.
 */
export function imageBox(hero: StudioHero): Rect | null {
  if (!hero.image) return null
  const w = hero.image.scale * 100
  // The frame is wider than it is tall, so the same fraction of the width is a
  // larger fraction of the height.
  const h = (hero.image.scale * hero.width * 100) / hero.height
  return { x: hero.image.x - w / 2, y: hero.image.y - h / 2, w, h }
}

/**
 * Where the lockup sits, in percent, or nothing if there is not one.
 *
 * The aspect is assumed rather than measured, for the reason `imageBox` assumes
 * a square: the blocks are placed before any picture has loaded. `/lockup.png`
 * is about 9:4, and erring tall costs a slot rather than a collision.
 *
 * Exported because the painter draws into exactly this box and the placer keeps
 * out of exactly this box — two pieces of arithmetic that must agree, which is
 * why there is one of them.
 */
export function logoBox(hero: StudioHero): Rect | null {
  if (!hero.logo) return null
  const w = hero.logo.scale * 100
  const h = (hero.logo.scale * (4 / 9) * hero.width * 100) / hero.height
  const left = hero.logo.corner.endsWith('left')
  const top = hero.logo.corner.startsWith('top')
  // The margin is in percent of the *width* at both edges, so the gap looks the
  // same on all four sides rather than being stretched by the aspect.
  const marginY = (hero.logo.margin * hero.width) / hero.height
  return {
    x: left ? hero.logo.margin : 100 - hero.logo.margin - w,
    y: top ? marginY : 100 - marginY - h,
    w,
    h,
  }
}

/** One block, placed. Percent across and down, as everything here is. */
export interface PlacedBlock {
  model: string
  x: number
  y: number
  scale: number
  hue: number
  /** Seconds this one's bob is offset by, so the set breathes out of step. */
  delay: number
  /** Which way it tumbles. */
  spin: number
}

export interface PlacedShape {
  kind: 'crescent' | 'heart' | 'star'
  x: number
  y: number
  hue: number
  scale: number
  delay: number
}

/**
 * Candidate positions, as a grid of jittered cells.
 *
 * Rejection sampling against the copy and the picture is what keeps decoration
 * out of the composition, and a grid is what keeps it from clumping: pure
 * rejection sampling on uniform points puts three blocks in the same corner
 * about as often as not, and on a hero that reads as a mistake rather than as
 * randomness. One block per cell, cells shuffled, take as many as are asked for.
 *
 * Nine by six is enough slots that a full-width `centred` layout still has
 * around twenty free, and coarse enough that two neighbours never touch.
 */
function slots(hero: StudioHero, random: () => number): { x: number; y: number; clear: boolean }[] {
  const cols = 9
  const rows = 6
  // Both hard keep-outs. A block over the lockup is the same kind of mistake as
  // a block over a word — there is no composition where either was meant — so
  // the logo joins the copy rather than the picture, which is only a preference.
  const hard = [textBox(hero), logoBox(hero)].filter((box): box is Rect => box !== null)
  const picture = imageBox(hero)

  const cells: { x: number; y: number; clear: boolean }[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      // The centre of the cell, jittered by up to a third of it — enough to
      // break the grid up by eye, not enough to walk into a neighbour.
      const x = ((col + 0.5) / cols) * 100 + (random() - 0.5) * (100 / cols) * 0.66
      const y = ((row + 0.5) / rows) * 100 + (random() - 0.5) * (100 / rows) * 0.66
      // A block is drawn from its centre and is about seven percent wide, so
      // its own half-width is what keeps it off the edge of the frame.
      const block: Rect = { x: x - 4, y: y - 7, w: 8, h: 14 }
      if (hard.some((box) => overlaps(block, box))) continue
      cells.push({ x, y, clear: picture === null || !overlaps(block, picture) })
    }
  }
  return cells
}

/**
 * Slots in preference order: the clear ones first, then the ones the picture
 * covers.
 *
 * The picture is a soft constraint, unlike the copy. Blocks are painted before
 * it, so one behind it is hidden rather than wrong — and a big picture on a
 * centred layout can cover every free cell, at which point the strict rule
 * would answer a request for eight blocks with none and no explanation. Falling
 * back means the count you set is the count you get for as long as there is any
 * room at all, and the blocks that end up behind the picture cost nothing.
 */
function ranked(hero: StudioHero, random: () => number, count: number): { x: number; y: number }[] {
  const cells = slots(hero, random)
  const clear = shuffle(
    cells.filter((cell) => cell.clear),
    random,
  )
  if (clear.length >= count) return clear.slice(0, count)
  const covered = shuffle(
    cells.filter((cell) => !cell.clear),
    random,
  )
  return [...clear, ...covered].slice(0, count)
}

/** Fisher-Yates, off the seeded generator so a shuffle is part of the document. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The drift, from the seed.
 *
 * Pure: same document, same blocks, on every machine and every reload. That is
 * what makes "reroll" a single number in the link rather than an array of
 * positions, and what makes the recorded video match the preview.
 *
 * Returns fewer than `count` when the layout has left fewer slots free, which
 * is the honest outcome — the alternative is stacking two blocks in one place
 * to hit a number nobody asked for exactly.
 */
export function heroBlocks(hero: StudioHero): PlacedBlock[] {
  const random = rng(hero.seed)
  const pool = hero.blocks.models.length > 0 ? hero.blocks.models : [...HERO_BLOCK_MODELS]
  const models = shuffle(pool, random)
  const cells = ranked(hero, random, hero.blocks.count)

  return cells.map((cell, i) => ({
    model: models[i % models.length],
    x: cell.x,
    y: cell.y,
    // The spread doubles as depth: a small block reads as a far one, which is
    // the only perspective a flat scatter of PNGs gets to have.
    scale: hero.blocks.scale * (0.5 + random() * 0.55),
    hue: HUES[Math.floor(random() * HUES.length)],
    delay: random() * 4,
    spin: random() < 0.5 ? -1 : 1,
  }))
}

/**
 * The crescent, hearts and stars.
 *
 * Drawn from the leftover slots — the ones the blocks did not take — so they
 * obey the same keep-out rule for free. They are pure decoration and claim
 * nothing about the product, which is why they are allowed to be invented in
 * code while every block has to come off a real render.
 */
export function heroShapes(hero: StudioHero): PlacedShape[] {
  // A second generator, offset from the first, so changing the block count does
  // not also move every star: the shapes would otherwise be drawn from whatever
  // point in the sequence the blocks stopped at.
  const random = rng(hero.seed + 991)
  const kinds: PlacedShape['kind'][] = ['crescent', 'heart', 'star', 'star']
  const cells = ranked(hero, random, hero.blocks.shapes)

  return cells.map((cell, i) => ({
    kind: kinds[i % kinds.length],
    x: cell.x,
    y: cell.y,
    hue: HUES[Math.floor(random() * HUES.length)],
    scale: 0.6 + random() * 0.8,
    delay: random() * 4,
  }))
}

export interface PlacedStar {
  x: number
  y: number
  radius: number
  /** Base opacity. The painter multiplies it by a twinkle off the clock. */
  alpha: number
  phase: number
}

/** The starfield. Uniform rather than gridded — a sky may clump, a composition may not. */
export function heroStars(hero: StudioHero): PlacedStar[] {
  const random = rng(hero.seed + 4177)
  return Array.from({ length: hero.sky.stars }, () => ({
    x: random() * 100,
    y: random() * 100,
    radius: 0.6 + random() * 1.3,
    alpha: 0.25 + random() * 0.6,
    phase: random() * Math.PI * 2,
  }))
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i

function number(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function colour(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value) ? value : fallback
}

/**
 * A line of copy, or nothing.
 *
 * Trimmed to a length rather than rejected for being over it, for the reason a
 * peep's `say` is: an over-long line came from a hand-edited link, and a clipped
 * headline is a better answer than an empty hero.
 */
function line(value: unknown, fallback: string | null, max: number): string | null {
  if (typeof value !== 'string') return fallback
  const text = value.slice(0, max)
  return text.trim().length > 0 ? text : null
}

/**
 * A picture's source, if it is one this document may point at.
 *
 * Same-origin paths, `https:`, and `blob:` for the session-only drop. Not
 * `data:` — a data URL is the thing that cannot fit in a query string in the
 * first place, and accepting one here would mean a link that encodes fine and
 * then silently fails to navigate. Not `javascript:` for the obvious reason,
 * although a canvas would ignore it; the check is cheap and the next reader of
 * this field may not be a canvas.
 */
function source(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const src = value.trim()
  if (src.length === 0 || src.length > 2048) return null
  if (src.startsWith('/') || src.startsWith('https://') || src.startsWith('blob:')) return src
  return null
}

function image(value: unknown): HeroImage | null {
  if (value === null || value === undefined) return null
  const raw = value as Record<string, unknown>
  const src = source(raw.src)
  // No picture is a hero without one, not a hero with a broken one.
  if (!src) return null
  return {
    src,
    x: number(raw.x, 72, -20, 120),
    y: number(raw.y, 52, -20, 120),
    scale: number(raw.scale, 0.34, 0.02, 1.5),
    rotation: number(raw.rotation, 0, -180, 180),
    float: number(raw.float, 1.2, 0, 12),
    shadow: raw.shadow === true,
  }
}

function cta(value: unknown): HeroCta | null {
  // Absent means the default pair, explicitly `null` means somebody turned it
  // off — the same rule the logo follows, and for the same reason: a link
  // written before this field existed must not open with the button missing.
  if (value === null) return null
  if (value === undefined) return DEFAULT_HERO.cta
  const raw = value as Record<string, unknown>
  const label = line(raw.label, null, 40)
  // A button with no words on it is a coloured pill, which is not what anybody
  // was asking for.
  if (!label) return null
  return {
    label,
    secondary: line(raw.secondary, null, 40),
    colour: colour(raw.colour, DEFAULT_HERO.cta?.colour ?? '#ff3ec8'),
    ink: colour(raw.ink, DEFAULT_HERO.cta?.ink ?? '#12071a'),
  }
}

const CORNERS: HeroCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

function logo(value: unknown): HeroLogo | null {
  // Absent means the default lockup; explicitly `null` means somebody turned it
  // off. The two have to stay distinguishable, or every link written before this
  // field existed would open with no logo on it.
  if (value === null) return null
  if (value === undefined) return DEFAULT_HERO.logo
  const raw = value as Record<string, unknown>
  const src = source(raw.src)
  if (!src) return null
  return {
    src,
    corner: CORNERS.includes(raw.corner as HeroCorner)
      ? (raw.corner as HeroCorner)
      : 'top-left',
    scale: number(raw.scale, 0.11, 0.02, 0.6),
    margin: number(raw.margin, 3.5, 0, 25),
    opacity: number(raw.opacity, 1, 0, 1),
  }
}

function sky(value: unknown): HeroSky {
  const raw = (value ?? {}) as Record<string, unknown>
  const base = DEFAULT_HERO.sky
  return {
    top: colour(raw.top, base.top),
    bottom: colour(raw.bottom, base.bottom),
    glow: number(raw.glow, base.glow, 0, 1),
    grid: number(raw.grid, base.grid, 0, 0.4),
    // Capped well under what a canvas will happily draw: every star is a fill,
    // every frame, and the recorder drops frames rather than slowing down.
    stars: Math.round(number(raw.stars, base.stars, 0, 400)),
    vignette: number(raw.vignette, base.vignette, 0, 1),
  }
}

function text(value: unknown): HeroText {
  const raw = (value ?? {}) as Record<string, unknown>
  const base = DEFAULT_HERO.text
  return {
    eyebrow: line(raw.eyebrow, base.eyebrow, 80),
    // The one field with no empty state: a hero with no headline is a
    // background, and the composer would show a blank frame and no way back.
    headline: line(raw.headline, base.headline, 120) ?? base.headline,
    accent: line(raw.accent, base.accent, 120),
    body: line(raw.body, base.body, 400),
    ink: colour(raw.ink, base.ink),
    accentColour: colour(raw.accentColour, base.accentColour),
    size: number(raw.size, base.size, 0.4, 2.5),
  }
}

function blocks(value: unknown): HeroBlocks {
  const raw = (value ?? {}) as Record<string, unknown>
  const base = DEFAULT_HERO.blocks
  const known = new Set<string>(HERO_BLOCK_MODELS)
  return {
    count: Math.round(number(raw.count, base.count, 0, 30)),
    // Unknown names dropped rather than substituted: there is no sensible stand-in
    // for a block, and a name with no PNG behind it is a hole in the sky.
    models: Array.isArray(raw.models)
      ? raw.models.filter((model): model is string => typeof model === 'string' && known.has(model))
      : base.models,
    scale: number(raw.scale, base.scale, 0.2, 3),
    drift: number(raw.drift, base.drift, 0, 4),
    shapes: Math.round(number(raw.shapes, base.shapes, 0, 16)),
  }
}

const ENTRANCES: HeroEntrance[] = ['none', 'fade', 'rise', 'pop', 'type']

function motion(value: unknown): HeroMotion {
  const raw = (value ?? {}) as Record<string, unknown>
  const base = DEFAULT_HERO.motion
  return {
    fps: Math.round(number(raw.fps, base.fps, 10, 60)),
    duration: number(raw.duration, base.duration, 1, 30),
    entrance: ENTRANCES.includes(raw.entrance as HeroEntrance)
      ? (raw.entrance as HeroEntrance)
      : base.entrance,
    stagger: number(raw.stagger, base.stagger, 0, 2),
    posterTime: number(raw.posterTime, base.posterTime, 0, 30),
  }
}

const LAYOUTS: HeroLayout[] = ['centred', 'text-left', 'text-right']

/** A hero from whatever was in the URL. Never throws, never returns a partial one. */
export function parseHero(value: unknown): StudioHero {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    width: Math.round(number(raw.width, DEFAULT_HERO.width, 240, 4096)),
    height: Math.round(number(raw.height, DEFAULT_HERO.height, 240, 4096)),
    seed: Math.round(number(raw.seed, DEFAULT_HERO.seed, 0, 999_999)),
    layout: LAYOUTS.includes(raw.layout as HeroLayout)
      ? (raw.layout as HeroLayout)
      : DEFAULT_HERO.layout,
    sky: sky(raw.sky),
    text: text(raw.text),
    cta: cta(raw.cta),
    image: image(raw.image),
    logo: logo(raw.logo),
    blocks: blocks(raw.blocks),
    motion: motion(raw.motion),
  }
}

// ---------------------------------------------------------------------------
// The query string
// ---------------------------------------------------------------------------

/** base64url, so a hero survives being pasted into anything. See `encodeScene`. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * The document, for the address bar.
 *
 * A blob URL is dropped on the way out. It is meaningless in any other tab —
 * the object it names belongs to this document — so encoding one produces a
 * link that looks like it carries a picture and opens without one. Better to
 * write the truth: this link has no picture in it.
 */
export function encodeHero(hero: StudioHero): string {
  const portable: StudioHero =
    hero.image && hero.image.src.startsWith('blob:') ? { ...hero, image: null } : hero
  return toBase64Url(JSON.stringify(portable))
}

/** The inverse, for a string that may be anything at all. */
export function decodeHero(encoded: string | undefined): StudioHero {
  if (!encoded) return DEFAULT_HERO
  try {
    return parseHero(JSON.parse(fromBase64Url(encoded)))
  } catch {
    // A mangled link opens the default hero rather than an error page.
    return DEFAULT_HERO
  }
}

/** Whether the picture is one the link cannot carry, which the panel has to say out loud. */
export const isSessionImage = (hero: StudioHero): boolean =>
  hero.image?.src.startsWith('blob:') === true
