'use client'

import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pieceTransform, Undrawable } from '@/app/world/lounge/_canvas/lounge-things'
import { ridePosition, seatDelta } from '@/app/world/lounge/_sim/seats'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import type { DriveState, DriveTuning } from '@/app/world/lounge/_sim/drive'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import { useThingiverse } from '@/app/world/_stores/thing-store'
import {
  type BlueprintPart,
  type BlueprintSpec,
  seatAt,
} from '@/domain/thingiverse/blueprint'
import { drawingOf, modelUrlFor } from '@/domain/thingiverse/models'
import type { ThingView } from '@/domain/thingiverse/queries'
import { isSteeringNode, isWheelNode } from '@/domain/thingiverse/vehicle'

/**
 * A vehicle, drawn under whoever is driving it.
 *
 * ---------------------------------------------------------------------------
 * Why this is not <ThingModel>
 * ---------------------------------------------------------------------------
 * `lounge-things` draws a thing *standing in a cell*: it reports a footprint,
 * answers `touch`, falls, and is anchored to the lattice. A driven vehicle is
 * none of those things - it is bolted to a body that moves continuously, its
 * cell is wherever it happens to be, and it must stop being solid the moment
 * somebody is inside it. What the two share is the arithmetic of where a piece
 * sits, and that is imported (`pieceTransform`) rather than restated.
 *
 * What this adds is the wheels. Two kinds, one loop:
 *
 *   - the model's own, found by *name* in the glTF (`wheel-front-left` and
 *     friends - see `isWheelNode`), which most of the cars pack ships with;
 *   - the blueprint's, bolted on at joints in the composer for bodies that
 *     brought none.
 *
 * Both spin by arc length - distance over radius - so a big wheel turns
 * lazily and a kart's blurs, and the ones marked as steering yaw with the
 * wheel. Radii are kept in each wheel's *local* units beside the factor that
 * turns them into cells, because the rotation is applied inside the scaled
 * groups where scale cannot reach it and the distance travelled is in cells.
 */

/**
 * Every model this rig may name, as one boundary key.
 *
 * The same recovery rule the room's `Undrawable` documents: keyed on the
 * models, so editing the blueprint onto ids that exist replaces the boundary
 * and draws again, rather than holding the gap forever.
 */
function rigModels(spec: BlueprintSpec): string {
  return [
    spec.model,
    ...(spec.parts ?? []).map((part) => part.model),
    ...(spec.vehicle?.wheels ?? []).map((wheel) => wheel.model),
  ].join('|')
}

/** How far a steering wheel turns at full lock, in radians. Looks, not physics. */
const STEER_LOCK = 0.45

/** What the frame loop reads: how fast it is going, and where the wheel is. */
export interface VehicleMotion {
  /** Cells per second. Negative in reverse - the wheels spin backwards. */
  speed: number
  /** -1..1, the drawn steering. */
  steer: number
}

/** One thing to spin: the object, its radius in cells, whether it steers. */
interface Spinner {
  object: THREE.Object3D
  radius: number
  steers: boolean
}

