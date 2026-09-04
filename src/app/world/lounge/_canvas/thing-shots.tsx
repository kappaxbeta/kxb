'use client'

import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

import { socketsOf } from '@/domain/thingiverse/blueprint'
import type { Shot } from '@/domain/thingiverse/live'
import { drawingOf, modelUrlFor } from '@/domain/thingiverse/models'
import type { ThingView } from '@/domain/thingiverse/queries'
import { drainTracers } from '@/app/world/_stores/tracer-store'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'

/**
 * The bullets, in the air.
 *
 * ---------------------------------------------------------------------------
 * Why a shot is drawn by everybody and paid for by one person
 * ---------------------------------------------------------------------------
 * A turret's cooldown belongs to the driver (`stepRoom`), so *that a shot
 * happened* is one client's decision and travels on the heartbeat. What it
 * costs is not: `_sim/combat.ts` states the rule that keeps two browsers
 * agreeing about a fight, which is that **each client is authoritative over its
 * own health only** - an attacker asserts a hit, the victim decides what it is
 * worth, and nobody writes to anybody else's bar.
 *
 * So this draws every shot in the room and applies exactly the ones addressed
 * to the person sitting in front of it. Four people watching a turret fire at a
 * fifth all see the same bullet; one of them loses eight points.
 *
 * ---------------------------------------------------------------------------
 * It flies at where they were, and it does not miss
 * ---------------------------------------------------------------------------
 * The bullet travels from the muzzle to where the target was standing when the
 * driver decided to fire, and the hit lands when it arrives. It is not a ray
 * anybody can dodge, and that is deliberate rather than pending: a dodge would
 * have to be adjudicated somewhere, every client's idea of where a body is
 * differs by a packet, and the two candidates - the shooter decides (you dodge
 * and die anyway) and the victim decides (you never get hit) - are both worse
 * than a bullet that is honest about being a drawn consequence of a decision
 * already taken. The same shape a dash has: the attacker's `dashConnects` is
 * the whole of whether it landed.
 *
 * ---------------------------------------------------------------------------
 * Why the list is state and the flight is a ref
 * ---------------------------------------------------------------------------
 * Mounting a bullet is a scene-graph edit and has to be a render; moving one is
 * sixty writes a second to a transform and must not be. So a shot arriving adds
 * a row (a few times a second at most, gated by the turret's own cooldown) and
 * everything after that happens inside `useFrame` on a ref, which is the same
 * split every other moving thing in this folder keeps.
 */

/** How long a bullet may live if it never arrives, in seconds. */
const MAX_FLIGHT = 4

/** One in the air, as this file needs it. */
interface Flying {
  /** Ours, for React. Not the thing's id: a turret fires more than once. */
  key: number
  model: string
  scale: number
  speed: number
  damage: number
  /** How hard it shoves whoever it lands on. See `WeaponSpec.push`. */
  push?: number
  /** What fired it, so a shove knows which way is away. Absent for a tracer. */
  thing?: ThingView
  /** Whose bar it costs something, or null for a shot at nobody here. */
  to: string | null
  from: THREE.Vector3
  at: THREE.Vector3
  /** What to call whoever fired it, in the "you were hit by" line. */
  name: string
}

