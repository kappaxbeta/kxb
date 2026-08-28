'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Vec3 } from '@/app/world/lounge/_sim/physics'
import { finishCrossed } from '@/app/world/lounge/_sim/race'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import type { Goal } from '@/domain/lounge/goal-events'

/** The backstop below: further than any frame under its own power. In blocks. */
const MAX_STEP = 12

/**
 * Watching for our own finish.
 *
 * Inside the Canvas because it needs a frame loop, and it needs a frame loop
 * because the question is not "where are you" but "did you pass through there
 * since the last frame" - a racer at full tilt covers most of a block between
 * frames, and a dash covers seven in a moment. `finishCrossed` sweeps the
 * segment for exactly that reason.
 *
 * Our own, and only ever our own. Every client runs this for the person sitting
 * in front of it, which is the same division of authority `combat.ts` uses for
 * health: nobody else has our position to sub-frame accuracy, and a client
 * judging somebody else's photo finish would be judging a position that arrived
 * over the wire at `SEND_HZ` and was interpolated the rest of the way.
 *
 * Fires once *successfully*. A second crossing is usually somebody standing past
 * the line and stepping back over it, and the decider ignores it anyway - but a
 * report that never landed is not a crossing that happened, so the latch is only
 * closed once the server has said so. It used to be closed on the way out, which
 * turned any single failed request into a racer who could not finish for the
 * rest of the match and was told nothing about it.
 */
export function FinishLine({
  goals,
  live,
  onFinish,
}: {
  goals: readonly Goal[]
  live: boolean
  onFinish: () => Promise<boolean>
}) {
  const { playerRef, teleportedRef } = useSceneRefs()

  const previous = useRef<Vec3 | null>(null)
  const reported = useRef(false)
  /** A report in flight. Stops a burst of frames sending the same crossing. */
  const sending = useRef(false)

  useFrame(() => {
    const at = playerRef.current
    const from = previous.current
    const to = { x: at.x, y: at.y, z: at.z }

    /**
     * Tracked whether or not the race is live, which it did not used to be.
     *
     * Nulling it while waiting meant the frame the off arrives on has no segment
     * to sweep, and this client learns the race went live from a five-second
     * poll - so the gap between the flag falling and this component believing it
     * is exactly the window in which a crossing was thrown away with nothing
     * said. Keeping the trail costs one object a frame and closes it.
     *
     * The reason it was nulled - that a segment from the lobby to the grid would
     * sweep half the course - is handled where it actually lives: the teleport
     * guard below refuses any step that was not run.
     */
    previous.current = to

    /**
     * A teleport is not a run.
     *
     * Read and cleared on every frame, live or not, so a knockout during a
     * countdown cannot leave the flag standing to eat a real segment later.
     */
    const teleported = teleportedRef.current
    teleportedRef.current = false

    if (!live) return
    if (!from || reported.current || sending.current) return

    /**
     * Going down in a race puts us back on the start line, and the segment from
     * where we fell to where we came back crosses everything in between -
     * including, if we were unlucky enough to be knocked out past it, the finish.
     *
     * Told rather than guessed at, which is the fix: `revive` raises the flag on
     * the frame it moves the body. The distance test this replaces could only
     * catch a teleport that was *far*, and the dangerous one is near - a death
     * spot, a start line and a finish that all sit inside a few blocks of each
     * other is a short course, not an exotic one, and there the respawn segment
     * looked exactly like a sprint through the line.
     */
    if (teleported) return

    /**
     * The backstop, for a move nothing announced.
     *
     * Kept, and now only that. Nothing legitimate comes close: the controller
     * clamps its own step at `MAX_DELTA`, so a body under its own power covers
     * about three blocks in the very worst frame - a full dash while falling at
     * terminal speed - however long that frame took.
     */
    if (Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) > MAX_STEP) return

    if (finishCrossed(from, to, goals)) {
      sending.current = true
      void onFinish().then(
        (stuck) => {
          sending.current = false
          // Only now. A refusal leaves us able to cross again, which is the
          // whole of the retry: run back through the line and it tries afresh.
          if (stuck) reported.current = true
        },
        () => {
          sending.current = false
        },
      )
    }
  })

  return null
}
