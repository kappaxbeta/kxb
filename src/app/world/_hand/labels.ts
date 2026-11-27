/**
 * Everything the hand says out loud, in one shape.
 *
 * The same arrangement the pen uses next door, and for the same reason: this
 * module knows nothing about the app's locales, so whichever screen mounts it
 * hands over sentences that have already been chosen. See `_ink/labels.ts`.
 *
 * The phrases themselves are deliberately *not* here. Those are the message
 * rather than the furniture, they are keyed by meaning, and they live with the
 * spellings in `phrases.ts` so that adding one is a single edit. A caption that
 * is missing leaves an English word on a German screen; a phrase that is
 * missing leaves somebody unheard.
 */

export interface HandLabels {
  /** The line along the edge, which is also the way into the chart. */
  hint: string
  /** The chart's heading, and the two lists inside it. */
  title: string
  alphabet: string
  phrasebook: string
  close: string
  /** The soft button, and what it says while the hand is out. */
  hand: string
  away: string
  /** Above the letters gathered so far. */
  saying: string
  /** What the open hand does, printed under it. */
  send: string
  /** How to make a hand, on a keyboard and on a phone. */
  keys: string
  pads: string
  /** The switch that offers the camera, and the four things it can say. */
  camera: string
  looking: string
  denied: string
  noCamera: string
  trouble: string
  /** Somebody else's phrase arriving. `{name}` is replaced with theirs. */
  from: string
  /**
   * The promise the mode makes, printed once in the chart: what you sign from
   * the book arrives in the language the reader has chosen. Worth saying out
   * loud, because it is the one thing about this that is not visible.
   */
  translated: string
}
