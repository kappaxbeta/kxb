'use client'

import { useGLTF } from '@react-three/drei'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { chainAbove, holdPins, preBend, reachFor } from '@/app/ovaloffice/animator/ik'
import { Rig } from '@/app/world/shots/pieces'
import { type AnimationDoc, type Pose, type Quat, samplePose } from '@/domain/animator/clip'
import { BONE_SPECS, DUMMY_BONES, DUMMY_URL, ROOT_BONE } from '@/domain/animator/rig'
import { DEFAULT_LIGHT } from '@/domain/studio/scene'

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
 * React's; the puppet is three.js's. See the note in `@/domain/animator/clip`
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
  capture: () => Pose
  apply: (pose: Pose) => void
}

const _v = new THREE.Vector3()
const _reach = new THREE.Vector3()
const _euler = new THREE.Euler()

function capture(bones: Map<string, THREE.Object3D>): Pose {
  const out: Record<string, Quat> = {}
  for (const [name, bone] of bones) {
    if (name === ROOT_BONE) continue
    const q = bone.quaternion
    out[name] = [q.x, q.y, q.z, q.w]
  }
  const root = bones.get(ROOT_BONE)
  return { root: root ? [root.position.x, root.position.y, root.position.z] : [0, 0, 0], bones: out }
}

function apply(bones: Map<string, THREE.Object3D>, pose: Pose): void {
  for (const [name, bone] of bones) {
    const q = pose.bones[name]
    if (q) bone.quaternion.set(q[0], q[1], q[2], q[3])
  }
  const root = bones.get(ROOT_BONE)
  if (root) root.position.set(pose.root[0], pose.root[1], pose.root[2])
}

/**
 * The model, cloned, with its bones indexed.
 *
 * `SkeletonUtils.clone` rather than `Object3D.clone`, because this one is
 * skinned: a plain clone copies the meshes but leaves them bound to the
 * *original* skeleton, so posing the copy moves nothing and posing the original
 * moves a body that is not on screen. The peep pack gets away with a plain
 * clone because it is unskinned - see the note in `AvatarModel`.
 *
 * The clone also means the editor starts from the bind pose on every mount,
 * rather than from whatever the last session left in `useGLTF`'s cache.
 */
function Dummy({ onReady }: { onReady: (rig: RigHandle) => void }) {
  const { scene } = useGLTF(DUMMY_URL)

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
      if (node.name === ROOT_BONE || BONE_SPECS[node.name] || (node as THREE.Bone).isBone) {
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
  }, [scene])

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
  selected: string | null
  hovered: string | null
  pins: ReadonlySet<string>
  dragging: boolean
  /** See the note on the same prop in `AnimatorStage`. */
  grabbable: boolean
  /** See the note on the same prop in `AnimatorStage`. */
  slideMode: boolean
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
      {DUMMY_BONES.map((spec) => {
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
  doc,
  timeRef,
  playing,
  frozen,
  selected,
  pins,
  showGrid,
  grabbable,
  slideMode,
  onReady,
  onTime,
  onSelect,
  onPose,
  onDragging,
}: {
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
   * Every drag started while this is on behaves as if shift were held.
   *
   * Shift is a desktop-only way to ask for a floor-plane drag instead of a
   * camera-facing one, and a touchscreen has no shift to hold. The viewport's
   * Slide button flips this instead, so the same "move along the floor"
   * gesture is reachable with one finger.
   */
  slideMode: boolean
  onReady: (rig: RigHandle) => void
  onTime: (time: number) => void
  onSelect: (bone: string) => void
  /** A pose the editor should take as current: after a drag, or after a scrub. */
  onPose: (pose: Pose, keyable: boolean) => void
  onDragging: (dragging: boolean) => void
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

  const onGrab = useCallback(
    (bone: string, point: THREE.Vector3, flat: boolean) => {
      const target = rig?.bones.get(bone)
      if (!rig || !target) return

      onSelect(bone)

      const at = target.getWorldPosition(new THREE.Vector3())
      setDrag({ bone, at, flat, grab: at.clone().sub(point) })

      const spec = BONE_SPECS[bone]
      if (spec && spec.reach > 0) preBend(chainAbove(target, spec.reach), BONE_SPECS, rig.restQuats)

      onDragging(true)
    },
    [rig, onSelect, onDragging],
  )

  const onMove = useCallback(
    (point: THREE.Vector3) => {
      if (!rig || !drag) return

      const target = rig.bones.get(drag.bone)
      const spec = BONE_SPECS[drag.bone]
      if (!target || !spec) return

      _v.copy(point).add(drag.grab)

      if (spec.reach === 0) {
        /**
         * The hips: the one handle that moves rather than turns.
         *
         * Written onto `root` and not onto the hips bone itself. The hips are
         * inside the skin, so translating them slides the mesh off the
         * skeleton's own origin and anything later parented to the model - a
         * hat, a held prop - stays behind. `root` is the node the whole rig
         * hangs from, which is what a clip in this pack expects to be moved.
         */
        const root = rig.bones.get(ROOT_BONE)
        if (!root) return
        const bone = target.getWorldPosition(_reach)
        root.position.add(_v.sub(bone))
        root.updateMatrixWorld(true)
        holdPins(pinPoints.current, rig.bones, BONE_SPECS, rig.restQuats)
      } else {
        reachFor(target, chainAbove(target, spec.reach), _v, BONE_SPECS, rig.restQuats)
      }
    },
    [rig, drag],
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
      <Rig light={{ ...DEFAULT_LIGHT, rim: DEFAULT_LIGHT.rim * 0.5 }} radius={4} />
      {showGrid && <Floor />}

      <Dummy onReady={ready} />

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
            selected={selected}
            hovered={hovered}
            pins={pins}
            dragging={drag !== null || !grabbable}
            grabbable={grabbable}
            slideMode={slideMode}
            onHover={setHovered}
            onGrab={onGrab}
          />
        </>
      )}

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
