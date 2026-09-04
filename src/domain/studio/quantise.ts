/**
 * A stack of RGBA frames, as one palette and a stack of index maps.
 *
 * The half of a GIF that `gif.ts` does not do. That file writes whatever
 * palette it is handed; this one decides what the palette should be, which is
 * the whole of the quality question for a format with 256 colours in it.
 *
 * ---------------------------------------------------------------------------
 * One palette for every frame
 * ---------------------------------------------------------------------------
 * GIF allows a local table per frame and this deliberately does not use one.
 * A shot is one scene under one light for a second or two: the colours of frame
 * forty are the colours of frame one, so per-frame tables would be the same
 * table written thirty times, at 768 bytes each, and every one of them a chance
 * for two frames to disagree about what "the shirt" is and flicker.
 *
 * ---------------------------------------------------------------------------
 * Exact first, median cut second
 * ---------------------------------------------------------------------------
 * The art this exists for is flat-shaded: a block world with an outline pass
 * comes out of the renderer with tens of distinct colours, not thousands. So
 * the first thing this tries is *no quantisation at all* - if everything fits
 * in the table, every pixel keeps its exact colour and the GIF is lossless.
 *
 * Only when it does not fit does the median cut run: sort the box by its
 * longest channel, split at the median, repeat on the biggest box until there
 * are enough. It is the standard algorithm and it is chosen for the standard
 * reason - it puts its colours where the pixels actually are, which a fixed
 * cube palette cannot.
 *
 * ---------------------------------------------------------------------------
 * Alpha is a threshold, not a channel
 * ---------------------------------------------------------------------------
 * GIF has one see-through index and no partial alpha, so a soft edge cannot
 * survive the format. The choice is where to cut, and it is made at half:
 * anything less than half opaque disappears, anything more is drawn solid.
 *
 * That is why a transparent GIF of a rendered scene has a hard edge and the
 * WebP of the same take does not - see `webp-anim.ts`, which keeps the real
 * alpha channel. The GIF is the compatibility copy, and this is the price.
 */

/** Under this, a pixel is a hole. See the note above. */
const OPAQUE_AT = 128

export interface Quantised {
  /** Up to 256 entries, `[r, g, b]`, ready for `encodeGif`. */
  palette: [number, number, number][]
  /** One index map per input frame, row-major from the top. */
  frames: Uint8Array[]
  /**
   * The entry that means "see through", or null when nothing was transparent.
   *
   * Null rather than an unused index, so an opaque animation is written as an
   * opaque GIF: a transparent index nothing uses still costs every frame its
   * graphic control extension flag, and tells a decoder to keep a mask it does
   * not need.
   */
  transparent: number | null
}

/** How many colours are left for the picture once transparency has its own. */
const ROOM = 256

interface Box {
  /** Packed `0xRRGGBB` values, with how many pixels wanted each. */
  colours: { rgb: number; count: number }[]
  /** How many pixels the whole box speaks for. Split the biggest, not the widest. */
  weight: number
}

const red = (rgb: number) => (rgb >> 16) & 0xff
const green = (rgb: number) => (rgb >> 8) & 0xff
const blue = (rgb: number) => rgb & 0xff

/**
 * The channel this box is most spread along.
 *
 * Range rather than variance, which is what the original algorithm says and is
 * also the cheaper of the two - and the difference between them only shows up
 * on photographs, where one long tail can out-vary a wide spread.
 */
function widest(box: Box): (rgb: number) => number {
  let rLow = 255
  let rHigh = 0
  let gLow = 255
  let gHigh = 0
  let bLow = 255
  let bHigh = 0

  for (const { rgb } of box.colours) {
    const r = red(rgb)
    const g = green(rgb)
    const b = blue(rgb)
    if (r < rLow) rLow = r
    if (r > rHigh) rHigh = r
    if (g < gLow) gLow = g
    if (g > gHigh) gHigh = g
    if (b < bLow) bLow = b
    if (b > bHigh) bHigh = b
  }

  const spread = [rHigh - rLow, gHigh - gLow, bHigh - bLow]
  const most = Math.max(...spread)
  if (most === spread[0]) return red
  if (most === spread[1]) return green
  return blue
}

/** The colour that stands for a box: its pixels' average, not its middle. */
function averageOf(box: Box): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  for (const { rgb, count } of box.colours) {
    r += red(rgb) * count
    g += green(rgb) * count
    b += blue(rgb) * count
  }
  const weight = Math.max(1, box.weight)
  return [Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)]
}

