/**
 * Where the next thing to copy goes, and which one it is.
 *
 * The chase is the whole reason the pad is not just a sheet of paper: a word
 * appears somewhere on the screen and you write it *there*, which turns a
 * gesture you would otherwise practise once into something you do twenty times
 * without noticing. That makes placement the interesting part, so it lives in a
 * function of its own with a seam for the random numbers - a game of chance you
 * cannot test is a game you cannot tune.
 *
 * Percentages rather than pixels, because the page is whatever size the window
 * is and the target is placed before anything has been measured.
 */

import type { Word } from '@/app/world/_ink/words'

export interface Target {
  word: Word
  /** Where its middle sits, as a percentage of the page. */
  left: number
  top: number
  /** How wide it is drawn, as a percentage of the page's width. */
  size: number
  /** A few degrees off square, so the page does not look like a form. */
  tilt: number
}

/**
 * What the chase asks for.
 *
 * The three you can practise on a page: the two that do something wherever you
 * are, and the shout. The battle pair are left out because a rainbow and a beam
 * are things that happen *in a room*, and a workbench that promised them would
 * be promising an effect it has nowhere to put.
 */
const WORDS: Word[] = ['magic', 'shout', 'dance']

/** Kept off the edges, where a finger cannot comfortably draw. */
const MARGIN = 18

/**
 * How far a new target must land from the old one, in percentage points.
 *
 * Without it, roughly one in ten lands close enough to the last one to look
 * like it never moved - and a target you have to check for is worse than one
 * you have to look for.
 */
const APART = 30

export function nextTarget(previous: Target | null, random: () => number = Math.random): Target {
  const between = (low: number, high: number) => low + random() * (high - low)

  let left = 0
  let top = 0
  // Twelve tries, then whatever we have: on a narrow phone in portrait the
  // margins can leave no room for `APART` at all, and a loop that insists is a
  // page that hangs rather than a target that is a bit close.
  for (let attempt = 0; attempt < 12; attempt++) {
    left = between(MARGIN, 100 - MARGIN)
    top = between(MARGIN, 100 - MARGIN)
    if (!previous) break
    if (Math.hypot(left - previous.left, top - previous.top) >= APART) break
  }

  return {
    word: WORDS[Math.floor(random() * WORDS.length) % WORDS.length],
    left,
    top,
    size: between(20, 30),
    tilt: between(-10, 10),
  }
}
