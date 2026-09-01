'use client'

import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { chainAbove, holdPins, preBend, reachFor } from '@/app/ovaloffice/animator/ik'
import type { Pose, Quat } from '@/domain/animator/clip'
import { type BoneSpec, ROOT_BONE } from '@/domain/animator/rig'

/**
 * Grabbing a skeleton with a pointer, wherever the skeleton happens to be.
 *
 * Lifted out of `./stage` when the video studio needed the same thing: click a
 * body standing in a shot and drag its bones, without leaving the shot to open
 * a second editor. None of this was ever about the animator's dummy - the
 * handles are drawn from a bone list, the solver takes a spec lookup, and the
 * drag maths is in world space - so what stayed behind in `./stage` is the part
 * that loads a model and owns a document, and what moved here is the part that
 * turns a drag into a pose.
 *
 * Everything in this file lives inside a `<Canvas>`, and everything in it is
 * imperative: the solver writes straight into `THREE.Bone.quaternion` and React
 * only ever sees a `Pose` at the moments that matter - a handle released, a
 * playhead moved. See the note at the top of `./stage` about that split.
 */

/** What a caller is given once the model has loaded. */
export interface RigHandle {
  /** The glTF scene root. This is the object the exporter is handed. */
  root: THREE.Object3D
  bones: Map<string, THREE.Object3D>
  /** Local rotations as the model shipped. The pose everything is measured from. */
  rest: Pose
  restQuats: Map<string, THREE.Quaternion>
  capture: () => Pose
  apply: (pose: Pose) => void
}

const _v = new THREE.Vector3()
const _reach = new THREE.Vector3()

export function capture(bones: Map<string, THREE.Object3D>): Pose {
  const out: Record<string, Quat> = {}
  for (const [name, bone] of bones) {
    if (name === ROOT_BONE) continue
    const q = bone.quaternion
    out[name] = [q.x, q.y, q.z, q.w]
  }
  const root = bones.get(ROOT_BONE)
  return { root: root ? [root.position.x, root.position.y, root.position.z] : [0, 0, 0], bones: out }
}

export function apply(bones: Map<string, THREE.Object3D>, pose: Pose): void {
  for (const [name, bone] of bones) {
    const q = pose.bones[name]
    if (q) bone.quaternion.set(q[0], q[1], q[2], q[3])
  }
  const root = bones.get(ROOT_BONE)
  if (root) root.position.set(pose.root[0], pose.root[1], pose.root[2])
}

/**
 * A handle over an object that is already in the scene.
 *
 * The other way in, beside `./stage`'s own `Body`: that one clones a glTF it
 * loaded itself, and this one indexes a body somebody else drew - the actor
 * standing in a shot. The rest quaternions are read *now*, so this must be
 * called on a body at its bind pose, which is what `<Peep>` hands over.
 */
export function rigFrom(root: THREE.Object3D, specs: Record<string, BoneSpec>): RigHandle {
  const bones = new Map<string, THREE.Object3D>()
  const restQuats = new Map<string, THREE.Quaternion>()
  root.traverse((node) => {
    if (node.name === ROOT_BONE || specs[node.name] || (node as THREE.Bone).isBone) {
      bones.set(node.name, node)
      restQuats.set(node.name, node.quaternion.clone())
    }
  })

  return {
    root,
    bones,
    restQuats,
    rest: capture(bones),
    capture: () => capture(bones),
    apply: (pose: Pose) => apply(bones, pose),
  }
}

/**
 * The plane a drag happens on.
 *
 * A pointer is two numbers and a bone lives in three, so something has to
 * decide what the missing one is. The answer everywhere in 3D is a plane, and
 * the plane here faces the camera as it stood *when the drag began* - frozen,
 * not re-aimed each frame. A plane that kept facing a moving camera would
 * change what the same pointer movement means halfway through a gesture.
 *
 * Held horizontal instead when shift is down, which is how you slide a foot
 * along the floor without orbiting round to look from above first.
 */
