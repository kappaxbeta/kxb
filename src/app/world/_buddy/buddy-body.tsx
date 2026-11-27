'use client'

import { useFrame } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import type * as THREE from 'three'
import { buddySaid, useBuddy } from '@/app/world/_buddy/buddy-store'
import { GridbotModel } from '@/app/world/_buddy/gridbot-model'
import { type TellyClip, TellyModel } from '@/app/world/_buddy/telly-model'
import { ChatBubble } from '@/app/world/_canvas/chat-bubble'
import { Nameplate } from '@/app/world/_canvas/nameplate'
import { angleDelta, WALK_SPEED } from '@/app/world/_presence/presence-core'
import { BUDDIES, type BuddyId } from '@/domain/buddy/persona'

/**
 * A buddy at your side.
 *
 * He keeps a spot a little to your right and a little behind - where somebody
 * walking with you stands, not where somebody following you does - and closes
 * on it at a speed that grows with how far off it he is. So a step is a step
 * and a sprint is a sprint, and the clip is read off how fast he actually
 * moved, the way every other body in the lounge picks its gait.
 *
 * No collision and no path-finding. He walks through a table rather than
 * getting stuck behind it, which in a companion reads as cheerful rather than
 * broken; and if you leave him a long way behind - a teleport, a door - he is
 * simply there when you arrive, because a companion jogging across the whole
 * map to catch up is the one thing that would look like a bug.
 *
 * Purely local: nothing here is sent anywhere. See ./buddy-store.
 */

/** Where he stands, relative to your feet and the way you face, in blocks. */
const SIDE = 1.3
const BEHIND = 0.7

/** Close enough to the spot to stop walking. Below this he turns to face you. */
const SETTLED = 0.35

/** How quickly he closes the gap: speed per block of distance, and the cap. */
const PULL = 2.6
const TOP_SPEED = 9

/** Further than this and he arrives rather than travels. */
const TOO_FAR = 18

/** Above this speed the walk becomes a run. */
const RUN_FROM = 4.5

/** How fast he turns, and how fast his feet find a new floor height. */
const TURN_RATE = 8
const FLOOR_RATE = 10

export function BuddyBody({
  who = 'telly',
  playerRef,
  headingRef,
  eyeHeight,
  dancing = false,
}: {
  who?: BuddyId
  /** The player's eye. Feet are `eyeHeight` below it. */
  playerRef: React.RefObject<THREE.Vector3>
  /** Which way the player faces, flat. */
  headingRef: React.RefObject<THREE.Vector3>
  eyeHeight: number
  /** Dance when you dance. */
  dancing?: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const [clip, setClip] = useState<TellyClip>('idle')

  /** Null until the first frame, which places him without walking him in. */
  const at = useRef<{ x: number; y: number; z: number } | null>(null)
  const yaw = useRef(0)

  useFrame((_, delta) => {
    const node = group.current
    const player = playerRef.current
    const facing = headingRef.current
    if (!node || !player || !facing) return

    const step = Math.min(delta, 0.1)
    const feet = player.y - eyeHeight

    // The spot: right of you and a little behind, by the way you face.
    const length = Math.hypot(facing.x, facing.z) || 1
    const fx = facing.x / length
    const fz = facing.z / length
    const spotX = player.x - fz * SIDE - fx * BEHIND
    const spotZ = player.z + fx * SIDE - fz * BEHIND

    const here = at.current ?? { x: spotX, y: feet, z: spotZ }
    let dx = spotX - here.x
    let dz = spotZ - here.z
    let distance = Math.hypot(dx, dz)

    if (distance > TOO_FAR) {
      here.x = spotX
      here.z = spotZ
      here.y = feet
      dx = 0
      dz = 0
      distance = 0
    }

    let speed = 0
    if (distance > SETTLED) {
      speed = Math.min(TOP_SPEED, distance * PULL)
      const move = Math.min(distance, speed * step)
      here.x += (dx / distance) * move
      here.z += (dz / distance) * move
    }
    here.y += (feet - here.y) * Math.min(1, FLOOR_RATE * step)
    at.current = here

    // Face where he is going while he goes; face you once he is there.
    const wanted =
      speed > 0 ? Math.atan2(dx, dz) : Math.atan2(player.x - here.x, player.z - here.z)
    yaw.current += angleDelta(yaw.current, wanted) * Math.min(1, TURN_RATE * step)

    node.position.set(here.x, here.y, here.z)
    node.rotation.y = yaw.current

    const next: TellyClip =
      speed > RUN_FROM ? 'run' : speed > WALK_SPEED ? 'walk' : dancing ? 'dance' : 'idle'
    if (next !== clip) setClip(next)
  })

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {/* Keyed, so a swap is a new body with its own mixer - see `AvatarModel`. */}
        {BUDDIES[who].rig === 'gridbot' ? (
          <GridbotModel key={who} model={BUDDIES[who].model} clip={clip} />
        ) : (
          <TellyModel key={who} model={BUDDIES[who].model} clip={clip} />
        )}
      </Suspense>
      <Nameplate name={BUDDIES[who].name} height={1.95} />
      <ChatBubble state={buddySaid} height={2.6} />
    </group>
  )
}

/**
 * The body, only while he is out.
 *
 * Its own component so the scene does not have to re-render to call him: the
 * store answers here, inside the canvas, and nothing above it changes.
 */
export function Buddy(props: React.ComponentProps<typeof BuddyBody>) {
  const { out, who } = useBuddy()
  return out ? <BuddyBody {...props} who={who} /> : null
}
