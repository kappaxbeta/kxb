'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Held } from '@/app/xp/_runtime/body/skinned'

/**
 * The gun you are holding, in first person.
 *
 * ---------------------------------------------------------------------------
 * What was wrong, which was not "it is missing"
 * ---------------------------------------------------------------------------
 * Reported as *"the weapon is not displayed"*, and the entity was there the
 * whole time. The weapon is parented at a socket on the player's blueprint -
 * `shooter`'s `hand` is (0.32, 1.15, 0.34) - and in third person that is a
 * decent guess at where a hand is. In first person the camera is at
 * `EYE_HEIGHT`, which is 1.7, so the *same* socket puts a 0.87-cell pistol
 * thirty-four centimetres from a 75° lens and fifty-five centimetres below it:
 * the grip is off the bottom of the screen, the barrel crosses the lower corner
 * at a size nothing can be recognised at, and the muzzle is never in frame.
 * What a player sees is a slab of geometry in the way, which is why the report
 * was that there was no gun rather than that the gun was misplaced.
 *
 * ---------------------------------------------------------------------------
 * A view model hangs off the camera, not off the body
 * ---------------------------------------------------------------------------
 * That is the whole fix and it is the standard one. A first-person weapon is a
 * *picture in front of a lens*: it is placed in the camera's own space, at a
 * distance chosen so the whole thing is in frame, and it does not care where
 * the body's arm is. Hanging it on the body instead means every document has to
 * author a socket that happens to be flattering to a camera, which is not a
 * thing an author can see while they are placing it.
 *
 * The entity is untouched. `WEAPON_ID` is still alive, still parented, still
 * where `worldTransform` says - so a `disarm` still takes it away, a script can
 * still find it, and the muzzle a tracer leaves from is still the engine's
 * answer rather than this file's. Only the *drawing* moved, which is the same
 * distinction `hide` already makes about the body.
 *
 * ---------------------------------------------------------------------------
 * The document's grip is deliberately not applied here
 * ---------------------------------------------------------------------------
 * `player.weapon`'s offset and angles are measured against a *hand*: they say
 * how a body holds this gun, and ./skinned hangs them off the hand bone. A
 * camera is not a hand, and half a metre in front of an eye is not a place any
 * of those numbers were chosen for. So this takes the model and its scale, and
 * the placement is the runtime's - one arrangement, the same in every document,
 * which is what a view model should be.
 *
 * ---------------------------------------------------------------------------
 * Known and not fixed: it can poke through a wall
 * ---------------------------------------------------------------------------
 * `PLAYER_RADIUS` is 0.3, so a player standing against a wall has less than a
 * third of a cell in front of them and the barrel reaches past it. Every engine
 * solves this the same way - the view model is drawn in a second pass with its
 * own depth buffer - and that is a renderer change rather than a placement one.
 * The version being replaced clipped through the same walls and was unreadable
 * as well.
 */

/**
 * Where the gun sits, in the camera's own space, in cells.
 *
 * Right and down and forward, which is where a hand holding something is when
 * you are looking past it. `ahead` is the load-bearing one: far enough that the
 * whole pistol is inside a 75° frustum (half a metre gives about ±0.38 vertical
 * to play with, and the model is 0.54 tall), near enough that it still reads as
 * being held rather than floating away in front.
 */
const AT = { right: 0.17, down: 0.17, ahead: 0.5 }

/**
 * Three's camera looks down **-z** and everything else in this engine faces
 * **+z**.
 *
 * The same off-by-180 `yawFor` in ./camera exists for, met at the other end: a
 * gun authored with its barrel along its own +z, dropped into camera space
 * unturned, points back at the player's face. Half a turn is the conversion
 * between the two conventions, not a fudge factor.
 */
const FACES_THE_LENS = Math.PI

/**
 * How far the gun kicks back and how far the barrel rises, per second of
 * recoil still counting down.
 *
 * `recoil` arrives as seconds remaining, not a 0..1 progress - `simulation.tsx`
 * counts it down from `RECOIL` (0.35s) to zero and this multiplies it straight,
 * so the kick is already at its strongest the instant a shot lands and eases
 * out as the countdown does, with no second curve to keep in step with the
 * one `SkinnedBody` plays on the arm in third person.
 */
const KICK_BACK = 0.35
const KICK_PITCH = 0.5

export function ViewModel({
  held,
  recoil,
}: {
  held: Held
  /**
   * Seconds left of the shot that just fired, the same countdown the body's
   * `Ranged_1H_Shoot` clip plays against - see `simulation.tsx`'s own `recoil`.
   * Absent draws the gun at rest, which is what a document with nothing to
   * fire from ever needs.
   */
  recoil?: React.RefObject<number>
}) {
  const { scene } = useGLTF(held.url)
  /**
   * Our own copy.
   *
   * `useGLTF` caches by URL and hands every caller the same object, and this one
   * is about to be given a position of its own - so a shared scene would move
   * every other drawing of the same model with it. The same trap ./skinned
   * documents at length, with a plain clone rather than `SkeletonUtils` because
   * a gun has no skeleton to rebind.
   */
  const gun = useMemo(() => scene.clone(true), [scene])

  const camera = useThree((state) => state.camera)
  const group = useRef<THREE.Group>(null)
  const held3 = useRef<THREE.Group>(null)

  useFrame(() => {
    const node = group.current
    if (!node) return
    /**
     * Copied every frame rather than parented to the camera.
     *
     * A component that adds itself to `state.camera` has to remember to take
     * itself off again on every view change, and reparenting behind React's back
     * is a thing the next person has to know about. Two values a frame is
     * cheaper than that.
     *
     * **World, not local.** The camera is a child of the rig `./player` mounts
     * for XR - `WebXRManager` composes a headset pose with
     * `camera.parent.matrixWorld`, so the rig carries the position and the
     * camera's own is deliberately zeroed. Copying `camera.position` put this
     * at the origin of the level, which drew a pistol standing in the middle of
     * the room and nothing at all in front of the player.
     */
    camera.getWorldPosition(node.position)
    camera.getWorldQuaternion(node.quaternion)

    const inner = held3.current
    if (!inner) return
    // Zero once nothing is counting down, rather than reading a ref that was
    // never handed to this component - a document with no weapon that fires
    // never gets here in the first place, but one that never has yet still
    // renders a gun at rest.
    const kick = recoil?.current ?? 0
    inner.position.set(AT.right, -AT.down, -AT.ahead + kick * KICK_BACK)
    inner.rotation.set(-kick * KICK_PITCH, FACES_THE_LENS, 0)
  })

  return (
    <group ref={group}>
      <group ref={held3} position={[AT.right, -AT.down, -AT.ahead]} rotation={[0, FACES_THE_LENS, 0]} scale={held.scale}>
        <primitive object={gun} raycast={() => null} />
      </group>
    </group>
  )
}
