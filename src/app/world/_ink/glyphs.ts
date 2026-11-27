/**
 * The whole alphabet: a round one, a crossed one, and the family with a bowl
 * and a stem.
 *
 * Three letters is not a limitation, it is the design. A general handwriting
 * recogniser has to tell a `b` from a `6` and gets it wrong in front of
 * somebody who is standing in a room with their friends; this one only ever
 * answers three questions, so it can afford to be sure. `d`, `b` and `p` are
 * deliberately one answer - they are the same two parts assembled three ways,
 * telling them apart on a finger-drawn scrawl is guesswork, and all three mean
 * dance, so the guess would have no consequence but a wrong one.
 *
 * A letter may arrive as one stroke or as two, because people write both ways:
 * an X is nearly always two, a d is either, and an O is always one. So the
 * reader hands this function the last one or two strokes and it says what they
 * are together, if anything. `null` is the common answer and costs nothing -
 * ink that spells nothing is still ink.
 *
 * The fourth answer, `i`, is a plain upright stroke, and it only exists because
 * of what it is *next to*: a stem touching a ring is the d family, and the same
 * stem a hand's width away from the same ring is an `oi`. One shape, two
 * letters, told apart by distance - which is why `i` is deliberately strict
 * about being upright. A line at forty-five degrees is half an X, and if that
 * could also be an `i` then the first stroke of every X would be a letter on
 * its own and no X would ever be assembled.
 *
 * The fifth, `a`, is the bowl family again with a shorter stem - a ring with a
 * stroke down its right side that never climbs above it. It is there for one
 * word, `ai`, which calls the companion; see `isA` for where it stops and the
 * d begins.
 */

import {
  type Box,
  boxOf,
  lineAngleBetween,
  pathCrossing,
  pathLength,
  resample,
  type Stroke,
  straightness,
} from '@/app/world/_ink/points'
import { isLoop, isStem, lean, limbs, loopIn, reachOf } from '@/app/world/_ink/shapes'

export type Glyph = 'o' | 'x' | 'bowl' | 'i' | 'a'

/**
 * Under this, across the whole group, it is a tap or a flick rather than
 * handwriting. In screen pixels: a letter somebody meant is about a thumb
 * wide.
 */
const MIN_SIZE = 36

/** How far from square two crossing lines must be to read as a cross. */
const MIN_CROSS = (40 * Math.PI) / 180

/**
 * How far off vertical a stem may lean, in radians, for each of the two
 * letters that has one.
 *
 * The i is the stricter of the two because it stands alone: it has nothing
 * beside it to say what it is, and a lone diagonal is half an X. A bowl's stem
 * is anchored by the bowl, so it is allowed a hand's worth of slope - but not
 * forty-five degrees, because at forty-five degrees it is the first stroke of a
 * cross somebody happened to draw next to a ring, and a room that starts
 * dancing every time two letters are written near each other is worse than one
 * that occasionally misses a sloped d.
 */
const LEAN_I = (22 * Math.PI) / 180
const LEAN_STEM = (32 * Math.PI) / 180

/**
 * How far past the ring an a's stem may reach, as a share of the ring's height:
 * a little above (the pen lands a touch high) and rather more below (the
 * flick off the bottom). Past these it is a d or a p. See `isA`.
 *
 * The tail is the generous one because that is how people actually write it:
 * the first real a's anybody drew trailed well under the ring and came out as
 * p's. A p's stem is a whole ring-height of descender or more, so half of one
 * still leaves a clear gap between the two.
 */
const A_RISE = 0.3
const A_TAIL = 0.55

export function readGlyph(strokes: readonly Stroke[]): Glyph | null {
  if (strokes.length === 0 || strokes.length > 2) return null

  const drawn = strokes.map((stroke) => resample(stroke))
  if (drawn.some((stroke) => stroke.length < 4)) return null
  if (boxOf(drawn.flat()).size < MIN_SIZE) return null

  // Most specific first. A bowl and a stem contains a loop, so asking "is it an
  // O" first would answer yes to half the d's ever drawn.
  const bowl = bowlOf(drawn)
  if (bowl) return isA(bowl) ? 'a' : 'bowl'
  if (isCross(drawn)) return 'x'
  if (drawn.length === 1 && isLoop(drawn[0])) return 'o'
  if (drawn.length === 1 && isUpright(drawn[0])) return 'i'
  return null
}

