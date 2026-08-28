'use client'

import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import type { SolidTest } from '@/app/world/lounge/_sim/physics'
import { angleDelta } from '@/app/world/_presence/presence-core'
import type { AgentView } from '@/domain/agents/queries'
import {
  clipFor,
  createRoamer,
  POSTURE,
  type Roamable,
  seedFrom,
} from '@/domain/world/autonomy'
import { parseTile, type Tile, type TileKey } from '@/domain/world/grid'

/**
 * The bodies of the creatures that decide for themselves.
 *
 * All of the thinking is in `@/domain/world/autonomy`, which knows nothing about
 * three.js and is tested without a canvas. What is left here is the part that
 * genuinely needs a renderer: turning a position and a posture into a group
 * transform, and picking one of the model pack's four clips.
 *
 * Nothing in this file has React state that changes at the schedule's rate. The
 * pose is read straight into the object's transform inside `useFrame`, exactly
 * as `RemotePeep` does for other people, because a room of four animals
 * re-rendering on every frame is four hundred renders a second to move
 * something the reconciler never needed to know about.
 */

/**
 * How quickly a body turns toward the heading its schedule wants.
 *
 * Position out of `roamAt` is continuous by construction, but the heading is
 * not - it is redrawn per beat, and a body that snapped through a half turn the
 * instant a beat ticked over would read as a glitch rather than as an animal
 * looking round. So this is the one quantity that is smoothed rather than
 * evaluated.
 *
 * The smoothing is per-tab and therefore not identical between two people
 * watching, which is worth being explicit about: it converges within about a
 * second, and what it is converging *to* is shared exactly. Where an animal is
 * standing is the same on every screen; which way it is facing agrees a moment
 * later.
 */
const TURN_RATE = 6

/**
 * Turn a scene's collision test into "may a creature stand on this square".
 *
 * Every room already has a `SolidTest`, because the camera boom needs one, and
 * it speaks in the unit cells the borrowed character controller thinks in. A
 * square covers cells `2t-1` and `2t`, so asking about cell `2t` asks about the
 * square - which means no scene has to grow a second, parallel notion of what is
 * walkable that could drift out of step with what is actually solid.
 *
 * The `y` is half a unit: knee height, above the floor and below anything a
 * body would have to climb.
 */
function walkableFrom(solid: SolidTest): (tile: Tile) => boolean {
  return (tile) => !solid(tile.x * 2, 0.5, tile.z * 2)
}

/**
 * The room as anything with a mind of its own sees it.
 *
 * A hook rather than something each scene assembles, because two different
 * callers need the *same* object: the creatures, and the player's own autopilot.
 * Handing them one identity is what lets both share a cached route, and - more
 * to the point - stops the two drifting apart on what counts as a free square.
 *
 * `tiles` must be sorted. The order is part of the contract rather than a
 * tidiness preference: a perch is drawn from the list by index, so two tabs that
 * iterated a `Set` in different insertion orders would disagree about where an
 * animal lives. See `perchFor`.
 */
export function useRoamable(tiles: TileKey[], solid: SolidTest): Roamable {
  return useMemo<Roamable>(() => {
    const walkable = walkableFrom(solid)
    return {
      /**
       * Perches are drawn from the squares that are *free*, not from every
       * square with a floor.
       *
       * Filtered here rather than by each scene, because the alternative is
       * four rooms each deciding separately what counts as free and one of them
       * forgetting - at which point an animal spends a minute standing inside
       * the wardrobe. The route already respects the same predicate; this makes
       * the destination respect it too.
       */
      tiles: tiles.filter((key) => walkable(parseTile(key))),
      walkable,
    }
  }, [tiles, solid])
}

/**
 * Draw whatever creatures live in this room.
 *
 * `room` is one object rebuilt whenever the floor or the furniture changes,
 * which is what tells each roamer to throw away its cached route - drop a
 * bookcase across the doorway and the next frame paths around it rather than
 * walking through it for the rest of the minute.
 */
export function Roamers({ agents, room }: { agents: AgentView[]; room: Roamable }) {
  // Nowhere free to stand - a scene whose plan has not loaded, or a room
  // furnished wall to wall. `perchFor` refuses an empty room rather than
  // returning NaN, and drawing nothing for a frame beats throwing inside the
  // canvas, which takes the whole scene down with it.
  if (room.tiles.length === 0) return null

  return (
    <>
      {agents.map((agent) => (
        <Roamer key={agent.agentId} agent={agent} room={room} />
      ))}
    </>
  )
}

/** One creature, going about its day. */
function Roamer({ agent, room }: { agent: AgentView; room: Roamable }) {
  const group = useRef<THREE.Group>(null)
  const [clip, setClip] = useState<'idle' | 'walk'>('idle')

  /**
   * The schedule, with its route cached per window.
   *
   * Keyed on the agent id, which is also its seed, so this survives every
   * re-render for as long as the creature exists - and a creature released and
   * a new one adopted gets a fresh id, a fresh seed, and genuinely different
   * habits.
   */
  const roamer = useMemo(
    () => createRoamer(seedFrom(agent.agentId), room),
    // `room` is intentionally not a dependency: the roamer takes the current
    // room per call and invalidates its own cache when the object changes.
    // Rebuilding it here instead would throw away the cache on every frame in
    // which a scene handed down a fresh object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent.agentId],
  )

  useFrame((_, delta) => {
    const node = group.current
    if (!node) return

    /**
     * Epoch milliseconds, not `performance.now()`.
     *
     * This is the line the whole design rests on: two tabs agree because they
     * ask the same question of the same clock. `performance.now()` counts from
     * when *this* tab opened, so it would give every visitor their own private
     * version of the animal - and it would look completely fine locally.
     */
    const pose = roamer.at(Date.now(), room)
    const posture = POSTURE[pose.activity]

    node.position.set(pose.x, -posture.drop, pose.z)

    // Framerate-independent easing, matching what `advance` does for peers.
    const k = 1 - Math.exp(-TURN_RATE * delta)
    node.rotation.y += angleDelta(node.rotation.y, pose.yaw) * k
    node.rotation.x = posture.lean

    const next = clipFor(pose.activity)
    if (next !== clip) setClip(next)
  })

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {/* Not an obstacle to the build cursor, for the reason `RemotePeep`
            gives: being unable to place a sofa because the cat wandered into
            the square you were aiming at is worse than clipping through it. */}
        <AvatarModel model={agent.avatar} clip={clip} ignoreRay />
      </Suspense>
    </group>
  )
}
