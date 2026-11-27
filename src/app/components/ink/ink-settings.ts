/**
 * What the panel edits.
 *
 * One object for everything a hand can change while the piece runs: the
 * school (how many, how big, how fast), whether the fish get eyes, and the
 * colour mode and the blob amount, the two settings that reach past the fish
 * into the water itself - see ./ink-palettes for what a colour mode means.
 * The school reads this on its next tick and the water on its next frame,
 * so a slider is live and nothing is rebuilt.
 */

export type ColourMode = 'koi' | 'rainbow' | 'neon'

export const MODES: readonly ColourMode[] = ['koi', 'rainbow', 'neon']

export type InkSettings = {
  /** How many fish are in the water. */
  count: number
  /** And how many jellyfish. */
  jellies: number
  /** And how many turtles. */
  turtles: number
  /** And how many small fish - a shoal of minnows that keep together. */
  minnows: number
  /**
   * And how many faces haunt it: neon signs that switch on somewhere in the
   * water, in colours they have not worn before, and switch off again. Not
   * animals - see ./ink-face. Cats, llamas, hippos, chameleons and pairs of
   * eyes with nothing round them, counted apart.
   */
  cats: number
  llamas: number
  hippos: number
  stares: number
  chameleons: number
  /** Surprises: faces of no fixed kind, drawn again each time they return. */
  mix: number
  /** Swirl: the fish circle one another instead of wandering apart. */
  swirl: boolean
  /** The head's radius, as a fraction of the canvas height. */
  radius: number
  /** Cruising speed, in screen heights per second. */
  speed: number
  /** Whether the fish are drawn with eyes. Off: they are shapes, not cartoons. */
  eyes: boolean
  /** How big the eyes are, as a multiple of the usual. */
  eyeSize: number
  /** Scatter: every fish gets its own eye size around that, so no two match. */
  eyeScatter: boolean
  mode: ColourMode
  /**
   * How much of the water is blob rather than smoke, 0..1. Smoke is the
   * projection: curling, fractal, every dab shredding into filaments. Blob
   * is the other thing water does when it is thick: the same solver with
   * the curl taken out of it and the dye smoothed and cut at a threshold, so
   * the ink is flat shapes with bright rims that swell into each other like
   * metaballs and move in slow waves. In between is a layer of one over the
   * other, which is its own picture.
   */
  blob: number
}

export const DEFAULT_SETTINGS: InkSettings = {
  count: 4,
  jellies: 2,
  turtles: 2,
  minnows: 8,
  cats: 0,
  llamas: 0,
  hippos: 0,
  stares: 1,
  chameleons: 0,
  mix: 3,
  swirl: false,
  radius: 0.028,
  speed: 0.18,
  eyes: false,
  eyeSize: 1,
  eyeScatter: true,
  mode: 'neon',
  blob: 0.75,
}

export const LIMITS = {
  count: [0, 12] as const,
  jellies: [0, 8] as const,
  turtles: [0, 6] as const,
  minnows: [0, 30] as const,
  cats: [0, 4] as const,
  llamas: [0, 4] as const,
  hippos: [0, 4] as const,
  stares: [0, 4] as const,
  chameleons: [0, 4] as const,
  mix: [0, 6] as const,
  radius: [0.008, 0.08] as const,
  speed: [0.03, 0.6] as const,
  blob: [0, 1] as const,
  eyeSize: [0.4, 2.5] as const,
}

/**
 * Settings from a page's query, over the defaults: `?mode=neon&blob=1&fish=6`.
 * So a look can be handed to somebody as a link, and so the page can be
 * opened straight into any of them. Anything unparseable is ignored.
 */
export function settingsFromQuery(query: Record<string, string | string[] | undefined>): InkSettings {
  const s = { ...DEFAULT_SETTINGS }
  const get = (key: string) => {
    const v = query[key]
    return Array.isArray(v) ? v[0] : v
  }
  const num = (key: keyof typeof LIMITS, alias?: string) => {
    const raw = (alias && get(alias)) ?? get(key)
    if (raw === undefined) return
    const n = Number(raw)
    const [lo, hi] = LIMITS[key]
    if (Number.isFinite(n)) s[key] = Math.min(hi, Math.max(lo, n))
  }
  num('count', 'fish')
  num('jellies', 'jellyfish')
  num('turtles')
  num('minnows', 'small')
  num('cats')
  num('llamas')
  num('hippos')
  num('stares', 'eyes-in-the-dark')
  num('chameleons')
  num('mix', 'surprise')
  num('radius')
  num('speed')
  num('blob')
  num('eyeSize', 'eye')
  const mode = get('mode')
  if (mode && (MODES as readonly string[]).includes(mode)) s.mode = mode as ColourMode
  const eyes = get('eyes')
  if (eyes !== undefined) s.eyes = eyes !== '0' && eyes !== 'false'
  const scatter = get('scatter')
  if (scatter !== undefined) s.eyeScatter = scatter !== '0' && scatter !== 'false'
  const swirl = get('swirl')
  if (swirl !== undefined) s.swirl = swirl !== '0' && swirl !== 'false'
  return s
}
