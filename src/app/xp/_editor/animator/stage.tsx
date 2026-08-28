'use client'

/**
 * Copied from `src/app/ovaloffice/animator/stage.tsx`.
 *
 * `src/app/xp/` owns what it draws, and the copy is the rule rather than an
 * accident: docs/xp-creator.md §1.2, enforced by `no-restricted-imports` in
 * eslint.config.mjs. The backoffice's animator is a live surface and this
 * editor is a prototype; sharing one would mean the prototype either drags
 * the product about or waits behind it, and the two are allowed to differ.
 *
 * Verbatim as of this commit, so a diff against the original is the honest
 * way to see how far the two have drifted. Fix things here when they are
 * this editor's problem; the other copy does not hear about it.
 */

import { useGLTF } from '@react-three/drei'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { chainAbove, dragBone, holdPins, preBend, type Solver } from '@/app/xp/_editor/animator/ik'
import { HANDS, type Held } from '@/app/xp/_runtime/body/skinned'
import { Lights } from '@/app/xp/_editor/animator/light'
import { type AnimationDoc, type Pose, type Quat, samplePose } from '@/app/xp/_editor/animator/clip'
import type { Rig } from '@/app/xp/_editor/animator/rig'
import { DEFAULT_LIGHT } from '@/app/xp/_editor/animator/light'

/**
 * The dummy, the handles on it, and the pointer maths that turns a drag into a
 * pose. Everything in this file lives inside the `<Canvas>`.
 *
 * ---------------------------------------------------------------------------
 * Why the bones are not React state
 * ---------------------------------------------------------------------------
 * A drag runs at the refresh rate and touches 23 quaternions a frame. Putting
 * that through `useState` would re-render the whole editor - a timeline, a bone
 * list, a panel of sliders - sixty times a second while you are trying to place
 * a hand, and the hand would lag the pointer for no reason the person dragging
 * could see.
 *
 * So the live rig is imperative: the solver writes straight into
 * `THREE.Bone.quaternion` and the canvas draws it. React only ever sees a
 * `Pose` - a plain object of numbers - and only at the moments that matter: you
 * let go of a handle, you move the playhead, you press a key. The document is
 * React's; the puppet is three.js's. See the note in `@/app/xp/_editor/animator/clip`
 * about that split.
 */

/** What the editor is given once the model has loaded. */
export interface RigHandle {
  /** The glTF scene root. This is the object the exporter is handed. */
  root: THREE.Object3D
  bones: Map<string, THREE.Object3D>
  /** Local rotations as the model shipped. The pose everything is measured from. */
  rest: Pose
  restQuats: Map<string, THREE.Quaternion>
  /**
   * A point out along each single-segment part. See `BoneSpec.swivel`.
   *
   * Empty for the dummy, which has no such parts. One per leg, wing and tail
   * the loaded peep actually has - so a fish's map holds two entries and a
   * parrot's holds seven, off the same table.
   */
  tips: Map<string, THREE.Object3D>
  capture: () => Pose
  apply: (pose: Pose) => void
}

const _v = new THREE.Vector3()
const _reach = new THREE.Vector3()
/** The camera's screen basis, for the pad's nudge. */
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _euler = new THREE.Euler()

function capture(bones: Map<string, THREE.Object3D>, rootName: string): Pose {
  const out: Record<string, Quat> = {}
  for (const [name, bone] of bones) {
    if (name === rootName) continue
    const q = bone.quaternion
    out[name] = [q.x, q.y, q.z, q.w]
  }
  const root = bones.get(rootName)
  return { root: root ? [root.position.x, root.position.y, root.position.z] : [0, 0, 0], bones: out }
}

function apply(bones: Map<string, THREE.Object3D>, pose: Pose, rootName: string): void {
  for (const [name, bone] of bones) {
    const q = pose.bones[name]
    if (q) bone.quaternion.set(q[0], q[1], q[2], q[3])
  }
  const root = bones.get(rootName)
  if (root) root.position.set(pose.root[0], pose.root[1], pose.root[2])
}

