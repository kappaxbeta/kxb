import { isBuildable } from '@/domain/builder/catalogue'
import {
  type BuilderWorld,
  DEFAULT_WORLD,
  parseWorld,
  type Placement,
} from '@/domain/builder/world'

/**
 * A whole world, small enough to paste into a message.
 *
 * The studio puts its scene in the query string and the note in
 * `@/domain/studio/scene` explains why that is right - for a scene. It does not
 * survive contact with a built world: one drag of the wall tool is four hundred
 * placements, and `JSON.stringify` of those is thirty kilobytes before it is
 * base64'd into forty. Which is why the builder's *own* document is a file (see
 * `./world`).
 *
 * But "send the customer a link" is a different requirement from "keep my
 * work", and it deserves a different answer than a table would give it: a
 * shared world is read-only, disposable, and wanted five minutes from now, so
 * paying for a migration, a row, a token and a cleanup story to serve it is the
 * wrong shape. What it needs is for the document to get small.
 *
 * ---------------------------------------------------------------------------
 * Why run-length and not gzip
 * ---------------------------------------------------------------------------
 * `CompressionStream` is in every browser and would do better than this on raw
 * bytes. It is also absent from the runtime the tests run in, which would make
 * the one piece of this feature where a bug silently eats somebody's world the
 * one piece that cannot be tested. Worse, it compresses the *encoding* rather
 * than the data - and the data is enormously structured, so a codec that knows
 * what it is looking at beats a general one that does not.
 *
 * What it knows: a built world is runs. A wall is a hundred cells of one model
 * in a straight line, a floor is a rectangle of one model, and a room is four
 * walls. So placements are grouped by what they are (model, turn and size),
 * then by row, and each row is stored as the runs along it - a hundred-cell
 * wall is four numbers rather than a hundred records. Real worlds come out
 * twenty to fifty times smaller, which is the difference between a link and an
 * apology.
 *
 * The honest cost is that a world of scattered single blocks compresses barely
 * at all. `shareLink` checks the length it actually produced rather than
 * assuming, and the editor offers the file instead when it is too long - see
 * `MAX_SHARE_LENGTH`.
 */

const VERSION = 'b1'

/** Not in base36's alphabet, and untouched by URL encoding. */
const SEPARATOR = '.'

/**
 * Signed integers as base36, via zigzag.
 *
 * Zigzag rather than a sign character because every number here is a delta and
 * roughly half of them are negative - and a sign character would be a second
 * symbol in a stream whose whole point is to be one symbol per token.
 */
function toToken(value: number): string {
  const rounded = Math.round(value)
  const zigzag = rounded >= 0 ? rounded * 2 : -rounded * 2 - 1
  return zigzag.toString(36)
}

function fromToken(token: string): number {
  const zigzag = Number.parseInt(token, 36)
  if (!Number.isFinite(zigzag) || zigzag < 0) return 0
  return zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2
}

/** base64url, so the code survives being pasted into anything. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

/** A run of identical cells along x, at one (y, z). */
interface Run {
  x: number
  length: number
}

/** Everything sharing a model, a turn and a size. */
interface Group {
  model: string
  rotation: number
  scale: number
  rows: { y: number; z: number; runs: Run[] }[]
}

/**
 * Placements, folded into groups of rows of runs.
 *
 * Exported for the tests, which is the only reason it is not inlined: the
 * folding is where a world would get quietly mangled, and checking it against
 * the placements it came from is a stronger test than round-tripping a string.
 */
export function toGroups(placements: readonly Placement[]): Group[] {
  const byKind = new Map<string, Placement[]>()

  for (const placement of placements) {
    // Rotation and size join the key because they are per-placement but almost
    // never vary - so grouping on them costs nothing in the common case and
    // means the uncommon one needs no special handling at all.
    const key = `${placement.model}|${placement.rotation}|${placement.scale}`
    const list = byKind.get(key)
    if (list) list.push(placement)
    else byKind.set(key, [placement])
  }

  const groups: Group[] = []

  for (const list of byKind.values()) {
    const sorted = [...list].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)
    const rows: Group['rows'] = []

    for (const placement of sorted) {
      const row = rows.at(-1)
      const last = row?.runs.at(-1)

      if (row && row.y === placement.y && row.z === placement.z && last) {
        // Contiguous with the run we are in, so extend it rather than start a
        // new one. This is the entire compression.
        if (last.x + last.length === placement.x) {
          last.length += 1
          continue
        }
        row.runs.push({ x: placement.x, length: 1 })
        continue
      }

      rows.push({ y: placement.y, z: placement.z, runs: [{ x: placement.x, length: 1 }] })
    }

    groups.push({
      model: list[0].model,
      rotation: list[0].rotation,
      scale: list[0].scale,
      rows,
    })
  }

  return groups
}

/** The inverse: groups back into one placement per cell. */
function fromGroups(groups: Group[]): Placement[] {
  const out: Placement[] = []
  for (const group of groups) {
    for (const row of group.rows) {
      for (const run of row.runs) {
        for (let step = 0; step < run.length; step += 1) {
          out.push({
            model: group.model,
            x: run.x + step,
            y: row.y,
            z: row.z,
            rotation: group.rotation,
            scale: group.scale,
          })
        }
      }
    }
  }
  return out
}

