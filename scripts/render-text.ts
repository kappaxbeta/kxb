/**
 * Writes a word in the block font as a picture.
 *
 *     bun run scripts/render-text.ts "HELLO"
 *     bun run scripts/render-text.ts "HELLO" --style=plop --out=hello.gif
 *     bun run scripts/render-text.ts "NEW LEVEL" --style=envelope --colour=#ffd166
 *
 * A still PNG by default, an animated GIF when `--style` names one of the
 * reveals below.
 *
 * ---------------------------------------------------------------------------
 * Why it draws with the builder's alphabet rather than a font file
 * ---------------------------------------------------------------------------
 * `public/font` has two pixel typefaces and either would give more letters than
 * `@/domain/builder/glyphs` has. They would also give *different* letters: a
 * word stamped into a world out of blocks and the same word rendered here would
 * be two different pictures of the same thing, which is the one outcome worth
 * ruling out - a title card over a screenshot of the wordmark it is titling
 * should be the same shapes.
 *
 * Rasterising a TTF also drags in a text stack whose output depends on which
 * hinting and smoothing the machine does, and the note at the top of `glyphs`
 * already made that argument once. The alphabet is what it is; a character it
 * has no drawing for leaves its space blank and says so on the way out.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { letterColumns, textBitmap, unsupportedCharacters } from '../src/domain/builder/glyphs'
import { encodeGif, type Frame } from './gif'
import { encodePng } from './png'

const ROOT = path.join(import.meta.dir, '..')

/**
 * How the word arrives.
 *
 * Three, because "animate the letters" turned out to mean three different
 * pictures and picking one for somebody would have been picking wrong twice.
 * They are listed here rather than built into one parameterised reveal because
 * they genuinely differ in kind: one is about *time*, one is about *shape*, and
 * one is about a thing that is not the letters at all.
 *
 *   `none`     - a still. The default, and what a wordmark usually wants.
 *   `reveal`   - the letters arrive one after another, left to right. A
 *                typewriter, a title card, a name being spelled out.
 *   `plop`     - every letter scales in past its size and settles, staggered.
 *                The galaxy's own curve, reused: see `scripts/build-galaxy.ts`,
 *                where the argument for overshooting rather than easing is
 *                made at length. A word that *lands*.
 *   `envelope` - a letter, in the other sense. A closed envelope, its flap
 *                swinging open, and the word rising out of it.
 */
const STYLES = ['none', 'reveal', 'plop', 'envelope'] as const
type Style = (typeof STYLES)[number]

/** How big one font cell is drawn, in image pixels. */
const PIXEL = 8

/** A margin, so a letter never touches the edge of the picture. */
const PAD = PIXEL * 2

const FPS = 20

// ---------------------------------------------------------------------------
// A tiny canvas of palette indices
// ---------------------------------------------------------------------------

/**
 * The palette. Fixed and small, which is what a pixel picture wants.
 *
 * Index 0 is transparent everywhere - GIF has one transparent index rather than
 * an alpha channel, and a pixel font needs exactly one.
 */
const CLEAR = 0
const INK = 1
const SHADE = 2
const PAPER = 3
const FOLD = 4

interface Canvas {
  width: number
  height: number
  data: Uint8Array
}

function canvas(width: number, height: number): Canvas {
  return { width, height, data: new Uint8Array(width * height).fill(CLEAR) }
}

