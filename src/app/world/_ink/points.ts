/**
 * The geometry every other file here stands on.
 *
 * A finger dragged across glass arrives as a list of pixels at irregular
 * intervals - fast where the hand was confident, bunched where it hesitated,
 * and at whatever rate the OS felt like delivering. Nothing downstream wants to
 * think about that, so this file turns a raw drag into something regular:
 * evenly spaced points, a box, and three numbers that say what the shape is
 * doing. The recogniser is then arithmetic on those numbers rather than a
 * guess about pointer events.
 *
 * Screen pixels throughout, y down, which is the coordinate system the events
 * arrive in and the one the ink is drawn back into. No normalising to a unit
 * square: half the decisions here are about *size* ("is this stem long
 * enough"), and a shape scaled to fill a box has thrown that away.
 */

export interface Pt {
  x: number
  y: number
}

/** A drag, from the moment the finger landed to the moment it left. */
export type Stroke = readonly Pt[]

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** How far the finger actually travelled, corners and all. */
export function pathLength(points: Stroke): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i])
  return total
}

/**
 * The same shape, walked at a constant step.
 *
 * Every predicate below counts points and sums angles, and both are lies on a
 * raw stroke: the slow corner of an X has forty samples in it and the fast
 * stretch either side has four, so an unresampled turn measures as a much
 * sharper one. This is the standard $1 resample, and it is the only reason the
 * thresholds in `glyphs.ts` can be constants rather than per-device tuning.
 */
export function resample(points: Stroke, count = 64): Pt[] {
  if (points.length < 2 || count < 2) return points.slice()

  const step = pathLength(points) / (count - 1)
  if (step === 0) return points.slice()

  const out: Pt[] = [points[0]]
  let carried = 0
  let previous = points[0]

  for (let i = 1; i < points.length; i++) {
    const target = points[i]
    let span = dist(previous, target)

    // A single long segment can hold several output points, so this is a loop
    // rather than an `if`: a flick across the screen is two samples.
    while (carried + span >= step && span > 0) {
      const ratio = (step - carried) / span
      const cut = {
        x: previous.x + ratio * (target.x - previous.x),
        y: previous.y + ratio * (target.y - previous.y),
      }
      out.push(cut)
      previous = cut
      span = dist(previous, target)
      carried = 0
    }

    carried += span
    previous = target
  }

  // Floating point loses the last point about half the time. It is the end of
  // the stroke, and "did the finger come back to where it started" is decided
  // on it, so it is put back rather than left to rounding.
  while (out.length < count) out.push(points[points.length - 1])
  return out.slice(0, count)
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
  /** The longer side. What "big enough to mean something" is measured in. */
  size: number
  cx: number
  cy: number
}

export function boxOf(points: Stroke): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  const width = maxX - minX
  const height = maxY - minY
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    size: Math.max(width, height),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

/**
 * Chord over path: 1 is a ruler, 0 is a shape that came back to where it
 * started.
 *
 * One number does both jobs the recogniser needs - "is this a stem" (high) and
 * "is this closed" (low) - because they are the same question asked from the
 * two ends. Anything in the middle is a curve, and a curve is neither of the
 * things this alphabet is made of.
 */
export function straightness(points: Stroke): number {
  const length = pathLength(points)
  if (length === 0) return 1
  return dist(points[0], points[points.length - 1]) / length
}

/** An angle folded into (-π, π], so a turn past the top is not a turn back. */
export function wrap(angle: number): number {
  let out = angle
  while (out <= -Math.PI) out += 2 * Math.PI
  while (out > Math.PI) out -= 2 * Math.PI
  return out
}

/**
 * How far round the shape goes, signed, in radians.
 *
 * ±2π is a lap, and that is the whole test for an O. Signed rather than
 * absolute because the sign is what separates a circle from a hand that
 * wandered up and back down again: the wanderer's turns cancel, the circle's
 * accumulate.
 */
export function turning(points: Stroke): number {
  let total = 0
  let previous: number | null = null
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    if (dx === 0 && dy === 0) continue
    const heading = Math.atan2(dy, dx)
    if (previous !== null) total += wrap(heading - previous)
    previous = heading
  }
  return total
}

/** The straight line from the first point to the last, as an angle. */
export function chordAngle(points: Stroke): number {
  const last = points[points.length - 1]
  return Math.atan2(last.y - points[0].y, last.x - points[0].x)
}

/**
 * The smaller angle between two lines, ignoring which way each was drawn.
 *
 * Both halves of an X can be drawn in either direction, and half the people who
 * draw one start at the bottom. Folding to (0, π/2] means the cross is measured
 * rather than the handwriting.
 */
export function lineAngleBetween(a: Stroke, b: Stroke): number {
  const between = Math.abs(wrap(chordAngle(a) - chordAngle(b)))
  return between > Math.PI / 2 ? Math.PI - between : between
}

/**
 * Where two segments cross, or null.
 *
 * Endpoints touching do not count - the `> 0 && < 1` is deliberate. Two strokes
 * that meet at their tips are a corner, which is a V; an X is two strokes that
 * pass *through* each other.
 */
export function crossing(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const ax = a2.x - a1.x
  const ay = a2.y - a1.y
  const bx = b2.x - b1.x
  const by = b2.y - b1.y
  const denominator = ax * by - ay * bx
  if (denominator === 0) return null

  const t = ((b1.x - a1.x) * by - (b1.y - a1.y) * bx) / denominator
  const u = ((b1.x - a1.x) * ay - (b1.y - a1.y) * ax) / denominator
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null

  return { x: a1.x + t * ax, y: a1.y + t * ay }
}

/** Where two polylines cross, or null. The first crossing found is enough. */
export function pathCrossing(a: Stroke, b: Stroke): Pt | null {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const hit = crossing(a[i - 1], a[i], b[j - 1], b[j])
      if (hit) return hit
    }
  }
  return null
}