/**
 * A point out along a one-segment part, in that part's own space.
 *
 * The effector `swivel` needs. Taken from the *drawn* geometry rather than
 * guessed at a fixed distance down some axis, because the parts are not drawn
 * along a shared axis: a leg hangs down, a wing sticks out sideways, a tail
 * points back. The centre of what you can see is the point a person is aiming
 * when they grab that handle and pull.
 *
 * Measured once, at the bind pose, before anything has been posed - which is the
 * only moment it is meaningful, since the whole point is that it then rides
 * along with the bone it belongs to.
 */
function tipOf(node: THREE.Object3D): THREE.Object3D | null {
  const box = new THREE.Box3().setFromObject(node)
  if (box.isEmpty()) return null
  const centre = node.worldToLocal(box.getCenter(new THREE.Vector3()))
  // A part whose drawn centre sits on its own pivot has no direction to be
  // pointed in, and there is nothing sensible to invent. Refusing here is what
  // makes `dragBone`'s fallback a no-op rather than a wrong answer.
  if (centre.lengthSq() < 1e-8) return null

  const tip = new THREE.Object3D()
  tip.name = `${node.name}::tip`
  tip.position.copy(centre)
  node.add(tip)
  tip.updateMatrixWorld(true)
  return tip
}

/**
 * The model, cloned, with its parts indexed.
 *
 * `SkeletonUtils.clone` rather than `Object3D.clone`, because the dummy is
 * skinned: a plain clone copies the meshes but leaves them bound to the
 * *original* skeleton, so posing the copy moves nothing and posing the original
 * moves a body that is not on screen.
 *
 * A peep is unskinned - six rigid meshes on a node hierarchy - and a plain clone
 * would do. It goes through the same call anyway, because `SkeletonUtils.clone`
 * falls through to an ordinary deep clone when there is nothing bound, and one
 * path that is right for both beats a branch that has to be right twice.
 *
 * The clone also means the editor starts from the bind pose on every mount,
 * rather than from whatever the last session left in `useGLTF`'s cache.
 */
