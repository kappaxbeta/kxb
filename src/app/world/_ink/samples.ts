/**
 * Every word, written out, so the spellbook can show them being drawn.
 *
 * These are the same generators the tests use, in the same coordinates a
 * player would draw in - a hundred-odd pixels across, wobble and all - and
 * `samples.test.ts` runs every one of them through the reader. So the little
 * animations in the book are not an artist's impression of the gesture: they
 * are gestures that provably work, and if somebody moves a threshold and
 * breaks one, a failing test says so before the tutorial starts lying.
 *
 * Each sample carries the box it was drawn in rather than being normalised,
 * because the demo has to letterbox them and three letters side by side is a
 * wider picture than one.
 */

import { circle, line } from '@/app/world/_ink/handwriting'
import type { Pt } from '@/app/world/_ink/points'
import type { Word } from '@/app/world/_ink/words'

export interface Sample {
  word: Word
  /** Drawn in order, one after the other. */
  strokes: Pt[][]
  /** The space the strokes are drawn in. */
  box: { width: number; height: number }
}

/** One arm of a cross, as a pair of strokes crossing at the middle. */
const cross = (cx: number, cy: number, half: number): Pt[][] => [
  line({ x: cx - half, y: cy - half * 1.3 }, { x: cx + half, y: cy + half * 1.3 }, 2),
  line({ x: cx + half, y: cy - half * 1.3 }, { x: cx - half, y: cy + half * 1.3 }, 2),
]

export const SAMPLES: Sample[] = [
  {
    word: 'magic',
    strokes: [...cross(37, 50, 25), circle(114, 50, 32, 3)],
    box: { width: 160, height: 100 },
  },
  {
    /*
      The long one, and the only word that leaves the screen it is drawn on.
      Three letters rather than two because it is the one worth being sure
      about: nobody sends a room-wide flare by accident with their elbow.
    */
    word: 'shout',
    strokes: [...cross(37, 50, 25), circle(114, 50, 30, 3), ...cross(196, 50, 25)],
    box: { width: 240, height: 100 },
  },
  {
    word: 'rainbow',
    strokes: [circle(46, 50, 30, 3), circle(118, 50, 30, 3)],
    box: { width: 164, height: 100 },
  },
  {
    /*
      A ring and a stroke standing well clear of it. The gap is the letter: the
      same stroke drawn against the ring is a d, which is why the demo puts it
      where it does - somebody copying this picture must land on the side of
      the line the recogniser is on.
    */
    word: 'beam',
    strokes: [circle(46, 50, 30, 3), line({ x: 130, y: 14 }, { x: 130, y: 86 }, 2)],
    box: { width: 164, height: 100 },
  },
  {
    /*
      An a - the ring with a short stem on its right, no taller than the ring -
      and then an i well clear of it. Same gap rule as the beam: the i touching
      the a would make one letter of the two.
    */
    word: 'companion',
    strokes: [
      circle(44, 58, 28, 3),
      line({ x: 72, y: 30 }, { x: 74, y: 90 }, 2),
      line({ x: 146, y: 22 }, { x: 146, y: 90 }, 2),
    ],
    box: { width: 180, height: 100 },
  },
  {
    word: 'dance',
    strokes: [circle(44, 62, 28, 3), line({ x: 72, y: 12 }, { x: 72, y: 88 }, 2)],
    box: { width: 100, height: 100 },
  },
]

/** The demonstration of one word, if there is one. */
export function sampleFor(word: Word): Sample | undefined {
  return SAMPLES.find((sample) => sample.word === word)
}