export function ThingShots({
  things,
  fired,
  conn,
  onHit,
  onPush,
}: {
  things: readonly ThingView[]
  /**
   * Whatever the machines have fired since the last time anybody asked.
   *
   * A function rather than the queue itself: the queue belongs to
   * `useThingLife`, and a reader that emptied somebody else's array is two
   * readers of one queue - a shot one of them never sees. Asking is what
   * empties it, which is also what stops it growing in a scene that never
   * draws.
   */
  fired: () => Shot[]
  /** Our own connection id, or `me` in a scene with no wire. */
  conn: string
  /**
   * What being hit costs us.
   *
   * Absent in a room where nobody can be hurt - creative mode, a still, the
   * composer's stage - and a bullet there is a bullet that flies past and
   * disappears, which is the honest drawing of a turret in a room with no
   * fight in it.
   */
  onHit?: (damage: number, from: string) => void
  /**
   * Being shoved, in cells a second, sideways and up.
   *
   * Absent wherever `onHit` is and for the same reason: in a room where nobody
   * can be hurt, nobody is thrown about either. See `WeaponSpec.push`.
   */
  onPush?: (x: number, z: number, lift: number) => void
}) {
  const { playerRef, transformsRef } = useSceneRefs()
  const [flying, setFlying] = useState<readonly Flying[]>([])
  const next = useRef(0)

  /** The things, by id, so a shot can find what fired it in one lookup. */
  const byId = useMemo(() => new Map(things.map((thing) => [thing.id, thing])), [things])

  const drop = useCallback((key: number) => {
    setFlying((current) => current.filter((one) => one.key !== key))
  }, [])

  /**
   * Being shoved by a thing, away from it.
   *
   * Applied here rather than sent, because the person being shoved is the
   * person at this keyboard - the rule `PushMessage` states about a boot,
   * inherited whole: an attacker says a hit happened, and where the victim ends
   * up is the victim's. The direction is the only part worked out, and it is
   * the obvious one: straight out from the thing that did it, which is what a
   * spring under your feet and a bumper in your side both do.
   *
   * A shove from directly overhead has no direction to be shoved in, so it
   * becomes a lift and nothing else - which is exactly what a thing landing on
   * you looks like.
   */
  const shove = useCallback(
    (thing: ThingView, push: number | undefined) => {
      if (!push || !onPush) return
      const me = playerRef.current
      const dx = me.x - (thing.x + 0.5)
      const dz = me.z - (thing.z + 0.5)
      const flat = Math.hypot(dx, dz)
      if (flat < 0.001) {
        onPush(0, 0, push)
        return
      }
      onPush((dx / flat) * push, (dz / flat) * push, push * 0.4)
    },
    [onPush, playerRef],
  )

  useFrame(() => {
    const queue = fired()
    const loose = drainTracers()
    if (queue.length === 0 && loose.length === 0) return

    const born: Flying[] = []

    /*
      Bullets fired by *people*, which arrive already resolved.

      They carry no target and no damage, and that is the difference between a
      turret's shot and somebody's: a turret's is a decision the driver made
      about a body, and a person's was decided and *addressed* by whoever pulled
      the trigger, on the same terms a dash is. What reaches this file is the
      drawing. See `tracer-store`.
    */
    for (const tracer of loose) {
      born.push({
        key: next.current++,
        model: tracer.model,
        scale: tracer.scale,
        speed: tracer.speed,
        damage: 0,
        to: null,
        from: new THREE.Vector3(tracer.from.x, tracer.from.y, tracer.from.z),
        at: new THREE.Vector3(tracer.to.x, tracer.to.y, tracer.to.z),
        name: '',
      })
    }
    for (const shot of queue) {
      const thing = byId.get(shot.i)
      const spec = thing?.blueprint?.spec
      const weapon = spec?.fight?.weapon
      if (!thing || !spec || !weapon) continue

      /*
        A swing, rather than something fired.

        Nothing travels and nothing is drawn: a spike plate does not throw
        anything, it simply catches whoever is standing on it. So the cost lands
        the moment we hear about it, on the one client entitled to apply it -
        the same rule the bullets below keep, minus the flight.
      */
      if (!weapon.shot) {
        if (shot.to === conn) {
          onHit?.(weapon.damage, thing.blueprint?.name ?? 'It')
          shove(thing, weapon.push)
        }
        continue
      }

      /*
        The muzzle, in world space.

        The socket is authored in the thing's own frame, so it is scaled by the
        instance's own multiplier and turned by its facing before it is added to
        where the thing stands - the same sum `seatOf` does for a seat, and for
        the same reason: a turret turned to face the door has to fire out of the
        door.
      */
      const socket = weapon.shot.from
        ? socketsOf(spec).find((one) => one.name === weapon.shot?.from)
        : undefined
      const local = socket?.at ?? { x: 0, y: 0, z: 0 }
      const turn = (thing.facing * Math.PI) / 2
      const cos = Math.cos(turn)
      const sin = Math.sin(turn)
      const from = new THREE.Vector3(
        thing.x + 0.5 + (local.x * cos + local.z * sin) * thing.scale,
        thing.y + local.y * thing.scale + (drawingOf(spec.model)?.lift ?? 0) * thing.scale,
        thing.z + 0.5 + (-local.x * sin + local.z * cos) * thing.scale,
      )

      /*
        And where it is going: the body it was fired at, as *this* client draws
        it. Ours is an eye and everybody else's is a pair of feet, which is the
        one place those two are not the same number - a bullet aimed at the
        floor under somebody looks like a miss.
      */
      const target =
        shot.to === conn
          ? new THREE.Vector3(
              playerRef.current.x,
              playerRef.current.y - EYE_HEIGHT * 0.5,
              playerRef.current.z,
            )
          : (() => {
              const peer = transformsRef.current?.get(shot.to)
              return peer
                ? new THREE.Vector3(peer.current.x, peer.current.y + 0.9, peer.current.z)
                : null
            })()

      // Fired at somebody this client cannot see - a peer who left between the
      // driver deciding and the packet arriving. Drawn as a bullet going the
      // way the turret is facing rather than dropped, so the room still shows
      // that something went off.
      const at =
        target ??
        from.clone().add(new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn)).multiplyScalar(weapon.reach))

      born.push({
        key: next.current++,
        push: weapon.push,
        thing,
        model: weapon.shot.model,
        scale: weapon.shot.scale,
        speed: weapon.shot.speed,
        damage: weapon.damage,
        to: shot.to,
        from,
        at,
        name: thing.blueprint?.name ?? 'A turret',
      })
    }

    if (born.length > 0) setFlying((current) => [...current, ...born])
  })

  return (
    <>
      {flying.map((one) => (
        <Suspense key={one.key} fallback={null}>
          <Bullet
            shot={one}
            mine={one.to === conn}
            onDone={() => drop(one.key)}
            onHit={(damage, from) => {
              onHit?.(damage, from)
              if (one.thing) shove(one.thing, one.push)
            }}
          />
        </Suspense>
      ))}
    </>
  )
}