function Body({ rig: spec, url, onReady }: { rig: Rig; url: string; onReady: (rig: RigHandle) => void }) {
  const { scene } = useGLTF(url)

  const rig = useMemo<RigHandle>(() => {
    const root = cloneSkinned(scene)

    const bones = new Map<string, THREE.Object3D>()
    const restQuats = new Map<string, THREE.Quaternion>()
    root.traverse((node) => {
      // The body is not clickable: every pointer event in the viewport belongs
      // either to a handle or to the camera. A mesh that ate clicks would mean
      // a handle behind an arm could not be grabbed, and the handles are drawn
      // in front of the body precisely so that never happens.
      node.raycast = () => null
      if (node.name === spec.root || spec.specs[node.name] || (node as THREE.Bone).isBone) {
        bones.set(node.name, node)
        restQuats.set(node.name, node.quaternion.clone())
      }
    })

    /**
     * The tips, built after the walk rather than during it.
     *
     * `tipOf` reads world bounds and adds a child, and doing either inside a
     * `traverse` is mutating the thing being walked - which three's traversal
     * does not promise to survive, and which would in any case measure a part's
     * box *including* the tip added to the part before it.
     */
    const tips = new Map<string, THREE.Object3D>()
    root.updateMatrixWorld(true)
    for (const [name, node] of bones) {
      if (!spec.specs[name]?.swivel) continue
      const tip = tipOf(node)
      if (tip) tips.set(name, tip)
    }

    return {
      root,
      bones,
      restQuats,
      tips,
      rest: capture(bones, spec.root),
      capture: () => capture(bones, spec.root),
      apply: (pose: Pose) => apply(bones, pose, spec.root),
    }
  }, [scene, spec])

  useEffect(() => onReady(rig), [rig, onReady])

  return <primitive object={rig.root} />
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
/**
 * One world axis, or none.
 *
 * Held by the panel rather than the stage: it is a *mode* somebody is in, it
 * survives letting go of a handle, and the buttons that set it are up in the
 * chrome beside Look and Floor.
 */
export type DragAxis = 'x' | 'y' | 'z'

const AXIS_DIR: Record<DragAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

/**
 * The point a locked drag is actually asking for.
 *
 * Everything a drag does goes through one target point - the hips translate to
 * it, and `dragBone` asks the solver to reach it - so constraining the point is
 * the whole of the axis lock. There is no second path to keep in step.
 *
 * The projection is onto the *line* through where the handle started, not onto
 * a plane: a lock is "this hand may only move along x", so the other two
 * components are held at the values they had when the drag began.
 */
export function alongAxis(point: THREE.Vector3, from: THREE.Vector3, axis: DragAxis): THREE.Vector3 {
  const dir = AXIS_DIR[axis]
  return from.clone().addScaledVector(dir, point.clone().sub(from).dot(dir))
}

function DragPlane({
  at,
  flat,
  axis,
  onMove,
  onEnd,
}: {
  at: THREE.Vector3
  flat: boolean
  /** The locked axis, if there is one. See `alongAxis`. */
  axis: DragAxis | null
  onMove: (point: THREE.Vector3) => void
  onEnd: () => void
}) {
  const camera = useThree((state) => state.camera)

  const quaternion = useMemo(() => {
    /**
     * A locked drag gets a plane that *contains* its axis.
     *
     * The camera-facing plane is wrong for a lock and wrong in the way that
     * looks like the feature is broken rather than misaimed: with the camera
     * looking along y, a y-lock projected onto a camera-facing plane has
     * almost no travel, so the handle sticks and nothing moves. Face the plane
     * at the camera as far as it can while still holding the axis, which is
     * the camera's own direction with the axis component taken out.
     *
     * Degenerate when the camera is looking straight down the axis - there is
     * no such plane - and any perpendicular will do there, because the drag has
     * no visible travel either way and the numbers still come out right.
     */
    if (axis) {
      const dir = AXIS_DIR[axis]
      const view = camera.getWorldDirection(new THREE.Vector3())
      const normal = view.clone().addScaledVector(dir, -view.dot(dir))
      if (normal.lengthSq() < 1e-6) normal.copy(dir.x === 1 ? AXIS_DIR.y : AXIS_DIR.x)
      return new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        normal.normalize(),
      )
    }
    if (flat) return new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
    return camera.quaternion.clone()
    // The camera is deliberately not a dependency: this is the orientation at
    // the moment the drag started, and it must not change under the hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, axis])

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

/**
 * The held thing, on the hand, while a pose is authored.
 *
 * The runtime's `armed` (see body/skinned.tsx) translated to this stage: same
 * hand-bone preference order, same grip fields, same yaw-pitch-roll order -
 * so what the pose editor shows in the hand is what the game will put there.
 * Two deliberate differences. The rest frame is composed from `restQuats`
 * rather than read off the bone, because here the bone is mid-pose the whole
 * time and the runtime's read-once-at-bind trick has no once to read at. And
 * there is no body-scale undo, because the stage draws the body at the GLB's
 * own size.
 *
 * An effect rather than a memo: it is a scene-graph mutation with a cleanup,
 * and the grip changing while the panel's numbers are dialled is the normal
 * case rather than the exception.
 */
function HeldItem({ rig, held }: { rig: RigHandle; held: Held }) {
  const { scene } = useGLTF(held.url)

  useEffect(() => {
    let bone: THREE.Object3D | undefined
    for (const name of HANDS) {
      bone = rig.bones.get(name)
      if (bone) break
    }
    if (!bone) return

    const item = cloneSkinned(scene)
    item.scale.setScalar(held.scale)

    /** The bone's bind orientation, composed up the chain from the rig's own
        rest - the same correction gripFrame makes, in the one place the bind
        pose survives as data rather than as the scene's current state. */
    const rest = new THREE.Quaternion()
    for (let node: THREE.Object3D | null = bone; node && node !== rig.root; node = node.parent) {
      rest.premultiply(rig.restQuats.get(node.name) ?? node.quaternion)
    }
    rest.invert()

    item.position.set(held.x ?? 0, held.y ?? 0, held.z ?? 0).applyQuaternion(rest)
    item.quaternion.copy(rest).multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(held.pitch ?? 0),
          THREE.MathUtils.degToRad(held.yaw ?? 0),
          THREE.MathUtils.degToRad(held.roll ?? 0),
          'YXZ',
        ),
      ),
    )

    bone.add(item)
    const holder = bone
    return () => {
      holder.remove(item)
    }
  }, [rig, scene, held])

  return null
}

