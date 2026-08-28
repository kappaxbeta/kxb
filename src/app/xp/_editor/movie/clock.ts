/**
 * The playhead, as a thing with methods rather than a ref with a field.
 *
 * ---------------------------------------------------------------------------
 * Why not `useRef<number>`
 * ---------------------------------------------------------------------------
 * The obvious shape is a `React.RefObject<number>` passed from the mode down to
 * the stage, written by the frame loop and read by everybody. It is what the
 * runtime does with `world`, and here the React Compiler refuses it: assigning
 * to `clock.current` inside `useFrame` is *modifying a prop*, which the
 * compiler can see and will not optimise a component around. It is not being
 * fussy - a prop that a child reassigns is genuinely how a parent and a child
 * come to disagree about a value neither of them owns.
 *
 * A method call is opaque to it, and that is not a trick to get past a lint
 * rule: it is the honest shape. Nothing outside this file has any business
 * knowing that a playhead is a number in a box, and "advance by a delta,
 * stopping at the end" is a rule about time that was previously written out at
 * its one call site.
 *
 * Held in a `useMemo` by the mode, so it survives re-renders and moving it
 * costs nothing. Reading it does **not** re-render anything, which is the whole
 * point - see the note on `MovieStage` about why the panels are told the time
 * separately and on purpose.
 */
export interface MovieClock {
  /** Seconds. */
  at(): number
  /** Put it somewhere, and stop. Scrubbing is always a pause. */
  seek(seconds: number): void
  running(): boolean
  play(): void
  pause(): void
  /**
   * Move it on, if it is running, and say whether that ran off the end.
   *
   * The clamp is here rather than at the call site because it is a fact about a
   * playhead: a tab returning from the background hands the loop a delta of
   * several seconds, and without this the whole film fast-forwards in one
   * frame. The same clamp the runtime's own loop applies.
   */
  advance(
    delta: number,
    duration: number,
    /**
     * A stretch to cycle instead of running to the end.
     *
     * Here rather than at the call site because it is the same kind of fact as
     * the clamp below - a rule about what a playhead does with time, not about
     * what the editor draws. Looping never *ends*, which is the point: you set
     * it to watch one move over and over while you tune it, and a transport
     * that stopped after each pass would be a button you press all afternoon.
     */
    loop?: { from: number; to: number } | null,
  ): 'ended' | 'running' | 'still'
}

export function movieClock(): MovieClock {
  let seconds = 0
  let playing = false

  return {
    at: () => seconds,
    seek(next) {
      seconds = Math.max(0, next)
      playing = false
    },
    running: () => playing,
    play() {
      playing = true
    },
    pause() {
      playing = false
    },
    advance(delta, duration, loop) {
      if (!playing) return 'still'
      seconds += Math.min(delta, 0.1)

      if (loop && loop.to > loop.from) {
        // Wrapped by the *length* rather than snapped to `from`, so a pass that
        // overshoots by half a frame starts the next one half a frame in and
        // the cycle keeps its timing instead of drifting slower every lap.
        if (seconds >= loop.to) {
          const span = loop.to - loop.from
          seconds = loop.from + ((seconds - loop.from) % span)
        }
        // Behind the start is a scrub that happened before the loop was set;
        // the honest thing is to run into it rather than to jump.
        return 'running'
      }

      if (seconds < duration) return 'running'
      seconds = duration
      playing = false
      return 'ended'
    },
  }
}
