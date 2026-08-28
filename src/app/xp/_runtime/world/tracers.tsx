'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { streak } from '@/app/xp/_runtime/world/streak'

/**
 * The bullet, as a streak you can see.
 *
 * A hitscan shot lands on the frame the button goes down (docs/xp/manual.md
 * §5.5) - the damage is already done and the rule has already fired by the time
 * anything is drawn. So this is not a projectile: it is the *record* of one,
 * travelling from the muzzle to where the shot actually landed, and nothing in
 * the simulation reads it.
 *
 * That split is the whole reason it is a separate file. A bullet that decided
 * what it hit would be a second answer to a question `castRay` already answered,
 * and the two would disagree the first time somebody strafed - the shot leaves
 * the eye and the streak leaves the gun, which are half a metre apart.
 *
 * ---------------------------------------------------------------------------
 * Why a streak and not a dot
 * ---------------------------------------------------------------------------
 * A bullet-sized object crossing a room in a fifth of a second is on screen for
 * three frames and covers most of a metre between each of them, so it reads as a
 * flicker somewhere in the middle distance. A streak is what a camera sees for
 * the same reason - it is the exposure rather than the object - and it is what
 * every game that draws tracers draws.
 *
 * The travel is worth keeping even though the shot is instant. Without it there
 * is a line between two points for a tenth of a second and no sense of
 * direction: you cannot tell a shot that went out from one that came in.
 */

/**
 * One shot, as the renderer needs it.
 *
 * `age` is advanced by the simulation's own frame loop rather than by this
 * component, and that is not an arbitrary place to put it: a ref passed down as
 * a prop and mutated by the child is the shape React's compiler refuses, and it
 * is right to - the thing that owns a mutation should be the thing that renders
 * what reads it. So this file only ever reads.
 *
 * `distance` is carried rather than recomputed for the same reason `age` is
 * advanced up there: whoever owns the list already knows it, and two places
 * working it out is two places that can round it differently.
 */
export interface Shot {
  from: { x: number; y: number; z: number }
  to: { x: number; y: number; z: number }
  /** How far the shot went, in cells. */
  distance: number
  /** Seconds since it was fired. */
  age: number
}

/**
 * How many can be in the air at once.
 *
 * A pool rather than a list, because this is a buffer on the GPU: growing it
 * means a new one, and a pistol fires about as fast as a person clicks. Anything
 * past this is dropped rather than queued - a tracer that arrives late is worse
 * than one that never arrives.
 */
const MAX = 16

export function Tracers({ shots }: { shots: React.RefObject<Shot[]> }) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  const scratch = useMemo(
    () => ({
      matrix: new THREE.Matrix4(),
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      /**
       * Where an unused slot goes.
       *
       * A zero scale rather than a position off in the distance: a degenerate
       * matrix draws nothing at all, where a far-away one is still a triangle
       * the GPU transforms.
       */
      hidden: new THREE.Matrix4().makeScale(0, 0, 0),
    }),
    [],
  )

  /**
   * Read-only, every frame.
   *
   * The ageing and the culling happen where the list lives - see `Shot`. What is
   * left here is a matrix per shot, which is the part that has to run at frame
   * rate and the part that cannot be tested.
   */
  useFrame(() => {
    const target = mesh.current
    const live = shots.current
    if (!target || !live) return

    let slot = 0
    for (const shot of live) {
      if (slot >= MAX) break

      const { head, tail } = streak(shot.age, shot.distance)
      const middle = (head + tail) / 2

      scratch.direction.set(
        shot.to.x - shot.from.x,
        shot.to.y - shot.from.y,
        shot.to.z - shot.from.z,
      )
      if (shot.distance > 1e-6) scratch.direction.divideScalar(shot.distance)

      scratch.position.set(
        shot.from.x + scratch.direction.x * middle,
        shot.from.y + scratch.direction.y * middle,
        shot.from.z + scratch.direction.z * middle,
      )
      scratch.quaternion.setFromUnitVectors(scratch.forward, scratch.direction)
      // Thin and long: the box is a unit cube, so this is the streak's own size.
      scratch.scale.set(0.05, 0.05, Math.max(head - tail, 0.01))
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale)
      target.setMatrixAt(slot, scratch.matrix)
      slot += 1
    }

    for (let spare = slot; spare < MAX; spare += 1) target.setMatrixAt(spare, scratch.hidden)
    target.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, MAX]}
      // The bounds would be recomputed from a buffer that changes every frame,
      // and a tracer is the one thing that must not be culled on the frame it
      // is fired.
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      {/*
        Unlit and untone-mapped, which is what makes it read as light rather
        than as a thin white object. `depthWrite` off so it does not carve a
        hole in whatever it passes in front of.
      */}
      <meshBasicMaterial color="#fde68a" toneMapped={false} transparent opacity={0.9} depthWrite={false} />
    </instancedMesh>
  )
}