interface Drag {
  bone: string
  at: THREE.Vector3
  flat: boolean
  /** Frozen at grab time - see `onGrab`. */
  axis: DragAxis | null
  /** Pointer-to-handle offset, so the handle does not jump to the cursor. */
  grab: THREE.Vector3
}

/**
 * Move the selected bone from outside the canvas: the pad's half of a drag.
 *
 * `dx`/`dy` are pixels of pad travel, `+y` meaning screen-up, and the stage
 * turns them into the same camera-facing motion a direct drag makes - which
 * is the entire point: a thumb on a pad and a fingertip on the handle are the
 * one gesture at two sizes, not two features. `'start'` pre-bends the chain
 * exactly as a grab does, `'end'` captures the pose keyably exactly as a
 * release does.
 *
 * `space` is what the two numbers point along, and defaults to the pad's
 * camera plane - see `NudgeSpace`.
 */
export type Nudge = (
  dx: number,
  dy: number,
  phase: 'start' | 'move' | 'end',
  space?: NudgeSpace,
) => void

/**
 * Which two directions a nudge's pixels mean.
 *
 * `'screen'` is the pad, and the default: the camera's right and up, the plane
 * a free drag already moves in. `'up'` is the lift knob, where `dy` is world
 * `+Y` whatever the camera is doing and `dx` is unused.
 *
 * Two spaces rather than two functions because everything either one needs
 * around the move is identical - the pre-bend on `'start'`, the pinned-point
 * update and the keyable capture on `'end'`. A second `onLift` would be that
 * whole paragraph written twice, and the second copy is the one that stops
 * matching the first.
 */