export function VehicleModel({
  spec,
  scale,
  motion,
}: {
  spec: BlueprintSpec
  /** The instance's own multiplier, `thing.scale`. */
  scale: number
  /** Read every frame, never re-rendered on. */
  motion: React.RefObject<VehicleMotion>
}) {
  const parts: readonly BlueprintPart[] = spec.parts ?? []
  const wheels = spec.vehicle?.wheels ?? []

  const urls = useMemo(
    () =>
      [
        spec.model,
        ...parts.map((part) => part.model),
        ...wheels.map((wheel) => wheel.model),
      ].map(modelUrlFor),
    // Rebuilt when the spec's own lists are - same note as <ThingModel>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec.model, spec.parts, spec.vehicle],
  )
  const loaded = useGLTF(urls)

  /**
   * Everything cloned and every wheel found, in one pass.
   *
   * Clones for the reason every drawer of these models clones: `useGLTF`
   * caches one object graph per URL, and one object cannot be in two places -
   * a parked kart and a driven one would fight over the same wheels.
   *
   * A wheel node is given `YXZ` rotation order so steering (yaw) and rolling
   * (pitch) compose as a real axle does: turned first, then spun about the
   * turned axis.
   */
  const { pieces, boltedWheels, spinners } = useMemo(() => {
    const spinners: Spinner[] = []

    const pieces = [
      { model: spec.model, at: { x: 0, y: 0, z: 0 }, turn: 0, scale: spec.scale },
      ...parts,
    ].map((part, index) => {
      const copy = (loaded[index]?.scene ?? new THREE.Group()).clone(true)
      const placed = pieceTransform(part.model, part.at, part.turn, part.scale)

      copy.traverse((node) => {
        if (!isWheelNode(node.name)) return
        node.rotation.order = 'YXZ'
        const box = new THREE.Box3().setFromObject(node)
        spinners.push({
          object: node,
          // Half the node's height in its own units, times what one of those
          // units is worth once the piece is placed - a radius in cells.
          radius: Math.max(0.02, ((box.max.y - box.min.y) / 2) * placed.scale * scale),
          steers: isSteeringNode(node.name),
        })
      })

      return { object: copy, placed }
    })

    const boltedWheels = wheels.map((wheel, index) => {
      const copy = (
        loaded[1 + parts.length + index]?.scene ?? new THREE.Group()
      ).clone(true)
      // The joint is the hub: no lift, unlike a part, because a wheel hangs on
      // its axle rather than standing on the floor.
      const size = (drawingOf(wheel.model)?.scale ?? 1) * wheel.scale

      const spin = new THREE.Group()
      spin.rotation.order = 'YXZ'
      spin.add(copy)

      const box = new THREE.Box3().setFromObject(copy)
      spinners.push({
        object: spin,
        radius: Math.max(0.02, ((box.max.y - box.min.y) / 2) * size * scale),
        steers: wheel.steers,
      })

      return { object: spin, at: wheel.at, size, key: `${wheel.model}:${index}` }
    })

    return { pieces, boltedWheels, spinners }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, spec.model, spec.scale, spec.parts, spec.vehicle, scale])

  /** Cells rolled since the rig mounted. One distance; each radius divides it. */
  const rolled = useRef(0)

  useFrame((_, delta) => {
    const now = motion.current
    if (!now) return

    for (const spinner of spinners) {
      // The method form, which the lint rule reads as intentional scene-graph
      // mutation - the same note <PlayerControls> carries over its loop. The
      // z stays zero and the y is the steering or nothing; order is `YXZ`.
      spinner.object.rotation.set(
        rolled.current / spinner.radius,
        spinner.steers ? now.steer * STEER_LOCK : 0,
        0,
      )
    }

    rolled.current += now.speed * delta
  })

  return (
    <group scale={scale}>
      {pieces.map((piece, index) => (
        <group
          key={index}
          position={piece.placed.position}
          rotation={piece.placed.rotation}
          scale={piece.placed.scale}
        >
          <primitive object={piece.object} />
        </group>
      ))}
      {boltedWheels.map((wheel) => (
        <group
          key={wheel.key}
          position={[wheel.at.x, wheel.at.y, wheel.at.z]}
          scale={wheel.size}
        >
          <primitive object={wheel.object} />
        </group>
      ))}
    </group>
  )
}

/**
 * Your own vehicle, following your body.
 *
 * The player vector is the *driver's eye*, and the driver is in the first
 * seat - so the vehicle's origin is the eye, dropped to the feet, minus the
 * seat's offset turned to the vehicle's heading. The same sum `seatOf` does
 * for a parked thing, run backwards and continuously: there the seat follows
 * the thing, here the thing follows the seat.
 *
 * All of it in a frame callback and none of it in state, because every number
 * involved changes every frame and is already a ref.
 */
