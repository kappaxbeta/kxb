/**
 * Ids that sort themselves.
 *
 * A match produces a stream of things that happened - a coin collected, a crate
 * broken, a goal scored - and the one question asked of them afterwards is
 * "which came first". An id that answers that on its own means no separate
 * timestamp column, no tie-break rule, and no sorting a list by a field that
 * two events can share.
 *
 * ---------------------------------------------------------------------------
 * UTC, not Berlin
 * ---------------------------------------------------------------------------
 * The obvious idea is to build the id out of local time, and it is a bug that
 * fires once a year in the middle of the night. Berlin goes back an hour at the
 * end of October: for that hour, local time repeats itself, so ids issued after
 * the change sort *before* ids issued before it, and a match played at 02:30 on
 * that Sunday has its events in the wrong order with nothing in the data to say
 * so.
 *
 * So the clock here is UTC milliseconds, which only ever goes forwards. Berlin
 * is a display, and `berlinTime` below is where it belongs - at the edge, on
 * the way to a person's eyes.
 *
 * ---------------------------------------------------------------------------
 * One clock, the host's
 * ---------------------------------------------------------------------------
 * The other half of "which came first", and the one that is easy to miss:
 * clients disagree about the time. Two browsers on the same wifi are commonly
 * seconds apart, and sorting events by whichever machine happened to make them
 * is sorting by a set of clocks rather than by a clock.
 *
 * So ids are minted by *one* participant - the elected host, the same role that
 * already owns the ball in football - and everybody else asks. The `node` field
 * exists anyway, because a host that changes mid-match must not reissue ids the
 * old one already used.
 *
 * ---------------------------------------------------------------------------
 * A string, not a number
 * ---------------------------------------------------------------------------
 * A classic snowflake is 64 bits and JavaScript's safe integer is 53, so the
 * honest choices are `BigInt` or a string. This is a fixed-width base-36 string
 * that sorts lexicographically, which means it sorts correctly with `<`, in a
 * `sort()` with no comparator, in a database column, and in a log a person is
 * reading - and it is nineteen characters rather than a `BigInt` that has to be
 * converted at every boundary.
 */

/**
 * Milliseconds this counts from: 2026-01-01T00:00:00Z.
 *
 * A recent epoch rather than 1970 so the timestamp stays short. Nine base-36
 * digits hold about 3.5 million years past this, so the width is not a ceiling
 * anybody will meet.
 */
export const XP_EPOCH = Date.UTC(2026, 0, 1)

const TIME_DIGITS = 9
const NODE_DIGITS = 2
const SEQ_DIGITS = 3

/** Ids per millisecond per node before the minter has to wait. */
const SEQ_LIMIT = 36 ** SEQ_DIGITS

export interface Snowflakes {
  /** The next id. Monotonic, even if the clock is not. */
  next(): string
  /** When an id was minted, as UTC milliseconds. */
  timeOf(id: string): number
}

/**
 * A minter for one node.
 *
 * `now` is injected rather than read from `Date.now()`, for the reason the host
 * interface gives: an engine that reads its own clock cannot be run faster than
 * real life, so every test about a timer takes as long as the timer.
 */
export function createSnowflakes(node: number, now: () => number = Date.now): Snowflakes {
  if (!Number.isInteger(node) || node < 0 || node >= 36 ** NODE_DIGITS) {
    throw new Error(`node must be an integer 0..${36 ** NODE_DIGITS - 1}`)
  }

  let lastMs = -1
  let seq = 0

  return {
    next(): string {
      let ms = now() - XP_EPOCH

      /**
       * Never go backwards.
       *
       * `Date.now()` is not monotonic - an NTP correction can move it back by
       * seconds - and an id that moves back is a pair of events that swap
       * places. Holding at the last millisecond issued costs ordering
       * *accuracy* for a moment and keeps ordering *correctness*, which is the
       * one of the two that anything downstream relies on.
       */
      if (ms < lastMs) ms = lastMs

      if (ms === lastMs) {
        seq += 1
        if (seq >= SEQ_LIMIT) {
          // 46 656 ids in one millisecond from one node. Rolling into the next
          // millisecond is what a real snowflake does, and getting here at all
          // means something is wrong upstream.
          ms += 1
          seq = 0
        }
      } else {
        seq = 0
      }
      lastMs = ms

      return (
        ms.toString(36).padStart(TIME_DIGITS, '0') +
        node.toString(36).padStart(NODE_DIGITS, '0') +
        seq.toString(36).padStart(SEQ_DIGITS, '0')
      )
    },

    timeOf(id: string): number {
      return parseInt(id.slice(0, TIME_DIGITS), 36) + XP_EPOCH
    },
  }
}

/** When an id was minted, without needing the minter that made it. */
export function timeOf(id: string): number {
  return parseInt(id.slice(0, TIME_DIGITS), 36) + XP_EPOCH
}

/** Which node minted it. Useful when the host changed mid-match. */
export function nodeOf(id: string): number {
  return parseInt(id.slice(TIME_DIGITS, TIME_DIGITS + NODE_DIGITS), 36)
}

/**
 * An id as a Berlin wall-clock time, for showing a person.
 *
 * The *only* place local time appears, and on the way out rather than on the
 * way in. Handles the summer/winter change correctly because `Intl` does, which
 * is exactly the reason not to do it by adding an hour somewhere.
 */
export function berlinTime(id: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(timeOf(id)))
}
