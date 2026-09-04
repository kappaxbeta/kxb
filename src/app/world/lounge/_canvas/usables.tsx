'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
// Re-exported below so the scene keeps one import for "seats": the arithmetic
// is in ./_sim/seats, where it can be tested without a canvas.
import { freeSeat, seatOf } from '@/app/world/lounge/_sim/seats'
import { usable } from '@/domain/thingiverse/blueprint'
import type { ThingView } from '@/domain/thingiverse/queries'

/**
 * Which thing you are standing next to.
 *
 * Inside the Canvas because the answer depends on where the player is *this
 * frame*, and the player's position is a ref that deliberately re-renders
 * nothing - the whole scene is built on that, and a proximity test lifted into
 * React state per frame would undo it for every other reader too.
 *
 * So this component renders nothing and does one job: about five times a second
 * it finds the nearest thing you could get into and tells the scene, which is
 * where the prompt and the E key live. Five times a second because the answer
 * changes at walking pace: a person crosses one cell in about half a second,
 * and a prompt that appeared a fifth of a second late is a prompt nobody
 * noticed was late.
 */

/**
 * How close you have to be, in cells.
 *
 * Two and a half, measured to the thing's own cell rather than to its surface -
 * which is generous for a chair and about right for a table you are meant to
 * reach across. The alternative, testing against the measured box, would make
 * the reach depend on how big the model happens to be, so a wide bench would be
 * usable from further away along its length than across it. Nobody would call
 * that a bug and nobody would be able to explain it either.
 */
export const USE_REACH = 2.5

/** How often to look. See the note above about walking pace. */
const EVERY = 0.2

export function Usables({
  things,
  all = false,
  onNear,
}: {
  things: ThingView[]
  /**
   * Whether everything counts, or only what can be got into.
   *
   * True in creative mode, where E picks a thing up rather than getting into
   * one - and a crate you cannot sit on is exactly the sort of thing somebody
   * building a room wants to move. False while playing, where the prompt is a
   * promise that pressing E will do something.
   */
  all?: boolean
  /** The nearest thing you could act on, or null. Called only when it changes. */
  onNear: (id: string | null) => void
}) {
  const { playerRef, thingSpotsRef } = useSceneRefs()
  const clock = useRef(0)
  const last = useRef<string | null>(null)

  useFrame((_, delta) => {
    clock.current += delta
    if (clock.current < EVERY) return
    clock.current = 0

    const player = playerRef.current
    let best: string | null = null
    let bestDistance = USE_REACH

    for (const thing of things) {
      const spec = thing.blueprint?.spec
      if (!spec || (!all && !usable(spec))) continue

      /*
        Where it is drawn, and only the row as a fallback.

        The row is where a thing was *put*. A ball is the case that makes the
        difference the whole feature: it rolls where it is kicked and only
        writes itself down when it stops - and in a read-only room it never
        writes itself down at all. Measuring to the row meant "E to use" stayed
        at the cell the ball was summoned in, so getting it back meant walking
        to a spot with nothing standing on it.

        The fallback is not defensive tidying: <Usables> is handed the list a
        frame or two before the things themselves have mounted and published,
        and the row is the right answer for every one of them until they do.
        See `thingSpotsRef`.
      */
      const spot = thingSpotsRef.current.get(thing.id)

      // Feet rather than eye: a chair is at your feet, and measuring from the
      // camera would make a thing on the floor further away the taller the body.
      const dx = (spot?.x ?? thing.x + 0.5) - player.x
      const dz = (spot?.z ?? thing.z + 0.5) - player.z
      const dy = (spot?.y ?? thing.y) - (player.y - EYE_HEIGHT)
      const distance = Math.hypot(dx, dy, dz)

      if (distance < bestDistance) {
        best = thing.id
        bestDistance = distance
      }
    }

    if (best === last.current) return
    last.current = best
    onNear(best)
  })

  return null
}

export { freeSeat, seatOf }