export type NudgeSpace = 'screen' | 'up'

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
  spec: skeleton,
  selected,
  hovered,
  pins,
  dragging,
  grabbable,
  onHover,
  onGrab,
}: {
  rig: RigHandle
  spec: Rig
  selected: string | null
  hovered: string | null
  pins: ReadonlySet<string>
  dragging: boolean
  /** See the note on the same prop in `AnimatorStage`. */
  grabbable: boolean
  onHover: (bone: string | null) => void
  onGrab: (bone: string, point: THREE.Vector3, flat: boolean) => void
}) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((state) => state.camera)

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
      {/*
        Only the parts this model actually has.

        `rig.bones` comes off the loaded file and the table is the union of the
        pack - a fish has no legs and a bunny has no tail - so a handle drawn
        from the table alone would be a dot you can grab that is attached to
        nothing, sitting at the origin at its unscaled size. Which is precisely
        the failure `rig.test.ts` was written about, arriving from the other
        direction.
      */}
      {skeleton.bones.filter((spec) => rig.bones.has(spec.name)).map((spec) => {
        const isSelected = selected === spec.name
        const isPinned = pins.has(spec.name)
        return (
          <mesh
            key={spec.name}
            name={spec.name}
            renderOrder={999}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              event.stopPropagation()
              if (!dragging) onHover(spec.name)
            }}
            onPointerOut={() => onHover(null)}
            onPointerDown={(event: ThreeEvent<PointerEvent>) => {
              if (event.button !== 0 || !grabbable) return
              event.stopPropagation()
              onGrab(spec.name, event.point, event.shiftKey)
            }}
          >
            {/*
              The handle that moves the whole figure is the big one - the hips
              on the dummy, the body on a peep. Asked as "the one that
              translates" rather than by name, so the second rig did not need a
              second special case.
            */}
            <sphereGeometry args={[spec.reach === 0 && !spec.swivel ? 1.5 : 1, 12, 10]} />
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
 * The playhead, applied to the rig.
 *
 * Also where playback's clock lives. Time is a ref shared with the editor
 * rather than state owned by it: sixty state updates a second through a React
 * tree this size is the difference between a smooth playhead and a stuttering
 * one, and the ref is what the frame loop reads while `onTime` only mirrors it
 * out for the parts that draw.
 */
function Playhead({
  rig,
  doc,
  timeRef,
  playing,
  dragging,
  frozen,
  onTime,
  onSettle,
}: {
  rig: RigHandle
  doc: AnimationDoc
  timeRef: React.RefObject<number>
  playing: boolean
  dragging: boolean
  /**
   * Hands off the rig entirely.
   *
   * A ref rather than a prop value because the thing that sets it - the GLB
   * export - has to know the rig is safe *before* React has re-rendered. See
   * the note at its call site.
   */
  frozen: React.RefObject<boolean>
  onTime: (time: number) => void
  onSettle: (pose: Pose) => void
}) {
  const applied = useRef('')

  useFrame((_, delta) => {
    // A drag owns the rig outright. Nothing else may write a bone while a hand
    // is being held, or the pose would fight the pointer.
    if (dragging || frozen.current) {
      applied.current = ''
      return
    }

    if (playing) {
      let next = timeRef.current + delta
      if (next > doc.duration) next = doc.loop ? next % doc.duration : doc.duration
      timeRef.current = next
      onTime(next)
    }

    // Re-applied only when the playhead or the document has actually moved.
    // Without this the rig would be overwritten every frame, which would undo
    // any pose the panel's sliders had just set without keying it.
    const stamp = `${timeRef.current.toFixed(4)}|${doc.keys.length}|${docStamp(doc)}`
    if (stamp === applied.current) return
    applied.current = stamp

    const pose = samplePose(doc, timeRef.current, rig.rest)
    rig.apply(pose)
    // The panel's read of the pose is deliberately not updated during
    // playback: it would be a state write per frame to show numbers nobody can
    // read while they are moving.
    if (!playing) onSettle(pose)
  })

  return null
}

/** Cheap identity for "has anything in the document changed". */
function docStamp(doc: AnimationDoc): string {
  let sum = 0
  for (const key of doc.keys) sum += key.time * 1000 + key.ease.length + key.pose.root[1] * 977
  return `${sum.toFixed(3)}|${doc.fps}|${doc.duration}`
}

export function AnimatorStage({
  skeleton,
  url,
  doc,
  timeRef,
  playing,
  frozen,
  selected,
  pins,
  showGrid,
  grabbable,
  axis,
  onReady,
  onTime,
  onSelect,
  onPose,
  onDragging,
  onNudge,
  held,
}: {
  /**
   * Which rig is being posed.
   *
   * Everything that used to be a module constant in `./rig` - the handles, the
   * root node, which joints hinge - comes through here now, because there are
   * two of them and a viewport cannot import the answer.
   */
  skeleton: Rig
  /**
   * The model file, separately from the rig.
   *
   * Two props rather than one because they are two choices. The peeps are one
   * rig and twenty-four models: swapping a fox for an elephant changes what is
   * on screen and nothing about what is being authored, since the part names
   * are identical across the pack. Folding them together would mean twenty-four
   * rigs, all the same.
   */
  url: string
  doc: AnimationDoc
  timeRef: React.RefObject<number>
  playing: boolean
  /** See `Playhead`. Set while the exporter needs the rig held still. */
  frozen: React.RefObject<boolean>
  selected: string | null
  pins: ReadonlySet<string>
  showGrid: boolean
  /**
   * Whether the handles may claim a pointer at all.
   *
   * False while the viewport's Look button has lent the single touch finger to
   * the camera. The handles stop answering rather than the camera stopping,
   * because a handle that still highlighted under a finger that was turning
   * the view would be promising something it is not about to do.
   */
  grabbable: boolean
  /**
   * Which world axis a drag is locked to, or null for the free plane.
   *
   * A prop rather than state here: the buttons are in the panel's chrome, the
   * mode outlives any one drag, and the stage is handed what to do exactly as
   * it is handed `pins` and `showGrid`.
   */
  axis: DragAxis | null
  onReady: (rig: RigHandle) => void
  onTime: (time: number) => void
  onSelect: (bone: string) => void
  /** A pose the editor should take as current: after a drag, or after a scrub. */
  onPose: (pose: Pose, keyable: boolean) => void
  onDragging: (dragging: boolean) => void
  /**
   * Handed the pad's way of moving the selected bone - see `Nudge`.
   *
   * A registration rather than a value: the pad lives in the panel's DOM and
   * the conversion needs the camera, which only exists in here - so the
   * stage builds the function and hands it out whenever its ingredients
   * change, and `null` on the way down.
   */
  onNudge?: (nudge: Nudge | null) => void
  /**
   * What the body is holding, so a pose is authored around the thing it
   * poses with - a hand cupped around nothing is a guess until the cup is on
   * screen. The same `Held` the runtime hangs off the hand bone, resolved by
   * the same function, so the preview and the game cannot disagree.
   */
  held?: Held
}) {
  /**
   * The gesture, in state rather than in a ref.
   *
   * The bones are imperative - see the note at the top - but a drag *starting*
   * and *ending* are two renders per gesture, not sixty per second: what has to
   * change is which dot is lit and whether the orbit control is allowed to have
   * the left button. Those are things React draws, so React holds them.
   */
  const [rig, setRig] = useState<RigHandle | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  /**
   * Where each pinned bone was pinned. Never read while rendering, so this one
   * stays a ref.
   */
  const pinPoints = useRef(new Map<string, THREE.Vector3>())

  const ready = useCallback(
    (handle: RigHandle) => {
      setRig(handle)
      onReady(handle)
    },
    [onReady],
  )

  /**
   * Pins, kept in step with what the panel has ticked.
   *
   * A pin remembers where the foot was *when it was pinned*, so ticking it is
   * "leave this here" rather than "snap this to the floor". Unticking forgets.
   */
  useEffect(() => {
    if (!rig) return
    for (const name of pins) {
      if (pinPoints.current.has(name)) continue
      const bone = rig.bones.get(name)
      if (bone) pinPoints.current.set(name, bone.getWorldPosition(new THREE.Vector3()))
    }
    for (const name of [...pinPoints.current.keys()]) {
      if (!pins.has(name)) pinPoints.current.delete(name)
    }
  }, [pins, rig])

  /** What the solver needs, rebuilt only when the loaded body changes. */
  const solver = useMemo<Solver | null>(
    () => (rig ? { rig: skeleton, rest: rig.restQuats, tips: rig.tips } : null),
    [rig, skeleton],
  )

  const onGrab = useCallback(
    (bone: string, point: THREE.Vector3, flat: boolean) => {
      const target = rig?.bones.get(bone)
      if (!rig || !target) return

      onSelect(bone)

      const at = target.getWorldPosition(new THREE.Vector3())
      // The axis is frozen into the drag, like `flat` above: changing the lock
      // mid-gesture would move the handle without anybody touching it.
      setDrag({ bone, at, flat, axis, grab: at.clone().sub(point) })

      const spec = skeleton.specs[bone]
      if (spec && spec.reach > 0) {
        preBend(chainAbove(target, spec.reach, skeleton.root), skeleton.specs, rig.restQuats)
      }

      onDragging(true)
    },
    [rig, skeleton, axis, onSelect, onDragging],
  )

  const onMove = useCallback(
    (point: THREE.Vector3) => {
      if (!rig || !drag || !solver) return

      const target = rig.bones.get(drag.bone)
      const spec = skeleton.specs[drag.bone]
      if (!target || !spec) return

      _v.copy(point).add(drag.grab)
      // The lock, applied to the one point everything downstream reads. See
      // `alongAxis` - the hips read it as a translation and the solver reads it
      // as somewhere to reach, and neither needs to know about the mode.
      if (drag.axis) _v.copy(alongAxis(_v, drag.at, drag.axis))

      if (spec.reach === 0 && !spec.swivel) {
        /**
         * The hips, or a peep's body: the one handle that moves rather than
         * turns.
         *
         * Written onto `root` and not onto the bone itself. The hips are inside
         * the skin, so translating them slides the mesh off the skeleton's own
         * origin and anything later parented to the model - a hat, a held prop -
         * stays behind. `root` is the node the whole rig hangs from, which is
         * what a clip in either pack expects to be moved.
         */
        const root = rig.bones.get(skeleton.root)
        if (!root) return
        const bone = target.getWorldPosition(_reach)
        root.position.add(_v.sub(bone))
        root.updateMatrixWorld(true)
        holdPins(pinPoints.current, rig.bones, solver)
      } else {
        dragBone(target, spec, _v, solver)
      }
    },
    [rig, drag, skeleton, solver],
  )

  const onEnd = useCallback(() => {
    if (!rig || !drag) return
    setDrag(null)
    onDragging(false)

    // Dragging a pinned foot moves the pin with it. The alternative - a pin
    // that remembers only where it was first ticked - means every deliberate
    // step is undone by the next thing that moves the hips, which reads as the
    // editor refusing to let you place the foot.
    const pinned = pinPoints.current.get(drag.bone)
    if (pinned) rig.bones.get(drag.bone)?.getWorldPosition(pinned)

    // Keyable: a drag is a deliberate edit, so auto-key is allowed to fire on
    // it. A scrub is not - see `Playhead`.
    onPose(rig.capture(), true)
  }, [rig, drag, onDragging, onPose])

  const onSettle = useCallback((pose: Pose) => onPose(pose, false), [onPose])

  /**
   * The pad's drag, translated where the camera is known.
   *
   * Pixels arrive, a world target leaves, and everything between is the same
   * machinery a direct drag runs: the target is the bone's own position
   * offset along the camera's right and up - the plane a free drag moves in -
   * scaled by distance so a centimetre of thumb moves the same amount of
   * *screen* whether the figure is framed whole or by the hand. The axis lock
   * applies exactly as it does mid-drag, and the hips branch to the root
   * translation for the reason `onMove` gives.
   */
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    if (!onNudge) return
    onNudge((dx, dy, phase, space = 'screen') => {
      if (!rig || !solver || !selected) return
      const target = rig.bones.get(selected)
      const spec = skeleton.specs[selected]
      if (!target || !spec) return

      if (phase === 'start') {
        if (spec.reach > 0) {
          preBend(chainAbove(target, spec.reach, skeleton.root), skeleton.specs, rig.restQuats)
        }
        return
      }
      if (phase === 'end') {
        const pinned = pinPoints.current.get(selected)
        if (pinned) target.getWorldPosition(pinned)
        // Keyable for the reason a released drag is: a pad gesture is a
        // deliberate edit, so auto-key may fire on it.
        onPose(rig.capture(), true)
        return
      }

      const at = target.getWorldPosition(_reach)
      const rate = camera.position.distanceTo(at) * 0.0015
      if (space === 'up') {
        /*
         * World up, not the camera's. The knob is the one control here that
         * means a direction in the *figure's* world rather than on the screen
         * - "lift the foot" is true from every angle, and a knob that tilted
         * with the camera would be the pad again with fewer dimensions.
         *
         * Still scaled by distance, so a centimetre of thumb is the same
         * amount of screen whether the figure is framed whole or by the hand.
         */
        _v.copy(at)
        _v.y += dy * rate
      } else {
        _right.setFromMatrixColumn(camera.matrixWorld, 0)
        _up.setFromMatrixColumn(camera.matrixWorld, 1)
        _v.copy(at).addScaledVector(_right, dx * rate).addScaledVector(_up, dy * rate)
      }
      if (axis) _v.copy(alongAxis(_v, at, axis))

      if (spec.reach === 0 && !spec.swivel) {
        const root = rig.bones.get(skeleton.root)
        if (!root) return
        root.position.add(_v.sub(at))
        root.updateMatrixWorld(true)
        holdPins(pinPoints.current, rig.bones, solver)
      } else {
        dragBone(target, spec, _v, solver)
      }
    })
    return () => {
      onNudge(null)
    }
  }, [onNudge, rig, solver, selected, skeleton, axis, camera, onPose])

  /**
   * A release anywhere ends the drag.
   *
   * The plane's own `onPointerUp` covers letting go inside the viewport, which
   * is almost always. This covers the rest: a button released over the panel,
   * over another window, or after the pointer left the page entirely. Without
   * it those all leave the rig stuck to the pointer with nothing pressed, and
   * the only way out is to click - which poses whatever was grabbed.
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
      <Lights light={{ ...DEFAULT_LIGHT, rim: DEFAULT_LIGHT.rim * 0.5 }} radius={4} />
      {showGrid && <Floor />}

      {/*
        Keyed by url, so switching animal or rig rebuilds rather than reusing.

        `Body`'s memo already depends on the loaded scene, so it would rebuild
        anyway - the key is for `useGLTF`'s suspense: without it React keeps the
        old element and the whole viewport suspends with the previous body still
        mounted, which reads as the switch having silently not worked.
      */}
      <Body key={url} rig={skeleton} url={url} onReady={ready} />

      {rig && held && <HeldItem key={held.url} rig={rig} held={held} />}

      {rig && (
        <>
          <Playhead
            rig={rig}
            doc={doc}
            timeRef={timeRef}
            playing={playing}
            dragging={drag !== null}
            frozen={frozen}
            onTime={onTime}
            onSettle={onSettle}
          />
          <Handles
            rig={rig}
            spec={skeleton}
            selected={selected}
            hovered={hovered}
            pins={pins}
            dragging={drag !== null || !grabbable}
            grabbable={grabbable}
            onHover={setHovered}
            onGrab={onGrab}
          />
        </>
      )}

      {drag && (
        <DragPlane
          // Keyed on the bone so that starting a new drag builds a new plane
          // rather than reusing the last one's frozen orientation.
          key={`${drag.bone}-${drag.flat}-${drag.axis ?? ''}`}
          at={drag.at}
          flat={drag.flat}
          axis={drag.axis}
          onMove={onMove}
          onEnd={onEnd}
        />
      )}
    </>
  )
}

