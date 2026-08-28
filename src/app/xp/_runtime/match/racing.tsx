'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { NO_RUN, stepRun, type Run, type Spot } from '@/app/xp/_runtime/match/race'
import type { Mark } from '@kxb/xp'
import { EYE_HEIGHT } from '@kxb/xp/engine'

/**
 * The race clock, in the tree.
 *
 * Four lines of frame loop over `./race`, which holds all of the thinking and
 * all of the tests. The split is the same one `./streak` and `./tracers` have,
 * and it exists because this half cannot be watched: the Browser pane is always
 * `document.hidden`, so a component is a thing you can only reason about.
 *
 * It draws nothing and returns null - a component so it can have a `useFrame`,
 * which is how R3F lets you have one. It is mounted only for a document that
 * declares `competition` and actually carries the marks, so a level with no race
 * in it does not pay a frame callback to find that out sixty times a second.
 */
export function Racing({
  marks,
  at,
  teleports,
  onRun,
  onFinish,
}: {
  marks: readonly Mark[]
  /**
   * Where the player's eye ended up last frame.
   *
   * A ref rather than a prop, and read-only here: this is the simulation's own
   * position, and a value passed down as a prop would be a re-render of the
   * whole scene every frame. The same arrangement `./together` has.
   */
  at: { readonly current: Spot }
  /**
   * How many times the player has been *put* somewhere rather than walking
   * there, counted by the simulation.
   *
   * A counter and not a flag because two loops read it in an order R3F does not
   * promise: a flag would have to be cleared by whoever saw it first, and the
   * frame that actually carries the jump is not always that one. A counter can
   * be compared against what this last saw, which is the same question asked in
   * a way that does not depend on who asked first.
   */
  teleports: { readonly current: number }
  onRun: (run: Run) => void
  /**
   * A run was completed, on the frame it was completed.
   *
   * Separate from `onRun` because they have different readers and different
   * tolerances: `onRun` feeds a readout and is throttled, and this feeds the
   * match's end condition, where a frame late is a whistle that blew after
   * somebody had already crossed. Called from inside the frame loop, so whoever
   * takes it must not set React state directly.
   */
  onFinish?: () => void
}) {
  /** Where the feet were last frame. The clock is about the segment between. */
  const from = useRef<Spot>({ x: at.current.x, y: at.current.y - EYE_HEIGHT, z: at.current.z })
  const run = useRef<Run>(NO_RUN)
  const seen = useRef(teleports.current)

  /**
   * How long since React was last told, and why it is not told every frame.
   *
   * A running clock in state is a re-render of the scene sixty times a second,
   * which is the cost every ref in this folder exists to avoid - and nobody can
   * read a hundredths digit changing sixty times a second anyway. Twenty is
   * enough for the number to look like it is counting.
   *
   * The *result* does not go through this: a phase change is reported the frame
   * it happens, and the time reported with it is the exact one `stepRun`
   * computed. So the throttle costs a slightly stale readout mid-run and costs
   * the recorded time nothing at all, which is the only part anybody keeps.
   */
  const since = useRef(0)

  useFrame((_state, rawDelta) => {
    // The same clamp the rest of the frame uses. See `stepRun` for why the clock
    // is simulated seconds rather than wall time.
    const delta = Math.min(rawDelta, 0.05)

    const jumped = teleports.current !== seen.current
    seen.current = teleports.current

    // Feet, because that is what a mark's height is measured from - the same
    // conversion `movePlayer` gets in ./simulation.
    const to = { x: at.current.x, y: at.current.y - EYE_HEIGHT, z: at.current.z }

    const before = run.current
    const after = stepRun(before, marks, { from: from.current, to, delta, teleported: jumped })
    from.current = to
    run.current = after

    if (after.finishes !== before.finishes) onFinish?.()

    since.current += delta
    const settled = after.phase !== before.phase || after.finishes !== before.finishes
    if (settled || (after.phase === 'running' && since.current >= 0.05)) {
      since.current = 0
      onRun(after)
    }
  })

  return null
}
