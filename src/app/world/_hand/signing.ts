/**
 * Turning a hand that is being held into words.
 *
 * The hard part of a hand alphabet is not reading a pose, it is knowing *when a
 * pose was meant*. Fingers pass through half the alphabet on the way from one
 * letter to the next: going from an open hand to a thumb goes through four
 * other hands, and every one of them is a letter. So a letter is not "this pose
 * happened", it is **this pose was held still**, and `HOLD` is the whole
 * difference between an alphabet and a stream of noise.
 *
 * Once a pose has produced its letter it is spent, and cannot produce another
 * until the hand changes. Otherwise leaning on an `e` writes `eeeeeeee`, which
 * is what every first version of this does.
 *
 * ## The open hand sends
 *
 * Letters gather into a run, and the run goes nowhere until you **open your
 * hand**. That gesture is the send button, and it is doing more work than it
 * looks like:
 *
 * - It is what lets a phrase be two letters long. The pen has to guess when a
 *   word has finished and so it watches the *tail* of everything written, which
 *   is why its spells are three letters and why writing near somebody else's
 *   letters can set one off. Here the run is finished when you say it is, so
 *   `he` can mean hello without every word containing an h and an e meaning it.
 * - It is a hand you can hold for as long as you like without saying anything
 *   more, because it is spent the moment it fires.
 * - And it is the natural end of a sentence anyway. Watch anybody finish a
 *   thought with their hands.
 *
 * A hand dropped to a fist and left there for `FORGET` forgets the half-word.
 * Nobody means to send something they started a minute ago, and a run that
 * survives you walking across a room is a run that goes off at a stranger.
 */

import { type Letter, read } from '@/app/world/_hand/alphabet'
import { FIST, type Pose } from '@/app/world/_hand/fingers'
import { type Phrase, phraseOf } from '@/app/world/_hand/phrases'

/** How long a hand must be still before it is a letter, in milliseconds. */
export const HOLD = 320

/** How long a resting hand keeps an unsent word, in milliseconds. */
export const FORGET = 6000

/** A finished run, at the moment the hand opened. */
export interface Said {
  letters: Letter[]
  /** The meaning, if the run is one of the phrases every language has. */
  phrase: Phrase | null
}

interface State {
  pose: Pose
  /** When the current pose was first seen, on the caller's clock. */
  since: number
  /** Whether the current pose has already had its say. */
  spent: boolean
  letters: Letter[]
}

export interface Signer {
  /**
   * The hand being held right now. Call it every frame; it is cheap and it
   * needs the clock more than it needs the pose.
   */
  hold: (pose: Pose, atMs: number) => Said | null
  /** The letters gathered but not yet sent. */
  run: () => Letter[]
  /** How far the current hand is through its hold, from 0 to 1. */
  settling: (atMs: number) => number
  clear: () => void
}

export function createSigner(): Signer {
  const state: State = { pose: FIST, since: 0, spent: true, letters: [] }

  return {
    hold: (pose, atMs) => hold(state, pose, atMs),
    run: () => [...state.letters],
    settling: (atMs) => settling(state, atMs),
    clear: () => {
      state.letters = []
      state.spent = true
    },
  }
}

function hold(state: State, pose: Pose, atMs: number): Said | null {
  if (pose !== state.pose) {
    state.pose = pose
    state.since = atMs
    state.spent = false
  }

  const held = atMs - state.since

  // A fist is not a letter, so it never "commits" - but it is the one hand that
  // keeps counting after it has been recognised, because forgetting is a thing
  // that happens by waiting rather than by doing.
  if (pose === FIST) {
    if (held >= FORGET) state.letters = []
    return null
  }

  if (state.spent || held < HOLD) return null
  state.spent = true

  const reading = read(pose)
  if (reading.kind === 'letter') {
    state.letters.push(reading.letter)
    return null
  }
  if (reading.kind !== 'space' || state.letters.length === 0) return null

  const letters = state.letters
  state.letters = []
  return { letters, phrase: phraseOf(letters) }
}

function settling(state: State, atMs: number): number {
  if (state.spent || state.pose === FIST) return 0
  return Math.min(1, (atMs - state.since) / HOLD)
}