/**
 * The world as a code.
 *
 * Three sections, separated by `~`: the version, the metadata as base64url'd
 * JSON, and the placements as a token stream. The metadata is left as JSON
 * because it is a couple of hundred bytes whatever happens to it, and keeping
 * it readable means `parseWorld` can validate it on the way back in without
 * this module duplicating every bound.
 *
 * The token stream is count-prefixed at every level rather than delimited,
 * which is what lets the whole thing be one separator with no escaping: read a
 * count, read that many, move on.
 */
export function encodeWorld(world: BuilderWorld): string {
  const groups = toGroups(world.placements)
  const palette = [...new Set(groups.map((group) => group.model))]
  const indexOf = new Map(palette.map((model, index) => [model, index]))

  const meta = {
    n: world.name,
    w: world.width,
    h: world.height,
    c: world.camera,
    g: world.ground,
    l: world.light,
    b: world.background,
    p: palette,
  }

  const tokens: string[] = [toToken(groups.length)]

  for (const group of groups) {
    tokens.push(
      toToken(indexOf.get(group.model) ?? 0),
      toToken(group.rotation),
      // Scale is the one fractional value in the stream. Two decimal places is
      // finer than the editor's own stepper offers.
      toToken(group.scale * 100),
      toToken(group.rows.length),
    )

    let previousY = 0
    let previousZ = 0

    for (const row of group.rows) {
      // Deltas, because rows are sorted - so consecutive rows are almost always
      // one apart and almost every one of these is a single character.
      tokens.push(toToken(row.y - previousY), toToken(row.z - previousZ), toToken(row.runs.length))
      previousY = row.y
      previousZ = row.z

      let cursor = 0
      for (const run of row.runs) {
        tokens.push(toToken(run.x - cursor), toToken(run.length))
        cursor = run.x + run.length
      }
    }
  }

  return `${VERSION}~${toBase64Url(JSON.stringify(meta))}~${tokens.join(SEPARATOR)}`
}

/**
 * A world from whatever was in the link.
 *
 * Never throws. The input is a URL, which is to say a thing people truncate,
 * and a viewer that shows a stack trace because a base64 tail got cut off is
 * worse than one that shows an empty world - see the same argument in the
 * studio's decoder. Every model still goes through `parseWorld`'s allow-list on
 * the way out, so a hand-crafted link cannot name a file we do not ship.
 */
export function decodeWorld(code: string | undefined | null): BuilderWorld {
  if (!code) return DEFAULT_WORLD

  try {
    const [version, encodedMeta, body] = code.split('~')
    if (version !== VERSION || !encodedMeta) return DEFAULT_WORLD

    const meta = JSON.parse(fromBase64Url(encodedMeta)) as Record<string, unknown>
    const palette = Array.isArray(meta.p) ? (meta.p as unknown[]) : []

    const tokens = body ? body.split(SEPARATOR) : []
    let cursor = 0
    const next = () => fromToken(tokens[cursor++] ?? '0')

    const groups: Group[] = []
    const groupCount = next()

    for (let index = 0; index < groupCount; index += 1) {
      // A truncated code runs out of tokens here. Stopping returns the part of
      // the world that did arrive, which is a more useful failure than nothing.
      if (cursor >= tokens.length) break

      const model = palette[next()]
      const rotation = next()
      const scale = next() / 100
      const rowCount = next()

      const rows: Group['rows'] = []
      let y = 0
      let z = 0

      for (let row = 0; row < rowCount; row += 1) {
        y += next()
        z += next()
        const runCount = next()

        const runs: Run[] = []
        let runCursor = 0
        for (let run = 0; run < runCount; run += 1) {
          const x = runCursor + next()
          const length = next()
          // A length of zero or less would either draw nothing or, negated,
          // loop backwards forever in `fromGroups`.
          if (length > 0) runs.push({ x, length })
          runCursor = x + Math.max(0, length)
        }

        rows.push({ y, z, runs })
      }

      // Checked here as well as in `parseWorld` so a bad palette entry costs
      // its own group rather than being expanded into thousands of placements
      // that are then all thrown away one at a time.
      if (typeof model === 'string' && isBuildable(model)) {
        groups.push({ model, rotation, scale, rows })
      }
    }

    return parseWorld({
      name: meta.n,
      width: meta.w,
      height: meta.h,
      camera: meta.c,
      ground: meta.g,
      light: meta.l,
      background: meta.b,
      placements: fromGroups(groups),
    })
  } catch {
    return DEFAULT_WORLD
  }
}

/**
 * The longest code we will hand somebody as a link.
 *
 * The binding limit is not the browser - Chrome's own is around two megabytes -
 * it is the server at the other end. Node caps the whole request head at 16 kB
 * by default and the request line counts towards it, so a link past that is
 * refused before Next sees it. Chat clients that wrap and truncate long URLs
 * are the second, softer limit.
 *
 * Eight thousand characters sits comfortably inside both and leaves room for
 * the rest of the headers. A world that does not fit gets the file instead,
 * said out loud rather than discovered when the customer opens an empty page.
 */
export const MAX_SHARE_LENGTH = 8000

/** Where a shared world is viewed. */
export function shareUrl(world: BuilderWorld, origin: string): string {
  return `${origin}/w?d=${encodeWorld(world)}`
}

/** Whether this world can be a link at all, and how close to the edge it is. */
export function shareSize(world: BuilderWorld): { length: number; fits: boolean } {
  const length = encodeWorld(world).length
  return { length, fits: length <= MAX_SHARE_LENGTH }
}
