/**
 * The vocabulary: which letters, in which order, mean what.
 *
 * One table, in one file, because five different places need to agree about
 * it - the reader that matches it, the spellbook that teaches it, the samples
 * that demonstrate it, the dictionary that names it and the scene that acts on
 * it. Everywhere else refers to a `Word`, which is the *meaning* rather than
 * the spelling: a scene that switched on `'xo'` would be a scene you have to
 * edit when somebody decides the magic is spelled differently.
 *
 * The spellings themselves are as short as they can be and still be deliberate.
 * Two letters is about the shortest thing nobody writes by accident, and the
 * one three-letter word is the one that reaches other people.
 */

import type { Glyph } from '@/app/world/_ink/glyphs'

export type Word = 'magic' | 'shout' | 'dance' | 'rainbow' | 'beam' | 'companion'

export interface Spell {
  word: Word
  /** The letters, in the order they are written. */
  letters: Glyph[]
}

/**
 * Every word, longest first.
 *
 * Order matters where one spelling ends with another: `xox` finishes with `ox`,
 * so a reader that took the first match would call every shout a magic. The
 * matcher below sorts by length, and this list is kept in the same order so
 * that reading it tells you the same thing the code does.
 *
 * `xo` is listed twice on purpose. Almost everybody writes the cross first, and
 * the ones who do not are not wrong about their own name for it.
 */
export const SPELLS: Spell[] = [
  { word: 'shout', letters: ['x', 'o', 'x'] },
  { word: 'rainbow', letters: ['o', 'o'] },
  { word: 'beam', letters: ['o', 'i'] },
  /*
    "ai": calls the companion to your side, and sends it home again. Not a spell
    anybody else sees - it is a body only you have - so it is not one the
    space's spell setting withholds. See `_buddy`.
  */
  { word: 'companion', letters: ['a', 'i'] },
  { word: 'magic', letters: ['x', 'o'] },
  { word: 'magic', letters: ['o', 'x'] },
  /* The odd one out: one letter, and a family of three. See `glyphs.ts`. */
  { word: 'dance', letters: ['bowl'] },
]

/**
 * The longest word the tail of this list of letters spells, if any.
 *
 * Longest wins, and that is what lets a word be *finished*: `x o` is a magic
 * the moment the ring closes, and the `x` after it turns the same ink into a
 * shout rather than being read as the start of something new. Nothing is
 * consumed - the caller keeps its letters and lets them age out - because a
 * player who writes `x o x o` meant all of it.
 */
export function spellOf(letters: readonly Glyph[], allowed?: readonly Word[]): Word | null {
  const usable = SPELLS.filter((spell) => !allowed || allowed.includes(spell.word))
  const longest = Math.max(0, ...usable.map((spell) => spell.letters.length))

  for (let length = Math.min(longest, letters.length); length > 0; length--) {
    const tail = letters.slice(-length)
    const hit = usable.find(
      (spell) =>
        spell.letters.length === length &&
        spell.letters.every((letter, index) => letter === tail[index]),
    )
    if (hit) return hit.word
  }
  return null
}
