/**
 * A drawing, small enough to keep.
 *
 * The pen throws light and then forgets: strokes fade in a couple of seconds
 * and the only thing that survives is the *word* they spelled. A note is the
 * other half of that - the ink itself, written down, so it can be pinned to a
 * notice and played back to somebody who was not there.
 *
 * In `domain` rather than beside the pen, and the lint rule that insisted is
 * right: the board's command schema has to know how long a note may be, and the
 * domain may not import the app. What is here is the *format* - pure arithmetic
 * over numbers - while everything that draws it or captures it stays in
 * `app/world/_ink`.
 *
 * ---------------------------------------------------------------------------
 * Text, not bytes
 * ---------------------------------------------------------------------------
 * It goes in a text column beside a notice's words (see the board's
 * `image_slug` for the shape of that decision), so the format is a string, and
 * a readable one: a version tag, then a stroke per `|`, then integers. Anything
 * denser would need a decoder to debug and would save nothing that matters -
 * these are a few hundred numbers, and every transport between here and the
 * database compresses.
 *
 * ---------------------------------------------------------------------------
 * A thousand across, whatever the pad was
 * ---------------------------------------------------------------------------
 * Coordinates are stored against a 1000-wide box with the pad's own aspect
 * ratio recorded beside them, so a note drawn on a phone replays correctly in a
 * card on a desktop. Not normalised to the *drawing's* bounding box: where
 * somebody wrote on the pad is part of what they wrote, and a signature in the
 * corner that replays centred is a different picture.
 *
 * ---------------------------------------------------------------------------
 * Time is kept, roughly
 * ---------------------------------------------------------------------------
 * Each point carries the gap since the one before it, quantised to 8ms and
 * capped at a quarter of a second: replaying at a constant speed turns
 * handwriting into a plotter, and the pauses are most of what makes it look
 * like a hand - but a gap longer than the cap is a pause for thought, and
 * nobody watching a replay wants to sit through somebody else's.
 */

/** How the numbers are written down. Bumped if the shape below ever changes. */
const TAG = 'x1'

/** Milliseconds per unit of stored time, and the longest gap worth keeping. */
const TICK = 8
const LONGEST_GAP = 250

/** The width every note is stored against. Height follows the pad's shape. */
export const NOTE_WIDTH = 1000

/**
 * The most characters a note may take.
 *
 * A guard rather than a target: this is a column on somebody else's row, and a
 * pen left running on a laptop could otherwise post a novel. Around thirty
 * seconds of steady drawing.
 */
export const NOTE_LIMIT = 12000

/**
 * A point, declared here rather than imported from the pen.
 *
 * Two numbers, structurally identical to the pen's own `Pt`, which is what lets
 * the app hand its strokes straight over: TypeScript compares shapes, not
 * names, and the alternative is a domain module importing an app one.
 */
export interface Point {
  x: number
  y: number
}

export interface NoteStroke {
  /** Degrees round the wheel, as the pen drew it. */
  hue: number
  points: Point[]
  /** Milliseconds since the previous point; the first is since the stroke began. */
  gaps: number[]
}

export interface Note {
  /** Height of the box the strokes are stored against; the width is 1000. */
  height: number
  strokes: NoteStroke[]
}

export interface DrawnStroke {
  hue: number
  points: readonly Point[]
  /** `performance.now()` per point, as the pen recorded them. */
  times: readonly number[]
}

/**
 * Write the ink down.
 *
 * `box` is the pad it was drawn on, in CSS pixels, which is what turns pixels
 * into the stored thousand-wide space. Returns null for nothing worth keeping -
 * an empty pad, or a stray tap - because an empty note attached to a notice is
 * a picture frame with nothing in it.
 */
export function writeNote(
  strokes: readonly DrawnStroke[],
  box: { width: number; height: number },
): string | null {
  if (box.width <= 0 || box.height <= 0) return null

  const scale = NOTE_WIDTH / box.width
  const height = Math.round(box.height * scale)

  const parts: string[] = []
  /*
    The budget is spent as it is written rather than trimmed afterwards.

    A single long scribble has no stroke boundary to cut at - one drag can be
    the whole note - so cutting the finished string would leave either a
    truncated number or nothing at all. Stopping mid-stroke at a point boundary
    always leaves a shorter drawing of the same thing, which is the only kind of
    truncation worth having.
  */
  let spent = TAG.length + 8

  for (const stroke of strokes) {
    if (stroke.points.length < 2) continue
    if (spent >= NOTE_LIMIT) break

    const numbers: string[] = []
    let lastX = 0
    let lastY = 0
    let lastTime = stroke.times[0]

    for (let i = 0; i < stroke.points.length; i++) {
      const x = Math.round(stroke.points[i].x * scale)
      const y = Math.round(stroke.points[i].y * scale)
      const gap = Math.min(Math.max(stroke.times[i] - lastTime, 0), LONGEST_GAP)
      // Deltas after the first point: a stroke is a walk, and a walk is small
      // numbers.
      const step = `${x - lastX},${y - lastY},${Math.round(gap / TICK)}`
      spent += step.length + 1
      lastX = x
      lastY = y
      lastTime = stroke.times[i]
      if (spent >= NOTE_LIMIT) break
      numbers.push(step)
    }

    if (numbers.length >= 2) parts.push(`${Math.round(stroke.hue)}~${numbers.join('~')}`)
  }

  if (parts.length === 0) return null
  return `${TAG}|${height}|${parts.join('|')}`
}

/**
 * Read one back.
 *
 * Null for anything this cannot make sense of, and *not* an exception: a note
 * is a string off a row somebody else wrote, possibly by a version of this file
 * that no longer exists, and a card that cannot draw the picture should draw
 * the words instead of taking the page down.
 */
export function readNote(source: string | null | undefined): Note | null {
  if (!source) return null
  const parts = source.split('|')
  if (parts.length < 3 || parts[0] !== TAG) return null

  const height = Number(parts[1])
  if (!Number.isFinite(height) || height <= 0) return null

  const strokes: NoteStroke[] = []
  for (const part of parts.slice(2)) {
    const [head, ...steps] = part.split('~')
    const hue = Number(head)
    if (!Number.isFinite(hue) || steps.length < 2) continue

    const points: Point[] = []
    const gaps: number[] = []
    let x = 0
    let y = 0

    for (const step of steps) {
      const [dx, dy, dt] = step.split(',').map(Number)
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dt)) break
      x += dx
      y += dy
      points.push({ x, y })
      gaps.push(dt * TICK)
    }

    if (points.length >= 2) strokes.push({ hue, points, gaps })
  }

  return strokes.length > 0 ? { height, strokes } : null
}

/** How long a note takes to draw itself, in seconds. */
export function noteSeconds(note: Note): number {
  let total = 0
  for (const stroke of note.strokes) {
    for (const gap of stroke.gaps) total += gap
    // The beat between strokes, which is not recorded: the pen was up, and how
    // long somebody thought about the next one is not part of the drawing.
    total += 180
  }
  return total / 1000
}
