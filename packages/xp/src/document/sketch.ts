/**
 * An XP that draws itself: sketch code, run in a container the host provides.
 *
 * ---------------------------------------------------------------------------
 * What this block is for
 * ---------------------------------------------------------------------------
 * `./frame` covers a game whose code the *host already ships* — boxing is a
 * workspace package, trusted like any other code in the bundle. This block
 * covers the opposite trust story: a game whose code **arrived in the
 * document**, written by whoever wrote the level. A p5.js sketch is the first
 * engine: `setup()`, `draw()`, a canvas, and none of it is a world this
 * format can describe with placements and triggers.
 *
 * The temptation, again, is a route of its own — and the answer is the same
 * one `./frame` gives. A sketch that is an XP is listed by the store, picked
 * by the battle wizard and opened by the match room without any of them
 * changing. What changes is what gets mounted at the end: an `<iframe>`
 * instead of a canvas full of bodies.
 *
 * ---------------------------------------------------------------------------
 * Why the sources live *inside* the document
 * ---------------------------------------------------------------------------
 * backend.md §1.2 refuses `.js` files in an XP's folder, and the argument
 * there — a stranger's script served from our origin is stored XSS — is not
 * one this block reopens. Nothing here stores or serves a script file. The
 * sources are strings inside a JSON document, exactly as `scripts` has always
 * carried them for the QuickJS sandbox; they only ever become executable
 * inside an opaque-origin sandboxed iframe the host builds (`sandbox`
 * without `allow-same-origin`), which is precisely the containment §1.2 names
 * as the price of ever wanting this. The folder rules, the caps and the
 * review queue are all unchanged, which is what that section promised.
 *
 * ---------------------------------------------------------------------------
 * The engine does not run any of this
 * ---------------------------------------------------------------------------
 * Like `frame.game`, the `engine` string is the host's to honour. This
 * package holds no p5, no iframe and no DOM — it can only say whether the
 * block is well-formed, and a host that has never heard of the engine refuses
 * the document with a sentence naming it, the same failure `./frame` chose
 * over a blank canvas.
 *
 * ---------------------------------------------------------------------------
 * What a sketch document does not have
 * ---------------------------------------------------------------------------
 * A world, packs, capability checks against marks — the same excusals a
 * framed document gets, for the same reason: the content is inside code this
 * package cannot see. What it *keeps* is everything around the content:
 * `backend.needs` still says what the host must supply, `player.keys` still
 * binds up to five named buttons (and they become on-screen buttons on a
 * phone exactly as they do for a level), `words` still translates.
 */

export const SKETCH_ENGINES = ['p5'] as const
export type SketchEngine = (typeof SKETCH_ENGINES)[number]

export const isSketchEngine = (value: unknown): value is SketchEngine =>
  typeof value === 'string' && (SKETCH_ENGINES as readonly string[]).includes(value)

/**
 * How many files a sketch may be split into.
 *
 * Sixteen is a project, not an archive. The limit exists for the same reason
 * `MAX_PLAYER_KEYS` does: these become a file list in an editor, and a
 * hundred entries is a tree nobody can hold in their head — and a decompression
 * bomb's favourite shape, which is why the total below is the real ceiling.
 */
export const MAX_SKETCH_FILES = 16

/** The longest one file may be. Twice a QuickJS script's 64 kB, because a
 * sketch is the whole game rather than one behaviour in it. */
export const MAX_SKETCH_FILE = 128 * 1024

/**
 * And the whole project's ceiling, which is the one that matters: sixteen
 * files at the per-file cap would be 2 MB of source in a document every shelf
 * listing downloads. Half a megabyte is a very large sketch and a tolerable
 * document.
 */
export const MAX_SKETCH_TOTAL = 512 * 1024

/** The longest a path may be. Enough for a folder and a name, short enough to log. */
export const MAX_SKETCH_PATH = 64

/**
 * What a file may be called: lower-case segments, `/` between them, and one
 * of the extensions the container knows what to do with. The narrow alphabet
 * is the same argument `frame.game` makes — these strings become keys, tab
 * labels and log lines, and refusing the exotic here means no consumer
 * downstream wonders whether it was sanitised.
 *
 * `.js` runs; the shader extensions do **not** — they are text the sketch
 * reads back with `xp.file(path)` and hands to `createShader`. Art still
 * travels the way art travels (packs); this block holds source, and a
 * shader is source.
 */
export const SKETCH_PATH =
  /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*\.(js|vert|frag|glsl)$/

/** The files that are evaluated, as opposed to carried. */
export const runsInSketch = (path: string): boolean => path.endsWith('.js')

