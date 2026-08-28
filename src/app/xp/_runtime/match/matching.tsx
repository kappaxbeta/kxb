'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { kickoff, stepMatch, type Match } from '@/app/xp/_runtime/match/match'
import type { XpRules } from '@kxb/xp'

/**
 * The match, in the tree.
 *
 * ./racing again, for the other half of §C: a frame loop over a pure module,
 * mounted only when the document is actually playing a mode. All of the
 * thinking and all of the tests are in ./match; what is here is the two counters
 * that turn "what has happened since I last looked" into one frame's worth of
 * input.
 *
 * Both of those counters are read as *totals*, never reset by this component.
 * That is not a style preference: a ref passed down as a prop and mutated by the
 * child is the shape React's compiler refuses, and it is right to - the thing
 * that owns a mutation should be the thing that renders what reads it. Diffing
 * against what this last saw asks the same question without writing anything,
 * and it does not depend on which of two `useFrame` callbacks R3F happened to
 * run first.
 */
export function Matching({
  rules,
  tally,
  finishes,
  sides,
  onMatch,
}: {
  rules: XpRules
  /**
   * Every point the level has produced since it loaded, summed by the
   * simulation from its own `score` effects.
   *
   * A running total rather than a per-frame figure, so nothing is lost if this
   * loop and the simulation's run in an order R3F does not promise.
   */
  tally: { readonly current: number }
  /** How many runs have been completed, from ./racing. Only parkour reads it. */
  finishes: { readonly current: number }
  /**
   * Every side's total, when the level has sides and somebody is keeping them.
   *
   * A ref rather than a prop value for the same reason the two counters are
   * one: this reads it inside a frame loop, and a new array from the arbiter
   * every second would otherwise re-run the effect that owns the loop.
   *
   * Unlike them it is a *level* rather than a total - it is the arbiter's own
   * number, and diffing it against what we last saw would drift the first time
   * a poll was missed.
   */
  sides?: { readonly current: readonly { side: string; kills: number }[] }
  onMatch: (match: Match) => void
}) {
  const match = useRef<Match>(kickoff(rules))
  const seenTally = useRef(tally.current)
  const seenFinishes = useRef(finishes.current)

  /**
   * How long since React was last told, and why it is not told every frame.
   *
   * The same trade ./racing makes: a running clock in state is a re-render of
   * the scene sixty times a second, and nobody reads a countdown that fast. The
   * *result* does not go through the throttle - the frame a match ends is
   * reported immediately, and the numbers reported with it are the exact ones
   * `stepMatch` computed.
   */
  const since = useRef(0)

  useFrame((_state, rawDelta) => {
    // The same clamp the rest of the frame uses. A tab returning from the
    // background must not be charged for the time it was away - see `stepRun`.
    const delta = Math.min(rawDelta, 0.05)

    const scored = tally.current - seenTally.current
    seenTally.current = tally.current

    const finished = finishes.current !== seenFinishes.current
    seenFinishes.current = finishes.current

    const before = match.current
    const after = stepMatch(before, rules, {
      delta,
      scored,
      finished,
      ...(sides ? { sides: sides.current } : {}),
    })
    match.current = after

    // `stepMatch` returns the same object once a match is over, so a finished
    // match settles into doing nothing rather than re-reporting itself forever.
    if (after === before) return

    since.current += delta
    if (after.phase !== before.phase || since.current >= 0.05) {
      since.current = 0
      onMatch(after)
    }
  })

  return null
}
