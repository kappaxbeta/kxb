'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { modelUrlFor } from '@/domain/thingiverse/models'
import { Posing, rigFrom, type RigHandle } from '@/app/ovaloffice/animator/posing'
import { Rig } from '@/app/world/shots/pieces'
import { type AnimationDoc, type Pose, samplePose } from '@/domain/animator/clip'
// `Rig` is taken in this file by the lighting rig above, so the body's rig
// comes in under a name that says which of the two it is.
import { type Rig as BodyRig, RIGS } from '@/domain/animator/rig'
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

/**
 * Re-exported so the many callers that import it from the stage keep working.
 * It lives in `./posing` now, with the drag maths that produces one.
 */
export type { RigHandle }

/**
 * The scratch euler the two conversions below share.
 *
 * `'YXZ'` rather than three.js's default `'XYZ'`, and the order is the whole
 * fix for a bug that read as *the facing is locked*: an euler's **middle** axis
 * is the one that gimbal-locks at +/-90, and under `'XYZ'` the middle axis is
 * Y - the turn. So a bone turned to 90 degrees stopped being able to turn, and
 * the number the panel read back stopped tracking the pad.
 *
 * `'YXZ'` is yaw, then pitch, then roll - the order every flight and camera
 * rig uses, for the same reason it is right here. It puts the singularity on
 * *pitch* at +/-90, which for a character bone is straight up or straight down:
 * rare, and obvious when you are there. Turn is then free through the whole
 * range, which is the motion somebody posing a shoulder or a head actually
 * spends their time on.
 *
 * Both functions must agree on the order. They share this object so they
 * cannot drift.
 */
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

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
function Body({ rig: body, onReady }: { rig: BodyRig; onReady: (rig: RigHandle) => void }) {
  const { scene } = useGLTF(body.url)

  const rig = useMemo<RigHandle>(() => {
    const root = cloneSkinned(scene)
    // The body is not clickable: every pointer event in the viewport belongs
    // either to a handle or to the camera. A mesh that ate clicks would mean a
    // handle behind an arm could not be grabbed, and the handles are drawn in
    // front of the body precisely so that never happens.
    root.traverse((node) => {
      node.raycast = () => null
    })
    return rigFrom(root, body.specs)
    // `body.specs` decides which nodes count as bones. It is a module constant
    // per rig, so it only ever changes when the whole body does - at which
    // point `scene` has changed too and the rig is being rebuilt anyway.
  }, [scene, body.specs])

  useEffect(() => onReady(rig), [rig, onReady])

  return <primitive object={rig.root} />
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

/**
 * Something in a hand, drawn where the hand is.
 *
 * Parented into the live rig rather than positioned each frame: the socket is a
 * node in the skeleton, so hanging the model off it means the mixer moves it -
 * a wave waves the cup too, for nothing.
 *
 * Removed on unmount and when the model changes, which is the whole of the
 * cleanup: `useGLTF` caches the parsed file, and the clone is this component's
 * own.
 */
function Held({ rig, hold }: { rig: RigHandle; hold: { model: string; socket: string } }) {
  const { scene } = useGLTF(modelUrlFor(hold.model))

  const object = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    const socket = rig.bones.get(hold.socket)
    if (!socket) return

    socket.add(object)
    return () => {
      socket.remove(object)
    }
  }, [rig, hold.socket, object])

  return null
}

export function AnimatorStage({
  body = RIGS.dummy,
  hold,
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
  /**
   * Which body is being posed.
   *
   * Defaults to the dummy, which is what the backoffice's animator has always
   * posed and what every caller wanting the old behaviour gets for free.
   * Nothing in here is *about* the dummy - the handles are drawn from a bone
   * list, the drag maths takes a spec lookup, and the IK already took both as
   * arguments - so a second rig is a parameter rather than a second stage.
   */
  body?: BodyRig
  /**
   * Something in a hand, while you pose.
   *
   * A pose with a cup in it is a different pose from the same arms with nothing
   * in them, and the difference is only visible if the cup is there. So this is
   * a *posing aid*: a model hung off a socket, drawn, never keyed, and never
   * part of the clip - the clip is bones, and what a body happens to be holding
   * is the world's business.
   */
  hold?: { model: string; socket: string } | null
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
   * The loaded rig, and whether a hand is currently on it.
   *
   * The gesture itself belongs to `<Posing>` now; what this still has to know
   * is only whether one is running, because the playhead must not write bones
   * while a pointer is dragging them.
   */
  const [rig, setRig] = useState<RigHandle | null>(null)
  const [dragging, setDragging] = useState(false)

  const ready = useCallback(
    (handle: RigHandle) => {
      setRig(handle)
      onReady(handle)
    },
    [onReady],
  )

  const whileDragging = useCallback(
    (on: boolean) => {
      setDragging(on)
      onDragging(on)
    },
    [onDragging],
  )

  const onSettle = useCallback((pose: Pose) => onPose(pose, false), [onPose])

  return (
    <>
      <Rig light={{ ...DEFAULT_LIGHT, rim: DEFAULT_LIGHT.rim * 0.5 }} radius={4} />
      {showGrid && <Floor />}

      <Body rig={body} onReady={ready} />
      {hold && rig && <Held rig={rig} hold={hold} />}

      {rig && (
        <>
          <Playhead
            rig={rig}
            doc={doc}
            timeRef={timeRef}
            playing={playing}
            dragging={dragging}
            frozen={frozen}
            onTime={onTime}
            onSettle={onSettle}
          />
          <Posing
            rig={rig}
            bones={body.bones}
            specs={body.specs}
            selected={selected}
            pins={pins}
            grabbable={grabbable}
            slideMode={slideMode}
            onSelect={onSelect}
            onPose={onPose}
            onDragging={whileDragging}
          />
        </>
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
    'YXZ',
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
  _euler.setFromQuaternion(relative, 'YXZ')
  return {
    x: Math.round(THREE.MathUtils.radToDeg(_euler.x)),
    y: Math.round(THREE.MathUtils.radToDeg(_euler.y)),
    z: Math.round(THREE.MathUtils.radToDeg(_euler.z)),
  }
}