function fill(target: Canvas, x0: number, y0: number, w: number, h: number, colour: number): void {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(target.height, Math.round(y0 + h)); y += 1) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(target.width, Math.round(x0 + w)); x += 1) {
      target.data[y * target.width + x] = colour
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing the word
// ---------------------------------------------------------------------------

interface Word {
  cells: boolean[]
  width: number
  height: number
  letters: { from: number; width: number }[]
}

/**
 * One letter, drawn into the canvas at a size and an offset.
 *
 * Its own function because two of the three styles need to draw a letter
 * somewhere other than where it belongs: `plop` draws it scaled about its own
 * middle, and `envelope` draws it lifted. Scaling is nearest-neighbour and
 * deliberately so - this is pixel art, and a filtered edge on a five-by-seven
 * letter is a blurred letter rather than a smooth one.
 */
function drawLetter(
  target: Canvas,
  word: Word,
  index: number,
  options: { scale?: number; dx?: number; dy?: number; colour?: number } = {},
): void {
  const letter = word.letters[index]
  if (!letter) return
  const scale = options.scale ?? 1
  const dx = options.dx ?? 0
  const dy = options.dy ?? 0
  const colour = options.colour ?? INK
  if (scale <= 0) return

  // About the letter's own centre, so a letter growing gets bigger in place
  // rather than growing off its right-hand side.
  const cx = letter.from + letter.width / 2
  const cy = word.height / 2

  for (let y = 0; y < word.height; y += 1) {
    for (let x = letter.from; x < letter.from + letter.width; x += 1) {
      if (x >= word.width || !word.cells[y * word.width + x]) continue

      const px = cx + (x - cx) * scale
      const py = cy + (y - cy) * scale
      fill(
        target,
        PAD + (px + dx) * PIXEL,
        PAD + (py + dy) * PIXEL,
        // Ceil, so neighbouring source pixels overlap rather than leaving a
        // seam of background between them at fractional scales.
        Math.ceil(PIXEL * scale),
        Math.ceil(PIXEL * scale),
        colour,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// The reveals
// ---------------------------------------------------------------------------

/** The plop curve, as `build-galaxy.ts` shapes it. See there for the why. */
function swellAt(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return 1 - Math.exp(-4.6 * t) * Math.cos(9.4 * t)
}

function framesFor(
  style: Style,
  word: Word,
  size: { width: number; height: number },
  layout: { cells: { w: number; h: number }; envelope: { w: number; h: number }; inset: number },
): Frame[] {
  const frames: Frame[] = []
  const letters = word.letters.length
  const delayCs = Math.round(100 / FPS)

  if (style === 'reveal') {
    // Two frames a letter, plus a held tail so a loop does not snap straight
    // back to an empty picture the instant the last letter lands.
    for (let step = 0; step <= letters + 8; step += 1) {
      const frame = canvas(size.width, size.height)
      const shown = Math.min(letters, Math.floor(step / 1))
      for (let i = 0; i < shown; i += 1) drawLetter(frame, word, i, { dx: layout.inset })
      frames.push({ indices: frame.data, delayCs: delayCs * 2 })
    }
    return frames
  }

  if (style === 'plop') {
    const perLetter = 0.55
    // Each letter starts a little after the one before it, and the clip runs
    // until the last one has finished its own curve.
    const stagger = 0.09
    const total = perLetter + stagger * Math.max(0, letters - 1) + 0.4
    const count = Math.round(total * FPS)

    for (let f = 0; f <= count; f += 1) {
      const t = f / FPS
      const frame = canvas(size.width, size.height)
      for (let i = 0; i < letters; i += 1) {
        const local = (t - i * stagger) / perLetter
        const scale = swellAt(local)
        // A letter still at nothing has not started; one past its curve is
        // simply at rest, which `swellAt` already clamps to exactly 1.
        if (scale > 0) drawLetter(frame, word, i, { scale, dx: layout.inset })
      }
      frames.push({ indices: frame.data, delayCs })
    }
    return frames
  }

  // --- envelope ------------------------------------------------------------
  //
  // Drawn rather than composed from art: an envelope is a rectangle, a flap and
  // a shadow, and all three are cheaper as arithmetic than as pixels somebody
  // has to keep in the repo.
  const body = layout.envelope
  const left = (layout.cells.w - body.w) / 2
  const top = layout.cells.h - body.h
  const total = 2.4
  const count = Math.round(total * FPS)

  for (let f = 0; f <= count; f += 1) {
    const t = f / FPS
    const frame = canvas(size.width, size.height)

    /*
      Three beats over one clock: the flap swings up, the word climbs out, the
      picture holds. Written as clamped ramps rather than as a state machine so
      there is a single place that says how long anything takes, and so two
      beats can overlap - the word starts moving before the flap has finished,
      which is what stops it reading as two separate animations played in turn.
    */
    const opening = Math.max(0, Math.min(1, (t - 0.25) / 0.55))
    const rising = Math.max(0, Math.min(1, (t - 0.65) / 0.95))

    // Eased out, so it slows as it arrives rather than stopping dead. It ends
    // one row clear of the envelope's top edge.
    const travel = body.h + word.height - 1
    const lift = (1 - (1 - rising) ** 3) * travel

    if (rising > 0) {
      for (let i = 0; i < letters; i += 1) {
        drawLetter(frame, word, i, { dx: layout.inset, dy: top + 2 - lift })
      }
    }

    // The envelope goes on top of the word, so the word comes out from *inside*
    // it rather than in front of it. That is the whole illusion and it costs
    // nothing but the order of two draws.
    fill(frame, PAD + left * PIXEL, PAD + top * PIXEL, body.w * PIXEL, body.h * PIXEL, PAPER)
    // Its edges.
    fill(frame, PAD + left * PIXEL, PAD + top * PIXEL, body.w * PIXEL, PIXEL, SHADE)
    fill(frame, PAD + left * PIXEL, PAD + (top + body.h - 1) * PIXEL, body.w * PIXEL, PIXEL, SHADE)
    fill(frame, PAD + left * PIXEL, PAD + top * PIXEL, PIXEL, body.h * PIXEL, SHADE)
    fill(frame, PAD + (left + body.w - 1) * PIXEL, PAD + top * PIXEL, PIXEL, body.h * PIXEL, SHADE)

    /*
      The flap, as rows of a triangle that flattens as it opens.

      Closed, it is a full-depth V reaching half way down the envelope - which
      is what the front of an envelope looks like. Open, it has collapsed to a
      single row along the top edge, which reads as the flap standing up behind
      it. Interpolating the *depth* rather than rotating anything is what keeps
      this a pixel drawing at every frame instead of a rotated bitmap.
    */
    const depth = Math.max(1, Math.round((body.h / 2) * (1 - opening)))
    for (let row = 0; row < depth; row += 1) {
      const inset = Math.round((row / depth) * (body.w / 2 - 1))
      fill(
        frame,
        PAD + (left + inset) * PIXEL,
        PAD + (top + row) * PIXEL,
        (body.w - inset * 2) * PIXEL,
        PIXEL,
        // Lighter once it is mostly open, so the flap reads as its back face.
        opening > 0.55 ? FOLD : SHADE,
      )
    }

    frames.push({ indices: frame.data, delayCs })
  }

  return frames
}

// ---------------------------------------------------------------------------

function hex(value: string): [number, number, number] {
  const clean = value.replace('#', '')
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function main(): void {
  const args = process.argv.slice(2)
  const text = args.find((arg) => !arg.startsWith('--')) ?? 'HELLO'
  const flag = (name: string): string | undefined =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=')

  const style = (flag('style') ?? 'none') as Style
  if (!STYLES.includes(style)) {
    console.error(`Unknown style "${style}". One of: ${STYLES.join(', ')}`)
    process.exit(1)
  }

  const scale = Math.max(1, Number(flag('scale') ?? 1))
  const colour = hex(flag('colour') ?? '#eaf0ff')
  const out = path.resolve(ROOT, flag('out') ?? `text-${style}.${style === 'none' ? 'png' : 'gif'}`)

  const missing = unsupportedCharacters(text)
  if (missing.length > 0) {
    // Named rather than refused: a word with one unknown character in it still
    // draws, with a gap where that character was, and knowing which one it was
    // is the difference between a bug report and a typo.
    console.warn(`  no glyph for: ${missing.join(' ')} — left blank`)
  }

  const bitmap = textBitmap(text, { scale })
  const word: Word = { ...bitmap, letters: letterColumns(text, { scale }) }
  if (word.width === 0) {
    console.error('Nothing to draw.')
    process.exit(1)
  }

  /*
    How big the picture is, which each style answers differently.

    The word is not the thing to size the canvas by. `plop` overshoots past its
    own bounds and would clip on the first frame; `envelope` has to hold an
    object that is *wider* than the word it contains, and sizing to the word
    made the envelope exactly full-bleed - a white bar across the picture rather
    than a thing sitting in it. So each style says what it needs and the word is
    placed inside that.
  */
  const envelope = { w: word.width + 6, h: Math.max(word.height + 3, 9) }
  const overshoot = style === 'plop' ? Math.ceil(word.height * 0.2) : 0

  const cells =
    style === 'envelope'
      ? { w: envelope.w + 4, h: envelope.h + word.height + 5 }
      : { w: word.width + overshoot * 2, h: word.height + overshoot * 2 }

  const size = { width: cells.w * PIXEL + PAD * 2, height: cells.h * PIXEL + PAD * 2 }

  // What the word has to shift by to sit in the middle of that.
  const inset = (cells.w - word.width) / 2

  const palette: [number, number, number][] = [
    [0, 0, 0], // CLEAR - never drawn, but the index has to hold a colour
    colour, // INK
    [90, 104, 150], // SHADE
    [232, 236, 248], // PAPER
    [198, 208, 236], // FOLD
  ]

  if (style === 'none') {
    const frame = canvas(size.width, size.height)
    for (let i = 0; i < word.letters.length; i += 1) drawLetter(frame, word, i)

    // PNG rather than GIF for the still, because a still wants real alpha: it
    // is going over a background somebody else chooses.
    const rgba = new Uint8Array(size.width * size.height * 4)
    for (let i = 0; i < frame.data.length; i += 1) {
      const entry = palette[frame.data[i]]
      rgba[i * 4] = entry[0]
      rgba[i * 4 + 1] = entry[1]
      rgba[i * 4 + 2] = entry[2]
      rgba[i * 4 + 3] = frame.data[i] === CLEAR ? 0 : 255
    }
    writeFileSync(out, encodePng({ width: size.width, height: size.height, data: rgba }))
    console.log(`${path.relative(ROOT, out)}  ${size.width}x${size.height}  "${text}"`)
    return
  }

  const frames = framesFor(style, word, size, { cells, envelope, inset })
  const gif = encodeGif(frames, {
    width: size.width,
    height: size.height,
    palette,
    transparent: CLEAR,
  })
  writeFileSync(out, gif)
  console.log(
    `${path.relative(ROOT, out)}  ${size.width}x${size.height}  ` +
      `${frames.length} frames  ${(gif.length / 1024).toFixed(0)}K  "${text}" (${style})`,
  )
}

main()
