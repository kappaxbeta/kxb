/**
 * The alphabet: which hand is which letter.
 *
 * Written out rather than computed, because an alphabet you cannot read off the
 * page is one nobody can argue with. The order it was *derived* in is below, so
 * that changing a letter is a decision somebody can make on purpose instead of
 * a table they are afraid to touch.
 *
 * This is not sign language, and it is important that it does not pretend to
 * be. Every real manual alphabet leans on shapes this hand cannot make - a
 * hooked finger, two fingers crossed, a thumb touching a knuckle - so a mode
 * that called itself ASL and then spelled half the letters wrong would be worse
 * than one that is plainly the room's own. It is the pen's trick again: the pen
 * knows three letters and is *sure* about them (see `_ink/glyphs.ts`), and this
 * knows twenty-six hands it can actually draw.
 *
 * ## How the letters were handed out
 *
 * Two hands are spoken for before any letter is: the **fist** is resting - a
 * hand at rest must never be saying something - and the **open hand** is the
 * space between words, because throwing all five fingers open is the most
 * natural "and breathe" a hand has.
 *
 * Then five hands were assigned by *recognition*, overruling everything else,
 * because a gesture somebody already knows costs nothing to learn:
 *
 * - **L** - thumb and index, which is the shape of the letter.
 * - **V** - two fingers, which is the shape of the letter and also the
 *   most-made hand in every photograph ever taken.
 * - **O** - thumb and index closed into a ring, the other three up. The ring
 *   *is* the letter. (In bits it reads as `MRP`, because the two fingers making
 *   the ring are the two that are down.)
 * - **X** - index and pinky, the horns. Nothing about horns says X; it gets a
 *   cheap, famous hand anyway because `xo` is the name of this place and the
 *   first word most people will try.
 * - **I** - the little finger alone, the thinnest upright the hand has.
 *
 * Everything left over was sorted by `costOf` - easiest hand first - and handed
 * the remaining letters in order of how often English uses them. That is the
 * whole rule, and it is why **E** is a thumb: the most common letter in the
 * language gets the only hand that costs nothing at all.
 *
 * Four hands got no letter, and they are the four `costOf` scores hardest:
 * `TIR`, `TMP`, `IR` and `MP` - each one a finger fighting both its neighbours.
 * Leaving them empty is deliberate. They are the hands a beginner makes by
 * accident while reaching for another one, and a wrong letter arriving is worse
 * than nothing arriving.
 */

import { FIST, OPEN, parsePose, type Pose, poseName } from '@/app/world/_hand/fingers'

export const LETTERS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
] as const

export type Letter = (typeof LETTERS)[number]

/**
 * The table. Fingers are initials in thumb-to-pinky order - see `fingers.ts`.
 *
 * Kept alphabetical rather than in the order it was derived, because this is
 * the copy people look things up in. `alphabet.test.ts` walks it and checks the
 * derivation still holds, so the reasoning above cannot quietly stop being true
 * about the table below it.
 */
export const ALPHABET: Record<Letter, string> = {
  a: 'TIM',
  b: 'IRP',
  c: 'IMR',
  d: 'I',
  e: 'T',
  f: 'MR',
  g: 'TM',
  h: 'TMRP',
  i: 'P',
  j: 'TIMP',
  k: 'TR',
  l: 'TI',
  m: 'TMR',
  n: 'TIMR',
  o: 'MRP',
  p: 'M',
  q: 'R',
  r: 'TRP',
  s: 'TP',
  t: 'IMRP',
  u: 'RP',
  v: 'IM',
  w: 'TIP',
  x: 'IP',
  y: 'TIRP',
  z: 'IMP',
}

/** The hand that means "nothing is being said". */
export const REST: Pose = FIST

/** The hand that ends a word. */
export const SPACE: Pose = OPEN

/**
 * What a hand means, once it is held.
 *
 * A discriminated union rather than `Letter | null`, because the three answers
 * that are not a letter are not the same answer. A rest is the hand going quiet,
 * a space is a word finishing, and `none` is one of the four hands nobody was
 * given - and the readout draws each of those differently. Squashing them into
 * `null` is how a dropped letter and a deliberate pause become indistinguishable.
 */
export type Reading =
  | { kind: 'letter'; letter: Letter }
  | { kind: 'space' }
  | { kind: 'rest' }
  | { kind: 'none' }

const BY_POSE: Map<Pose, Letter> = new Map(
  (Object.entries(ALPHABET) as [Letter, string][]).flatMap(([letter, spelling]) => {
    const pose = parsePose(spelling)
    // Unreachable while the test passes; a bad spelling drops the letter rather
    // than throwing, because the module is imported by a frame loop.
    return pose == null ? [] : [[pose, letter] as [Pose, Letter]]
  }),
)

export function handFor(letter: Letter): Pose {
  return parsePose(ALPHABET[letter]) ?? FIST
}

/** The hand for a letter, written the way the chart prints it. */
export function handNameFor(letter: Letter): string {
  return poseName(handFor(letter))
}

export function read(pose: Pose): Reading {
  if (pose === REST) return { kind: 'rest' }
  if (pose === SPACE) return { kind: 'space' }
  const letter = BY_POSE.get(pose)
  return letter ? { kind: 'letter', letter } : { kind: 'none' }
}
