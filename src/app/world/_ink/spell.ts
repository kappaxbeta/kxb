/**
 * Letters into words: the little memory that sits between the recogniser and
 * the room.
 *
 * `readGlyph` is a pure function over one or two strokes and knows nothing
 * about time. Handwriting is nothing *but* time - an X is two strokes that
 * belong together, XO is two letters that belong together, and the only thing
 * separating "xo" from "an x, and then an o some other afternoon" is how long
 * the pause was. That is what this holds, and it is all it holds; which
 * sequences mean something is `words.ts`.
 *
 * One window for every job, because they are the same promise made several
 * times: a pause longer than this means you started something new. Set
 * generously - a finger is slower than a pen, and a player is usually also
 * walking.
 */

import { type Glyph, readGlyph } from '@/app/world/_ink/glyphs'
import type { Stroke } from '@/app/world/_ink/points'
import { spellOf, type Word } from '@/app/world/_ink/words'

export type { Word }

/** How long a letter waits for the rest of its word, in milliseconds. */
const WINDOW = 1800

interface Letter {
  glyph: Glyph
  strokes: Stroke[]
  at: number
}

export interface Reader {
  /**
   * One finished stroke. Returns a word the moment the ink spells one, and
   * null the rest of the time - which is most of the time.
   */
  add: (stroke: Stroke, at: number) => Word | null
  /** Forget everything pending. Called when the pen is put away. */
  reset: () => void
}

/**
 * Options, rather than two positional arguments.
 *
 * `createReader(1000)` used to mean a shorter window and now would mean a list
 * of words - a mistake that typechecks in a test and silently reads nothing.
 * Named, it cannot happen.
 */
export interface ReaderOptions {
  /** The words this surface understands. Every word, when left out. */
  allowed?: readonly Word[]
  /** How long a letter waits for the rest of its word, in milliseconds. */
  window?: number
}

export function createReader({ allowed, window = WINDOW }: ReaderOptions = {}): Reader {
  /** Strokes that are not yet a letter. Never more than two matter. */
  let pending: { stroke: Stroke; at: number }[] = []
  /** The letters read so far, oldest first, while they are still fresh. */
  let letters: Letter[] = []

  const forget = (now: number) => {
    pending = pending.filter((entry) => now - entry.at <= window)
    letters = letters.filter((letter) => now - letter.at <= window)
  }

  return {
    reset() {
      pending = []
      letters = []
    },

    add(stroke, at) {
      forget(at)
      pending.push({ stroke, at })

      /*
        Three attempts, in this order, and each one exists because of a way
        people actually write.

        1. **With the stroke before it.** An X's second stroke read on its own
           is a line and means nothing, so trying the pair first is what lets a
           two-stroke letter exist at all. A letter that needs only one stroke
           is never hurt by the attempt - a line and a ring together are not a
           letter, so the pair falls through.
        2. **With the letter before it**, taking that letter back. A d written
           bowl-first is already a whole letter by the time the stem lands, and
           so is one written stem-first: the ring reads as an O, the stem reads
           as an i, and both are right until the other half arrives. Rather
           than delay every ring and every stem to see what follows - which
           would make the common case feel slow - the first reading is allowed
           to stand and is then corrected here.
        3. **On its own**, which is most letters most of the time.
      */
      const pair = pending.slice(-2).map((entry) => entry.stroke)
      let strokes = pair
      let glyph = pair.length === 2 ? readGlyph(pair) : null
      let corrects = false

      const previous = letters[letters.length - 1]
      if (!glyph && previous?.strokes.length === 1 && at - previous.at <= window) {
        const together = readGlyph([...previous.strokes, stroke])
        if (together) {
          strokes = [...previous.strokes, stroke]
          glyph = together
          corrects = true
        }
      }

      if (!glyph) {
        strokes = [stroke]
        glyph = readGlyph(strokes)
      }

      if (!glyph) return null

      pending = []
      if (corrects) letters.pop()
      letters.push({ glyph, strokes, at })

      return spellOf(
        letters.map((letter) => letter.glyph),
        allowed,
      )
    },
  }
}
