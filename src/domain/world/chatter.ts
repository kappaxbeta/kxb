/**
 * When a scripted body opens its mouth.
 *
 * The demo's two hosts are the only things in the app that talk without anybody
 * typing, and the temptation is to write this as three `if`s inside a frame
 * loop. The reason it is here instead is that every interesting case is a
 * timing case - greeting exactly once, not greeting an empty room, not both of
 * them talking over each other, going quiet when you walk away and picking up
 * again when you come back - and none of those can be checked by looking at a
 * canvas.
 *
 * So: no clock of its own, no state of its own. `now` is passed in and the
 * state is a value the caller holds. That makes the whole schedule a table of
 * inputs and expected outputs (see ./chatter.test.ts), and it means the frame
 * loop can call this sixty times a second without allocating anything on the
 * frames where the answer is "say nothing", which is nearly all of them.
 */

/** How close somebody has to be, in blocks, before there is any point talking. */
export const CHATTER_RANGE = 11

/** The quiet between two lines from the same body, in milliseconds. */
export const CHATTER_GAP_MS = 13_000

/**
 * How long after a body first has company before it says hello.
 *
 * Long enough for the entry camera to have finished swooping in - greeting
 * somebody mid-flight puts the bubble on screen before the room is - and long
 * enough that walking past the edge of the range and out again does not fire a
 * hello at your back.
 */
export const CHATTER_HELLO_MS = 1_800

/**
 * The stagger between one body and the next, in milliseconds.
 *
 * Two hellos on the same frame read as one event with a rendering bug. Offset,
 * they read as two people noticing you a moment apart, which is the thing being
 * imitated. Multiplied by the body's index by `startChatter`.
 */
export const CHATTER_STAGGER_MS = 2_400

export interface Chatter {
  /** Whether the greeting has been used. It is only ever said once. */
  greeted: boolean
  /** Earliest this body may speak again, on the caller's clock. */
  nextAt: number
  /** How many idle lines have gone by, so the script cycles rather than repeats. */
  spoken: number
  /** Whether anybody was in range last time we looked. */
  hadCompany: boolean
  /** This body's place in the queue, in milliseconds. See `CHATTER_STAGGER_MS`. */
  offset: number
}

/** A body that has not said anything yet, `index` places back in the queue. */
export function startChatter(index = 0): Chatter {
  return {
    greeted: false,
    // Negative infinity rather than zero: the clock passed in is
    // `performance.now()`, which starts near zero itself, so a nextAt of 0
    // would be an appointment already in the past on the first frame - which is
    // exactly what it is, and what the `hadCompany` branch below overwrites.
    nextAt: Number.NEGATIVE_INFINITY,
    spoken: 0,
    hadCompany: false,
    offset: index * CHATTER_STAGGER_MS,
  }
}

/**
 * The line to say this instant, or null.
 *
 * Returns a fresh `Chatter` rather than mutating, so a caller holding one in a
 * ref assigns the result and a caller holding one in state sets it - and a test
 * can hold both the before and the after.
 *
 * Walking out of range is deliberately *not* a reset of `greeted`. Coming back
 * to be told "welcome, cool you made it" a second time is the moment the
 * illusion dies; what happens instead is that the idle script picks up where it
 * left off, which is what somebody who had been standing there would do.
 */
export function speak(
  chatter: Chatter,
  {
    company,
    now,
    greeting,
    lines,
  }: {
    /** Whether anybody is within `CHATTER_RANGE`. */
    company: boolean
    now: number
    greeting: string
    lines: readonly string[]
  },
): { text: string | null; chatter: Chatter } {
  if (!company) {
    // Nothing said, but the arrival is remembered: the next time somebody walks
    // up, the wait starts from *that* moment rather than from an appointment
    // made while the room was empty.
    return chatter.hadCompany ? { text: null, chatter: { ...chatter, hadCompany: false } } : { text: null, chatter }
  }

  if (!chatter.hadCompany) {
    return {
      text: null,
      chatter: {
        ...chatter,
        hadCompany: true,
        // Somebody who has already been greeted has already been waiting; only
        // a first arrival owes the hello delay.
        nextAt: chatter.greeted
          ? Math.max(chatter.nextAt, now + CHATTER_GAP_MS)
          : now + CHATTER_HELLO_MS + chatter.offset,
      },
    }
  }

  if (now < chatter.nextAt) return { text: null, chatter }

  if (!chatter.greeted) {
    return {
      text: greeting,
      chatter: { ...chatter, greeted: true, nextAt: now + CHATTER_GAP_MS },
    }
  }

  if (lines.length === 0) return { text: null, chatter }

  const text = lines[chatter.spoken % lines.length] ?? null

  return {
    text,
    chatter: { ...chatter, spoken: chatter.spoken + 1, nextAt: now + CHATTER_GAP_MS },
  }
}
