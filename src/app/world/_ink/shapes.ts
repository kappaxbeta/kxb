/**
 * The parts an alphabet of five letters is actually made of: straight runs,
 * loops and stems.
 *
 * This sits between the geometry and the letters on purpose. `glyphs.ts` reads
 * as a description of handwriting - "a bowl with a stem beside it", "two lines
 * that cross" - because the nouns in those sentences are functions here. Put
 * the two together and every threshold in the file would be surrounded by
 * trigonometry, and nobody would ever dare move one.
 *
 * Everything here expects a *resampled* stroke (see `resample`), because every
 * threshold is stated in points or in radians per point.
 */

import {
  type Box,
  boxOf,
  dist,
  type Pt,
  pathLength,
  straightness,
  type Stroke,
  turning,
} from '@/app/world/_ink/points'

/**
 * A stroke cut into its straight pieces.
 *
 * Greedy, and that is the point: it walks forward while the piece it is
 * holding still reads as a line and cuts the moment it stops, which puts the
 * cut at the corner rather than somewhere near it. A circle comes back as many
 * short pieces - it has no corners, so every cut is arbitrary - which is why
 * every caller filters by length before believing a piece means anything.
 */
export function runs(points: Stroke, minStraight = 0.94): Pt[][] {
  if (points.length < 3) return points.length ? [points.slice()] : []

  const out: Pt[][] = []
  let start = 0

  for (let end = start + 2; end < points.length; end++) {
    if (straightness(points.slice(start, end + 1)) >= minStraight) continue
    out.push(points.slice(start, end))
    // The corner belongs to both pieces: a stroke cut at a point loses the
    // segment through it, and that segment is where the crossing usually is.
    start = end - 1
  }

  out.push(points.slice(start))
  return out.filter((run) => run.length >= 2)
}

/** The pieces long enough to be a letter's limb rather than a wobble. */
export function limbs(points: Stroke, share = 0.22): Pt[][] {
  const floor = pathLength(points) * share
  return runs(points).filter((run) => pathLength(run) >= floor)
}

/**
 * Whether a stroke is one closed round thing.
 *
 * Two conditions, because either one alone is a different shape: a lap of
 * turning without the ends meeting is a spiral, and the ends meeting without a
 * lap is a leaf - a there-and-back that folds over itself. Neither is an O.
 *
 * The aspect test is what keeps a fat X or a scribbled cloud out. It is
 * generous either way (a hand draws tall Os), just not a slot.
 */
export function isLoop(points: Stroke, minSize = 24): boolean {
  if (points.length < 8) return false
  const box = boxOf(points)
  if (box.size < minSize) return false

  const aspect = box.width / Math.max(box.height, 1)
  if (aspect < 0.3 || aspect > 3.2) return false

  const closure = dist(points[0], points[points.length - 1]) / box.size
  return closure < 0.45 && Math.abs(turning(points)) > 1.3 * Math.PI
}

/**
 * Whether a stroke is a stem: long, straight, and more down than across.
 *
 * The uprightness matters more than it looks. Without it the second half of an
 * X is a stem, the two would-be letters overlap, and which one you got would
 * depend on the order the tests happen to run in. A d, b or p has a stem you
 * could hang a plumb line on; a diagonal is a different letter's business.
 */
export function isStem(points: Stroke, minLength = 30): boolean {
  if (points.length < 2) return false
  const first = points[0]
  const last = points[points.length - 1]
  if (dist(first, last) < minLength) return false
  if (straightness(points) < 0.8) return false
  return Math.abs(last.y - first.y) > Math.abs(last.x - first.x)
}

/**
 * How far a stroke leans off vertical, in radians, ignoring which way it was
 * drawn. 0 is a plumb line, π/2 is flat.
 *
 * The one measurement that keeps the alphabet apart. A d's stem, an i and the
 * arm of an X are all "long, straight, more down than across"; what separates
 * the first two from the third is that nobody draws an X arm anywhere near
 * upright, and nobody draws a stem anywhere near forty-five degrees.
 */
export function lean(points: Stroke): number {
  const first = points[0]
  const last = points[points.length - 1]
  const off = Math.abs(Math.atan2(last.x - first.x, last.y - first.y))
  return off > Math.PI / 2 ? Math.PI - off : off
}

/** How far a point sits outside a box; 0 when it is inside it. */
export function distanceToBox(point: Pt, box: Box): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX)
  const dy = Math.max(box.minY - point.y, 0, point.y - box.maxY)
  return Math.hypot(dx, dy)
}

/** The closest a stroke comes to a box. */
export function reachOf(points: Stroke, box: Box): number {
  let closest = Infinity
  for (const point of points) closest = Math.min(closest, distanceToBox(point, box))
  return closest
}

/**
 * The part of a stroke that comes back to itself, if there is one.
 *
 * This is what makes a d written without lifting the finger readable: the
 * bowl and the stem arrive as one list of points, and the only thing that
 * distinguishes the bowl is that it *returns* - some later point lands back
 * near an earlier one having turned most of a lap on the way.
 *
 * The longest such span wins, because the stroke usually offers several: the
 * top of a p passes near its own start twice, and taking the first would cut
 * the bowl in half.
 */
export function loopIn(points: Stroke, minSpan = 8): { from: number; to: number } | null {
  const box = boxOf(points)
  const near = Math.max(box.size * 0.2, 12)

  let best: { from: number; to: number } | null = null

  for (let from = 0; from + minSpan < points.length; from++) {
    for (let to = points.length - 1; to - from >= minSpan; to--) {
      if (best && to - from <= best.to - best.from) break
      if (dist(points[from], points[to]) > near) continue
      const span = points.slice(from, to + 1)
      if (!isLoop(span)) continue
      best = { from, to }
      break
    }
  }

  return best
}