export interface XpSketch {
  /** Which runtime the code is written against, by a name the host knows. */
  engine: SketchEngine
  /**
   * The file the project is *about* — the one an editor opens first, and the
   * one evaluated **last**, after every other file, so helpers a sketch was
   * split into exist by the time the main file runs. Every other file is
   * evaluated in the order it appears in `files`, which JSON keeps.
   */
  entry: string
  /** Path → source. The whole project; there is nothing else to fetch. */
  files: Record<string, string>
  /**
   * How long one pass of this sketch is, in seconds, when it has a length
   * at all — declared up front, which is what makes a *render* of one
   * possible: a capture (a still at a moment, a video of a pass) needs to
   * know where the piece ends without running it to find out, the same way
   * a movie's timeline does. `xp.timeline` hands it back to the sketch, so
   * a composition can loop itself to its own declared length.
   */
  timeline?: { seconds: number }
  /**
   * Whether a phone gets a thumbstick.
   *
   * The document declares it rather than the sketch requesting it at
   * runtime, for the same reason `player.keys` lives in the document: what
   * is drawn over the game is the platform's to draw, and a picker deciding
   * whether a game is playable on a phone needs the answer without running
   * the code. The stick feeds `xp.input` - the same axis the arrow keys and
   * WASD feed on a keyboard - so a sketch written against `xp.input` is
   * playable on both without a line of device code.
   */
  stick?: boolean
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Read a `sketch` block, or say why not.
 *
 * Returns `undefined` for an absent block, which is every document that is a
 * level or a cartridge — the common case stays free, the same rule `frame`,
 * `rules` and `backend` follow.
 */
export function readSketch(
  raw: unknown,
  at: string,
  problems: { at: string; message: string }[],
): XpSketch | undefined {
  if (raw === undefined) return undefined

  if (!isObject(raw)) {
    problems.push({ at, message: 'not an object' })
    return undefined
  }

  const engine = raw.engine
  if (!isSketchEngine(engine)) {
    problems.push({
      at: `${at}.engine`,
      message: `expected one of ${SKETCH_ENGINES.join(', ')}`,
    })
    return undefined
  }

  if (!isObject(raw.files)) {
    problems.push({ at: `${at}.files`, message: 'missing' })
    return undefined
  }

  const entries = Object.entries(raw.files)
  if (entries.length === 0) {
    problems.push({ at: `${at}.files`, message: 'empty — a sketch with no code is not one' })
    return undefined
  }
  if (entries.length > MAX_SKETCH_FILES) {
    problems.push({
      at: `${at}.files`,
      message: `${entries.length} files, over the ${MAX_SKETCH_FILES} limit`,
    })
    return undefined
  }

  const files: Record<string, string> = {}
  let total = 0
  for (const [path, source] of entries) {
    const where = `${at}.files["${path}"]`
    if (path.length > MAX_SKETCH_PATH || !SKETCH_PATH.test(path)) {
      problems.push({
        at: where,
        message: 'lower-case letters, digits, dots, dashes; folders with /; ends in .js',
      })
      continue
    }
    if (typeof source !== 'string') {
      problems.push({ at: where, message: 'must be the source, as a string' })
      continue
    }
    if (source.length > MAX_SKETCH_FILE) {
      problems.push({
        at: where,
        message: `${source.length} characters, over the ${MAX_SKETCH_FILE} limit`,
      })
      continue
    }
    total += source.length
    files[path] = source
  }

  if (total > MAX_SKETCH_TOTAL) {
    problems.push({
      at: `${at}.files`,
      message: `${total} characters across the project, over the ${MAX_SKETCH_TOTAL} limit`,
    })
    return undefined
  }

  const entry = raw.entry
  if (typeof entry !== 'string' || entry.length === 0) {
    problems.push({ at: `${at}.entry`, message: 'missing' })
    return undefined
  }
  if (!runsInSketch(entry)) {
    // A shader cannot be the main file - it is carried, not evaluated.
    problems.push({ at: `${at}.entry`, message: 'must be a .js file' })
    return undefined
  }
  if (!Object.hasOwn(files, entry)) {
    // Named but not present - a rename that forgot the pointer, which is the
    // mistake this field exists to catch at parse time rather than as a
    // container that quietly runs everything except the main file.
    problems.push({ at: `${at}.entry`, message: `no file called "${entry}"` })
    return undefined
  }

  if (raw.stick !== undefined && typeof raw.stick !== 'boolean') {
    problems.push({ at: `${at}.stick`, message: 'true or absent' })
    return undefined
  }

  let timeline: { seconds: number } | undefined
  if (raw.timeline !== undefined) {
    const seconds = isObject(raw.timeline) ? raw.timeline.seconds : undefined
    // A minute of margin over any composition anybody has asked for, and a
    // ceiling because this number sizes a render job.
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > 600) {
      problems.push({ at: `${at}.timeline`, message: 'seconds, above zero, at most 600' })
      return undefined
    }
    timeline = { seconds }
  }

  // Any per-file problem above is fatal for the block as a whole. A sketch
  // missing one of its files is not a smaller sketch, it is a broken one -
  // running the survivors would throw somewhere far from the actual mistake.
  if (Object.keys(files).length !== entries.length) return undefined

  return {
    engine,
    entry,
    files,
    ...(timeline ? { timeline } : {}),
    ...(raw.stick === true ? { stick: true } : {}),
  }
}