/**
 * One of them, travelling.
 *
 * Its own component because loading a model is a hook and a hook cannot be
 * called in a loop - the same constraint that shapes how a thing draws its
 * pieces. The arrival is decided here rather than by a timer, so a bullet that
 * is drawn slowly by a struggling frame rate still lands where it was aimed
 * instead of teleporting.
 */
function Bullet({
  shot,
  mine,
  onDone,
  onHit,
}: {
  shot: Flying
  /** Whether this one is addressed to the person at this keyboard. */
  mine: boolean
  onDone: () => void
  onHit?: (damage: number, from: string) => void
}) {
  const gltf = useGLTF(modelUrlFor(shot.model))
  const object = useMemo(() => gltf.scene.clone(true), [gltf])
  const group = useRef<THREE.Group>(null)
  const flown = useRef(0)
  /** Whether the hit has been paid for, so a slow unmount cannot charge twice. */
  const landed = useRef(false)

  const path = useMemo(() => {
    const direction = shot.at.clone().sub(shot.from)
    const distance = direction.length()
    return {
      distance,
      step: distance === 0 ? new THREE.Vector3(0, 0, 1) : direction.clone().divideScalar(distance),
    }
  }, [shot.at, shot.from])

  useFrame((_, delta) => {
    const node = group.current
    if (!node || landed.current) return

    flown.current += shot.speed * delta
    node.position
      .copy(shot.from)
      .addScaledVector(path.step, Math.min(flown.current, path.distance))

    // Pointed the way it is going. A bullet drawn in the pose it was authored
    // in reads as a dropped object rather than a shot one.
    node.lookAt(shot.at)

    if (flown.current >= path.distance || flown.current > shot.speed * MAX_FLIGHT) {
      landed.current = true
      if (mine && flown.current >= path.distance) onHit?.(shot.damage, shot.name)
      onDone()
    }
  })

  return (
    <group ref={group} scale={(drawingOf(shot.model)?.scale ?? 1) * shot.scale}>
      <primitive object={object} />
    </group>
  )
}