function medianCut(
  counts: Map<number, number>,
  room: number,
): [number, number, number][] {
  const all: Box = { colours: [], weight: 0 }
  for (const [rgb, count] of counts) {
    all.colours.push({ rgb, count })
    all.weight += count
  }

  let boxes = [all]

  while (boxes.length < room) {
    /*
      The heaviest box that can still be cut.

      "Can still be cut" is not a guard against an empty list, it is the
      termination condition: a box holding one distinct colour splits into
      itself and nothing, forever. Without this the loop runs to `room` boxes
      only when the picture happens to have that many colours, and spins when it
      does not.
    */
    let biggest: Box | null = null
    for (const box of boxes) {
      if (box.colours.length < 2) continue
      if (!biggest || box.weight > biggest.weight) biggest = box
    }
    if (!biggest) break

    const along = widest(biggest)
    const sorted = [...biggest.colours].sort((a, b) => along(a.rgb) - along(b.rgb))

    // The median by *pixels*, not by distinct colours: one colour covering half
    // the frame should end up alone on its side of the cut.
    const half = biggest.weight / 2
    let carried = 0
    let at = 0
    while (at < sorted.length - 1 && carried + sorted[at].count < half) {
      carried += sorted[at].count
      at += 1
    }

    const left = sorted.slice(0, at + 1)
    const right = sorted.slice(at + 1)
    const weigh = (colours: Box['colours']) =>
      colours.reduce((total, one) => total + one.count, 0)

    boxes = boxes.filter((box) => box !== biggest)
    boxes.push({ colours: left, weight: weigh(left) })
    if (right.length > 0) boxes.push({ colours: right, weight: weigh(right) })
  }

  return boxes.map(averageOf)
}

/**
 * The palette entry closest to a colour, by squared distance in RGB.
 *
 * Plain RGB rather than a perceptual space, and that is a real approximation -
 * but the exact path above means this only runs on frames with more than 255
 * colours in them, where the palette is dense enough that the difference
 * between two nearest-neighbour metrics is under a colour step anyway.
 */
function nearest(palette: [number, number, number][], rgb: number): number {
  const r = red(rgb)
  const g = green(rgb)
  const b = blue(rgb)

  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < palette.length; i += 1) {
    const [pr, pg, pb] = palette[i]
    const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

/**
 * Turn frames of RGBA into one palette and a stack of index maps.
 *
 * Every frame must be the same length; they are frames of one animation and a
 * ragged stack is a caller bug rather than a case to handle.
 */
export function quantise(frames: readonly Uint8ClampedArray[]): Quantised {
  const counts = new Map<number, number>()
  let anyTransparent = false

  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += 4) {
      if (frame[i + 3] < OPAQUE_AT) {
        anyTransparent = true
        continue
      }
      const rgb = (frame[i] << 16) | (frame[i + 1] << 8) | frame[i + 2]
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1)
    }
  }

  const room = anyTransparent ? ROOM - 1 : ROOM

  /*
    Exact when it fits, and the order matters: `counts` is in first-seen order,
    so a palette built straight off it is stable between two runs of the same
    shot. A `Set` sorted by count would reshuffle whenever two colours tied.
  */
  const palette: [number, number, number][] =
    counts.size <= room
      ? [...counts.keys()].map((rgb) => [red(rgb), green(rgb), blue(rgb)])
      : medianCut(counts, room)

  const transparent = anyTransparent ? palette.length : null
  if (transparent !== null) palette.push([0, 0, 0])

  /*
    One lookup per distinct colour rather than per pixel.

    A 1200x1200 frame is 1.4 million pixels and `nearest` is a scan of up to 255
    entries; without this a five-second take is a billion comparisons and the
    tab stops answering. The map is at most 256 entries deep in the exact case
    and however many distinct colours the frame has in the other, which is the
    number this is already iterating anyway.
  */
  const lookup = new Map<number, number>()
  if (counts.size <= room) {
    ;[...counts.keys()].forEach((rgb, index) => lookup.set(rgb, index))
  }

  const indexed = frames.map((frame) => {
    const indices = new Uint8Array(frame.length / 4)
    for (let i = 0, p = 0; i < frame.length; i += 4, p += 1) {
      if (frame[i + 3] < OPAQUE_AT) {
        indices[p] = transparent ?? 0
        continue
      }
      const rgb = (frame[i] << 16) | (frame[i + 1] << 8) | frame[i + 2]
      let index = lookup.get(rgb)
      if (index === undefined) {
        index = nearest(palette.slice(0, room), rgb)
        lookup.set(rgb, index)
      }
      indices[p] = index
    }
    return indices
  })

  return { palette, frames: indexed, transparent }
}