/**
 * i - one stroke standing up.
 *
 * `isStem` is not enough here: a stem only has to be more down than across,
 * which a diagonal is, and a diagonal is half an X. So this asks for something
 * a hand would call *upright*, which no half of an X ever is.
 */
function isUpright(stroke: Stroke): boolean {
  return isStem(stroke) && lean(stroke) <= LEAN_I
}

/**
 * d, b, p - a round part with a long straight part standing next to it.
 *
 * Two shapes of the same letter:
 *
 * - **Two strokes**: the loop and the stem arrive separately, in either order,
 *   and the stem has to actually reach the bowl. Without that last test a
 *   circle here and a line over there is a letter, and a room where somebody
 *   drew two unrelated things starts dancing.
 * - **One stroke**: the finger never left the glass, so the bowl is the part
 *   of the stroke that comes back to itself (`loopIn`) and the stem is
 *   whichever end is left over. The longer end, because a one-stroke d has a
 *   short tail past the bowl as well as the stem before it.
 */
function bowlOf(strokes: Stroke[]): Bowl | null {
  if (strokes.length === 2) {
    const [first, second] = strokes
    const bowl = isLoop(first) ? first : isLoop(second) ? second : null
    if (!bowl) return null
    const stem = bowl === first ? second : first
    if (!isStem(stem) || lean(stem) > LEAN_STEM) return null

    const box = boxOf(bowl)
    if (pathLength(stem) < box.size * 0.55) return null
    return reachOf(stem, box) < box.size * 0.6 ? { stem, box } : null
  }

  const stroke = strokes[0]
  const loop = loopIn(stroke)
  if (!loop) return null

  const before = stroke.slice(0, loop.from + 1)
  const after = stroke.slice(loop.to)
  const stem = pathLength(before) >= pathLength(after) ? before : after
  if (!isStem(stem) || lean(stem) > LEAN_STEM) return null

  const box = boxOf(stroke.slice(loop.from, loop.to + 1))
  return pathLength(stem) >= box.size * 0.55 ? { stem, box } : null
}

/** A ring and the stem standing beside it, as `bowlOf` found them. */
interface Bowl {
  stem: Stroke
  box: Box
}

/**
 * a - the bowl family's short cousin: a ring with its stem on the right that
 * stays beside the ring rather than rising above it or dropping below it.
 *
 * Told apart from a d by *height*, the way a hand tells them apart: a d's stem
 * is an ascender and climbs well clear of the bowl, an a's starts about level
 * with the bowl's top. The margins are tight on purpose and lean towards the d -
 * an a that reads as a d dances, which is the old behaviour and harmless, where
 * a d that reads as an a silently stops the dance the book promises.
 *
 * Only the right-hand side: a stem down the left is a b or a p in every hand,
 * and those are the dancing letter.
 */
function isA({ stem, box }: Bowl): boolean {
  const top = Math.min(...stem.map((point) => point.y))
  const bottom = Math.max(...stem.map((point) => point.y))
  const middle = stem.reduce((sum, point) => sum + point.x, 0) / stem.length
  return (
    middle > box.cx &&
    top >= box.minY - box.height * A_RISE &&
    bottom <= box.maxY + box.height * A_TAIL
  )
}

/**
 * X - two lines that pass through each other.
 *
 * Through, not near: `pathCrossing` ignores segments that merely share an
 * endpoint, so a V and an L are not crosses however sharp the corner. The
 * angle test is what stops a doubled-back line - two strokes lying on top of
 * each other, crossing at three degrees - from spelling anything.
 *
 * One stroke is the same test on its own straight pieces, which is how a
 * scribbled x written without lifting the finger reads: the first limb and the
 * last one cross, and the join between them is not a crossing because they
 * share the corner.
 */
function isCross(strokes: Stroke[]): boolean {
  const lines =
    strokes.length === 2
      ? strokes.filter((stroke) => straightness(stroke) > 0.8)
      : limbs(strokes[0])

  if (lines.length < 2) return false

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (!pathCrossing(lines[i], lines[j])) continue
      if (lineAngleBetween(lines[i], lines[j]) >= MIN_CROSS) return true
    }
  }
  return false
}