function DragPlane({
  at,
  flat,
  onMove,
  onEnd,
}: {
  at: THREE.Vector3
  flat: boolean
  onMove: (point: THREE.Vector3) => void
  onEnd: () => void
}) {
  const camera = useThree((state) => state.camera)

  const quaternion = useMemo(() => {
    if (flat) return new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    return camera.quaternion.clone()
    // The camera is deliberately not a dependency: this is the orientation at
    // the moment the drag started, and it must not change under the hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat])

  return (
    <mesh
      position={at}
      quaternion={quaternion}
      onPointerMove={(event) => {
        event.stopPropagation()
        onMove(event.point)
      }}
      onPointerUp={(event) => {
        event.stopPropagation()
        onEnd()
      }}
      // A drag that leaves the plane - off the edge, or behind the camera when
      // the view is nearly edge-on to it - ends rather than freezing.
      onPointerLeave={() => onEnd()}
    >
      {/* Big enough that the edge is never reachable at any sane zoom. */}
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

interface Drag {
  bone: string
  at: THREE.Vector3
  flat: boolean
  /** Pointer-to-handle offset, so the handle does not jump to the cursor. */
  grab: THREE.Vector3
}

/**
 * One grabbable dot per bone.
 *
 * Drawn without depth testing and after everything else, so a handle inside the
 * chest is still clickable. The alternative - handles that hide behind the body
 * they belong to - means orbiting the camera before every other drag.
 *
 * Sized by distance rather than in world units, so they stay the same size on
 * screen whether you are framing the whole figure or a hand.
 */
function Handles({
  rig,
  bones,
  selected,
  hovered,
  pins,
  dragging,
  grabbable,
  slideMode,
  onHover,
  onGrab,
}: {
  rig: RigHandle
  /** Which handles to draw. The posed body's list. */
  bones: BoneSpec[]
  selected: string | null
  hovered: string | null
  pins: ReadonlySet<string>
  dragging: boolean
  grabbable: boolean
  slideMode: boolean
  onHover: (bone: string | null) => void
  onGrab: (bone: string, point: THREE.Vector3, flat: boolean) => void
}) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((state) => state.camera)

  /**
   * Only the bones this body actually has.
   *
   * The list is the *rig's* - what a dummy or a peep is made of - and the body
   * on screen may be missing one of them: a look whose glTF names a joint
   * differently, or a peep drawn from a file with no tail. A handle for a bone
   * that is not there never gets positioned or scaled by the loop below, so it
   * sits at the world origin at full size: a two-metre sphere in the middle of
   * the scene that swallows every click meant for the body behind it. Reported
   * as "there is a wrong big button", and as being unable to pick a bone at
   * all - which was the same sphere, eating the clicks.
   */
  const drawn = useMemo(() => bones.filter((spec) => rig.bones.has(spec.name)), [bones, rig])

  useFrame(() => {
    const node = group.current
    if (!node) return
    for (const child of node.children) {
      const bone = rig.bones.get(child.name)
      if (!bone) continue
      bone.getWorldPosition(child.position)
      const size = camera.position.distanceTo(child.position) * 0.018
      child.scale.setScalar(Math.min(Math.max(size, 0.02), 0.09))
    }
  })

  return (
    <group ref={group}>
      {drawn.map((spec) => {
        const isSelected = selected === spec.name
        const isPinned = pins.has(spec.name)
        return (
          <mesh
            key={spec.name}
            name={spec.name}
            renderOrder={999}
            // Small until the first frame places it. The loop above sizes every
            // handle, but the frame before it runs is a frame where a fresh
            // mesh is drawn at its authored radius.
            scale={0.05}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation()
              if (!dragging) onHover(spec.name)
            }}
            onPointerOut={() => onHover(null)}
            onPointerDown={(event: ThreeEvent<PointerEvent>) => {
              if (event.button !== 0 || !grabbable) return
              event.stopPropagation()
              onGrab(spec.name, event.point, event.shiftKey || slideMode)
            }}
          >
            {/* The hips are the whole body's handle, so they are the big one. */}
            <sphereGeometry args={[spec.name === 'hips' ? 1.5 : 1, 12, 10]} />
            <meshBasicMaterial
              color={
                isPinned ? '#4ade80' : isSelected ? '#f0abfc' : hovered === spec.name ? '#fde68a' : '#94a3b8'
              }
              depthTest={false}
              transparent
              opacity={isSelected || hovered === spec.name || isPinned ? 0.95 : 0.6}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * The handles, and the pointer maths behind them.
 *
 * The whole of "you can pose this body", as one element to drop beside
 * whatever drew the body. The caller keeps the model, the document and the
 * selection; this owns the gesture.
 */
export function Posing({
  rig,
  bones,
  specs,
  selected,
  pins,
  grabbable = true,
  slideMode = false,
  onSelect,
  onPose,
  onDragging,
}: {
  rig: RigHandle
  /** Which handles to draw - the body's own bone list. */
  bones: BoneSpec[]
  /** Every bone by name, for the solver's reach and hinge rules. */
  specs: Record<string, BoneSpec>
  selected: string | null
  /** Bones held where they are while everything above them moves. */
  pins?: ReadonlySet<string>
  /** False while the camera has the left button - see the Look toggle. */
  grabbable?: boolean
  /** Drags along the floor without the shift key, for touch. */
  slideMode?: boolean
  onSelect: (bone: string) => void
  /** `keyable` is true for a deliberate drag, so auto-key may fire on it. */
  onPose: (pose: Pose, keyable: boolean) => void
  onDragging: (dragging: boolean) => void
}) {
  /**
   * The gesture, in state rather than in a ref.
   *
   * The bones are imperative, but a drag *starting* and *ending* are two
   * renders per gesture, not sixty per second: what has to change is which dot
   * is lit and whether the orbit control may have the left button.
   */
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const held = pins ?? EMPTY_PINS

  /**
   * Whether the pointer actually moved a bone before it was let go.
   *
   * Clicking a handle is how you *select* a joint - it is the only way to pick
   * one in the viewport - and a click is a press and a release with nothing in
   * between. Reporting a pose for one means selecting a joint silently writes a
   * key, and in the video studio that also lays down a Pose beat: an editor
   * where looking at a bone edits the shot. So a gesture that solved nothing
   * ends as a selection and nothing more.
   */
  const moved = useRef(false)

  /** Where each pinned bone was pinned. Never read while rendering. */
  const pinPoints = useRef(new Map<string, THREE.Vector3>())

  /**
   * Pins, kept in step with what the panel has ticked.
   *
   * A pin remembers where the foot was *when it was pinned*, so ticking it is
   * "leave this here" rather than "snap this to the floor". Unticking forgets.
   */
  useEffect(() => {
    for (const name of held) {
      if (pinPoints.current.has(name)) continue
      const bone = rig.bones.get(name)
      if (bone) pinPoints.current.set(name, bone.getWorldPosition(new THREE.Vector3()))
    }
    for (const name of [...pinPoints.current.keys()]) {
      if (!held.has(name)) pinPoints.current.delete(name)
    }
  }, [held, rig])

  const onGrab = useCallback(
    (bone: string, point: THREE.Vector3, flat: boolean) => {
      const target = rig.bones.get(bone)
      if (!target) return

      onSelect(bone)
      moved.current = false

      const at = target.getWorldPosition(new THREE.Vector3())
      setDrag({ bone, at, flat, grab: at.clone().sub(point) })

      const spec = specs[bone]
      if (spec && spec.reach > 0) preBend(chainAbove(target, spec.reach), specs, rig.restQuats)

      onDragging(true)
    },
    [rig, specs, onSelect, onDragging],
  )

  const onMove = useCallback(
    (point: THREE.Vector3) => {
      if (!drag) return

      const target = rig.bones.get(drag.bone)
      const spec = specs[drag.bone]
      if (!target || !spec) return

      moved.current = true
      _v.copy(point).add(drag.grab)

      if (spec.reach === 0) {
        /**
         * The hips: the one handle that moves rather than turns.
         *
         * Written onto `root` and not onto the hips bone itself. The hips are
         * inside the skin, so translating them slides the mesh off the
         * skeleton's own origin and anything later parented to the model - a
         * hat, a held prop - stays behind.
         */
        const root = rig.bones.get(ROOT_BONE)
        if (!root) return
        const bone = target.getWorldPosition(_reach)
        root.position.add(_v.sub(bone))
        root.updateMatrixWorld(true)
        holdPins(pinPoints.current, rig.bones, specs, rig.restQuats)
      } else {
        reachFor(target, chainAbove(target, spec.reach), _v, specs, rig.restQuats)
      }
    },
    [rig, specs, drag],
  )

  const onEnd = useCallback(() => {
    if (!drag) return
    setDrag(null)
    onDragging(false)

    // Dragging a pinned foot moves the pin with it. The alternative - a pin
    // that remembers only where it was first ticked - means every deliberate
    // step is undone by the next thing that moves the hips.
    const pinned = pinPoints.current.get(drag.bone)
    if (pinned) rig.bones.get(drag.bone)?.getWorldPosition(pinned)

    // A click that solved nothing is a selection - see `moved`.
    if (!moved.current) return
    onPose(rig.capture(), true)
  }, [rig, drag, onDragging, onPose])

  /**
   * A release anywhere ends the drag.
   *
   * The plane's own `onPointerUp` covers letting go inside the viewport, which
   * is almost always. This covers the rest: a button released over the panel,
   * over another window, or after the pointer left the page entirely. Without
   * it those all leave the rig stuck to the pointer with nothing pressed.
   */
  useEffect(() => {
    if (!drag) return
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
  }, [drag, onEnd])

  return (
    <>
      <Handles
        rig={rig}
        bones={bones}
        selected={selected}
        hovered={hovered}
        pins={held}
        dragging={drag !== null || !grabbable}
        grabbable={grabbable}
        slideMode={slideMode}
        onHover={setHovered}
        onGrab={onGrab}
      />
      {drag && (
        <DragPlane
          // Keyed on the bone so that starting a new drag builds a new plane
          // rather than reusing the last one's frozen orientation.
          key={`${drag.bone}-${drag.flat}`}
          at={drag.at}
          flat={drag.flat}
          onMove={onMove}
          onEnd={onEnd}
        />
      )}
    </>
  )
}

const EMPTY_PINS: ReadonlySet<string> = new Set()
