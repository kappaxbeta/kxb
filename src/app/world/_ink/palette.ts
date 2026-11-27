/**
 * What the ink is made of, in degrees round the colour wheel.
 *
 * Its own file because four things read it: the pen, the burst, the beam and
 * the spellbook that has to demonstrate all of them. A tutorial drawn in
 * different colours from the thing it is teaching is a tutorial for a
 * different feature.
 *
 * Cyan, magenta and violet are the HUD's own three - the chips, the crosshair
 * and the panel headings - so a stroke belongs to this room rather than
 * arriving out of a drawing app. The pen steps through them one stroke at a
 * time, which is also what makes an X read as two strokes rather than one bent
 * one.
 */

import type { Word } from '@/app/world/_ink/words'

export const PALETTE = [188, 300, 268]

/**
 * The rings each word throws, and how many.
 *
 * The count is the loudness. One ring is something you did; three is something
 * the room noticed; six is a rainbow, and it is the only word that gets the
 * whole wheel because it is the only one that *is* the whole wheel.
 */
const RINGS: Record<Word, number[]> = {
  magic: [188, 300, 42],
  /* The one that leaves the screen: the magic's three, and a fourth to say so. */
  shout: [300, 188, 42, 320],
  /* One ring, in the pink the dance button used to be. */
  dance: [320],
  rainbow: [0, 40, 80, 170, 250, 310],
  beam: [188, 300],
  /* Telly's pink and Kappa's red: somebody is on his way. */
  companion: [320, 0],
}

export function ringsFor(word: Word): number[] {
  return RINGS[word]
}
