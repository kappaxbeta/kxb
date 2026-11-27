/**
 * Where the hand meets the pen.
 *
 * The pen reads four letters - a ring, a cross, an upright and the bowl-and-stem
 * family - and those four are letters this alphabet also has. So a hand can cast:
 * the horns and then the ring is `xo`, which is magic, and it is the same magic,
 * fired down the same wire, drawn in the same neon. Nobody had to be taught a
 * second vocabulary, and a room does not need to know which hand a spell came
 * out of.
 *
 * Its own file, small as it is, because it is the only thing in `_hand` that
 * knows `_ink` exists. Everything else here - the alphabet, the phrasebook, the
 * reader - is about a hand and stays that way, and the day the pen changes its
 * letters this is the file that fails to compile.
 *
 * `b` and `p` come back as the bowl alongside `d` because the pen cannot tell
 * those three apart on a drawn scrawl and decided not to try (see
 * `_ink/glyphs.ts`). A hand *can* tell them apart perfectly well - they are
 * three different poses - but they still all mean dance, so agreeing with the
 * pen costs nothing and disagreeing would mean a `b` that dances when written
 * and does not when signed.
 */

import type { Letter } from '@/app/world/_hand/alphabet'
import type { Glyph } from '@/app/world/_ink/glyphs'
import { spellOf, type Word } from '@/app/world/_ink/words'

const GLYPHS: Partial<Record<Letter, Glyph>> = {
  o: 'o',
  x: 'x',
  i: 'i',
  a: 'a',
  d: 'bowl',
  b: 'bowl',
  p: 'bowl',
}

export function glyphOf(letter: Letter): Glyph | null {
  return GLYPHS[letter] ?? null
}

/**
 * The spell a signed run casts, if it casts one.
 *
 * A run with a letter the pen has no glyph for is not a spell at all, rather
 * than a spell with a gap in it: `xno` is somebody spelling a word, and a room
 * that read it as `xo` would be casting on their behalf.
 */
export function spellSigned(letters: readonly Letter[], allowed?: readonly Word[]): Word | null {
  const glyphs: Glyph[] = []
  for (const letter of letters) {
    const glyph = glyphOf(letter)
    if (!glyph) return null
    glyphs.push(glyph)
  }
  return spellOf(glyphs, allowed)
}