export function DrivenVehicle({
  thing,
  drive,
}: {
  thing: ThingView
  drive: React.RefObject<{ state: DriveState; tuning: DriveTuning } | null>
}) {
  const { playerRef } = useSceneRefs()
  const group = useRef<THREE.Group>(null)
  const motion = useRef<VehicleMotion>({ speed: 0, steer: 0 })

  const spec = thing.blueprint?.spec
  const seat = useMemo(() => {
    if (!spec?.use) return { x: 0, y: 0, z: 0 }
    return seatAt(spec, spec.use.seats[0] ?? { x: 0, y: 0, z: 0 })
  }, [spec])

  useFrame(() => {
    const driven = drive.current
    const node = group.current
    if (!driven || !node) return

    motion.current.speed = driven.state.speed
    motion.current.steer = driven.state.steer

    const heading = driven.state.heading
    const cos = Math.cos(heading)
    const sin = Math.sin(heading)
    const player = playerRef.current

    const sx = seat.x * thing.scale
    const sy = seat.y * thing.scale
    const sz = seat.z * thing.scale

    node.position.set(
      player.x - (sx * cos + sz * sin),
      player.y - EYE_HEIGHT - sy,
      player.z - (-sx * sin + sz * cos),
    )
    node.rotation.y = heading
  })

  if (!spec) return null

  return (
    <group ref={group}>
      {/* A retired wheel model must not take the room - see `Undrawable`. */}
      <Undrawable key={rigModels(spec)}>
        <Suspense fallback={null}>
          <VehicleModel spec={spec} scale={thing.scale} motion={motion} />
        </Suspense>
      </Undrawable>
    </group>
  )
}

/**
 * Somebody else's vehicle, drawn inside their body's group.
 *
 * The group is already at their feet and turned to their yaw, so the offset
 * that puts the vehicle under them is the seat's, in the vehicle's own frame,
 * with no rotation of our own to do - the parent turns us.
 *
 * The spec comes off the room's own furniture list, read from the store the
 * scene publishes: a peer's packet names a thing id, and a thing this client
 * has not heard of yet is a vehicle drawn a moment late rather than an error.
 */
export function PeerVehicle({
  thingId,
  motion,
}: {
  thingId: string
  motion: React.RefObject<VehicleMotion>
}) {
  const room = useThingiverse()
  const thing = room?.things.find((one) => one.id === thingId)
  const spec = thing?.blueprint?.spec

  const seat = useMemo(() => {
    if (!spec?.use) return { x: 0, y: 0, z: 0 }
    return seatAt(spec, spec.use.seats[0] ?? { x: 0, y: 0, z: 0 })
  }, [spec])

  if (!thing || !spec) return null

  return (
    <group
      position={[
        -seat.x * thing.scale,
        -seat.y * thing.scale,
        -seat.z * thing.scale,
      ]}
    >
      <Undrawable key={rigModels(spec)}>
        <Suspense fallback={null}>
          <VehicleModel spec={spec} scale={thing.scale} motion={motion} />
        </Suspense>
      </Undrawable>
    </group>
  )
}

/**
 * Your seat, following somebody else's wheel.
 *
 * Renders nothing; writes the same pin a chair writes, sixty times a second,
 * from the driver's interpolated body plus the seat difference. In the canvas
 * because both halves are frame-loop facts - where the driver is drawn, and
 * where the pin goes - and neither has any business re-rendering anything.
 *
 * A driver with no transform yet (their packet has not landed) leaves the pin
 * where it was, which is the parked seat: you sit still until the kart is
 * actually seen to move, rather than snapping to an origin.
 */
export function RideAlong({
  thing,
  seat,
  driverId,
  seatRef,
}: {
  thing: ThingView
  /** Which of the thing's seats is yours. Never zero - zero is the driver. */
  seat: number
  driverId: string
  seatRef: React.RefObject<{ x: number; y: number; z: number } | null>
}) {
  const { transformsRef } = useSceneRefs()

  const spec = thing.blueprint?.spec
  const delta = useMemo(
    () => (spec ? seatDelta(spec, thing.scale, seat) : { x: 0, y: 0, z: 0 }),
    [spec, thing.scale, seat],
  )

  useFrame(() => {
    const driver = transformsRef.current?.get(driverId)?.current
    if (!driver) return
    seatRef.current = ridePosition(driver, delta)
  })

  return null
}
