import { useRef } from 'react'

/**
 * The few lines along the bottom that say what just happened.
 *
 * Six places in `../simulation` wrote the same expression to add one:
 *
 *     onSay((previous) => [...previous, { id: saidId.current++, text }].slice(-5))
 *
 * — a kick-off, a respawn, a player coming back, a dash landing, a run of
 * effects, a level's own ending. Six copies of an id counter, a spread and a
 * magic five, next to a `TICKER_LINES` that was declared in `../scene` and used
 * only there.
 *
 * ---------------------------------------------------------------------------
 * Why the ids exist at all
 * ---------------------------------------------------------------------------
 * The lines are not unique. A room where two people score reads `+1` twice, and
 * React keying on the text would treat the second as the first re-rendering —
 * so the older line stays put and the new one never animates in. A counter that
 * only goes up is the smallest thing that cannot collide with itself.
 *
 * ---------------------------------------------------------------------------
 * A ticker, not a transcript
 * ---------------------------------------------------------------------------
 * Only the last few are kept, and the interesting line is the one that just
 * arrived. Anything wanting the history is asking for the chat panel, which is
 * a different thing drawn in a different place.
 */

/**
 * How many lines the ticker shows.
 *
 * Five, and it is drawn over a game somebody is playing: a sixth line is one
 * more row of text between them and the thing they are looking at. The chat
 * panel deliberately holds the same number — see `./chat-panel` — so the two
 * stacks are the same height rather than nearly.
 */
export const TICKER_LINES = 5

/** One line of it. */
export interface Line {
  id: number
  text: string
}

export interface Ticker {
  /** The next id to hand out. Only ever goes up. */
  nextId: React.RefObject<number>
}

export function useTicker(): Ticker {
  return { nextId: useRef(0) }
}

/**
 * Add lines, and drop everything older than the last few.
 *
 * Takes an array so a frame that produced several says them in one update —
 * six separate calls would be six renders of the same tree, and the last five
 * would win anyway.
 */
export function say(
  ticker: Ticker,
  onSay: (next: (previous: Line[]) => Line[]) => void,
  ...texts: string[]
): void {
  if (texts.length === 0) return

  onSay((previous) =>
    [...previous, ...texts.map((text) => ({ id: ticker.nextId.current++, text }))].slice(
      -TICKER_LINES,
    ),
  )
}

/**
 * The items of a growing list that have not been seen yet, and the mark moved
 * past them.
 *
 * Two places watch a list a script appends to — its logs, and its failures —
 * and neither can be told about a new entry any other way: the script runs
 * inside its own box and the only thing coming back is a longer array. Both
 * kept their own count and compared it, which is the same three lines twice.
 *
 * Advances the mark whether or not the caller does anything with the result,
 * because *seen* is about having looked rather than having acted. A caller that
 * only wants to know whether anything arrived reads `.length`.
 */
export function fresh<T>(all: readonly T[], seen: React.RefObject<number>): readonly T[] {
  if (all.length <= seen.current) return []

  const next = all.slice(seen.current)
  seen.current = all.length
  return next
}
