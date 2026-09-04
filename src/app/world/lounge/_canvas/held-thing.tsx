'use client'

import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

import { HAND_NODES, type HoldSpec } from '@/domain/thingiverse/hold'
import { drawingOf, modelUrlFor } from '@/domain/thingiverse/models'

/**
 * The thing in somebody's hand, drawn on their body.
 *
 * ---------------------------------------------------------------------------
 * It follows the hand rather than being parented to it
 * ---------------------------------------------------------------------------
 * The obvious way to hang a pistol off a fist is `bone.add(pistol)`, and it is
 * the one thing this deliberately does not do: the bone belongs to a cloned
 * glTF that React three owns, reparenting is a scene-graph edit made behind the
 * renderer's back, and every version of that trick ends the same way - a model
 * left hanging off a skeleton that has since been swapped for somebody else's.
 *
 * So this stays an ordinary child of the body group and *copies* the hand's
 * transform every frame, expressed back in the body's own frame. Two matrix
 * operations per held thing per frame, at most one per person in the room, and
 * nothing outside this component is touched.
 *
 * The bone's own scale is dropped on the way through. A rig's chain is scale 1
 * everywhere it matters, and the one time it is not is a body somebody has
 * squashed - at which point inheriting it would mean a gun that stretches when
 * its owner does, which is not what "held" looks like.
 *
 * ---------------------------------------------------------------------------
 * A body may not have a hand, and then it holds it anyway
 * ---------------------------------------------------------------------------
 * A peep is seven nodes and none of them is an arm (see `./hold`). Rather than
 * drawing nothing - which is a burger that exists in a pocket, in a slot, in a
 * recipe, and nowhere anybody can see - the anchor falls back to the body's own
 * origin, so a fox carries its sandwich at chest height. Visible and nudgeable
 * beats invisible and correct.
 *
 * ---------------------------------------------------------------------------
 * No floor lift
 * ---------------------------------------------------------------------------
 * `drawingOf().lift` is the answer to "how far up does this have to go to stand
 * on the ground", and a hand is not the ground. Half the catalogue's props are
 * drawn around their own centre precisely because they hang off things, so
 * ignoring the lift is what puts the middle of a pistol in the middle of a
 * fist. The `hold` block's own offset is the nudge from there.
 */
export function HeldThing({
  model,
  hold,
  /** The blueprint's own size, so a thing is held at the size it is. */
  scale,
}: {
  model: string
  hold: HoldSpec
  scale: number
}) {
  return (
    // A model that has not arrived draws nothing rather than a placeholder: a
    // grey box in somebody's hand reads as a bug, and a hand that fills in a
    // beat later reads as a download.
    <Suspense fallback={null}>
      <Held model={model} hold={hold} scale={scale} />
    </Suspense>
  )
}

function Held({ model, hold, scale }: { model: string; hold: HoldSpec; scale: number }) {
  const gltf = useGLTF(modelUrlFor(model))
  const object = useMemo(() => {
    const copy = gltf.scene.clone(true)
    // Not a target for the crosshair. A gun in somebody's hand standing between
    // you and the wall you are building on would make the room unbuildable
    // wherever anybody happens to be holding something.
    copy.traverse((node) => {
      node.userData = { ...node.userData, ignoreRay: true }
    })
    return copy
  }, [gltf])

  const anchor = useRef<THREE.Group>(null)
  /** The hand, once it has been found. Bodies arrive a frame or two late. */
  const hand = useRef<THREE.Object3D | null>(null)
  const local = useMemo(() => new THREE.Matrix4(), [])
  const inverse = useMemo(() => new THREE.Matrix4(), [])
  const spare = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const node = anchor.current
    const body = node?.parent
    if (!node || !body) return

    if (!hand.current || !hand.current.parent) {
      // Searched until found rather than once on mount: the body is behind its
      // own Suspense, so on the frame this first runs there is often nothing
      // under the group yet. A traverse over thirty nodes is cheap, and it
      // stops the moment there is something to hold on to.
      hand.current = body.getObjectByName(HAND_NODES[hold.hand]) ?? null
      if (!hand.current) return
    }

    hand.current.updateWorldMatrix(true, false)
    inverse.copy(body.matrixWorld).invert()
    local.multiplyMatrices(inverse, hand.current.matrixWorld)
    local.decompose(node.position, node.quaternion, spare)
  })

  /**
   * Both scales, multiplied, and the pack's conversion with them.
   *
   * The same sum `pieceTransform` does for a bolted-on piece, minus the lift:
   * what a pack calls a unit, times how big this blueprint is, times how big it
   * is *while held*. Three numbers because they answer three questions and a
   * single one would have to be wrong for two of them.
   */
  const size = (drawingOf(model)?.scale ?? 1) * scale * hold.scale

  return (
    <group ref={anchor}>
      <group
        position={[hold.at.x, hold.at.y, hold.at.z]}
        rotation={[hold.turn.x, hold.turn.y, hold.turn.z]}
        scale={size}
      >
        <primitive object={object} />
      </group>
    </group>
  )
}