/** The ground, and a mark on it, so a jump reads as leaving the floor. */
function Floor() {
  const grid = useMemo(() => {
    const helper = new THREE.GridHelper(8, 16, '#f0abfc', '#475569')
    const material = helper.material as THREE.Material
    material.transparent = true
    material.opacity = 0.35
    material.depthWrite = false
    return helper
  }, [])

  useEffect(() => () => grid.dispose(), [grid])

  return (
    <>
      <primitive object={grid} raycast={() => null} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]} raycast={() => null}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#1e293b" roughness={1} />
      </mesh>
    </>
  )
}

/** Applying an euler to a live bone, for the panel's sliders. */
export function setBoneEuler(
  rig: RigHandle,
  bone: string,
  degrees: { x: number; y: number; z: number },
): Pose | null {
  const target = rig.bones.get(bone)
  const bind = rig.restQuats.get(bone)
  if (!target || !bind) return null

  _euler.set(
    THREE.MathUtils.degToRad(degrees.x),
    THREE.MathUtils.degToRad(degrees.y),
    THREE.MathUtils.degToRad(degrees.z),
  )
  // Relative to the bind pose, so zero on all three sliders is the rig as it
  // shipped rather than an arbitrary rotation the modeller happened to bake in.
  target.quaternion.copy(bind).multiply(new THREE.Quaternion().setFromEuler(_euler))
  target.updateMatrixWorld(true)
  return rig.capture()
}

/** What the sliders should read for a bone, in degrees off the bind pose. */
export function boneEuler(rig: RigHandle, pose: Pose, bone: string): { x: number; y: number; z: number } {
  const bind = rig.restQuats.get(bone)
  const q = pose.bones[bone]
  if (!bind || !q) return { x: 0, y: 0, z: 0 }

  const relative = bind.clone().invert().multiply(new THREE.Quaternion(q[0], q[1], q[2], q[3]))
  _euler.setFromQuaternion(relative)
  return {
    x: Math.round(THREE.MathUtils.radToDeg(_euler.x)),
    y: Math.round(THREE.MathUtils.radToDeg(_euler.y)),
    z: Math.round(THREE.MathUtils.radToDeg(_euler.z)),
  }
}
