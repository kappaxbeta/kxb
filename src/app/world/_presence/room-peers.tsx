'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useRef, useState } from 'react'
import * as THREE from 'three'
import { AvatarModel } from '@/app/world/lounge/_canvas/avatar-model'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { EmoteBubble } from '@/app/world/_canvas/emote-bubble'
import { Nameplate } from '@/app/world/_canvas/nameplate'
import {
  advance,
  gaitFor,
  KEEPALIVE_MS,
  type LastSent,
  type MoveMessage,
  neverSent,
  noEmote,
  SEND_INTERVAL,
  worthSending,
} from '@/app/world/_presence/presence-core'
import type { Room } from '@/app/world/_presence/room-presence'
import type { AvatarClip } from '@/domain/lounge/avatars'

/**
 * The 3D half of presence: bodies to look at, and packets going out.
 *
 * Everything here mounts *inside* the `<Canvas>`, and everything it needs
 * arrives as a prop on `room`. Nothing in this file reads React state that
 * changes at packet rate - positions and emotes are read out of mutable maps
 * inside `useFrame`, because a room of six people at twelve updates a second is
 * seventy-two re-renders a second if you do it the obvious way.
 */

/** Scratch for the outbound heading. Allocated once. */
const SEND_DIR = new THREE.Vector3()

/**
 * Tell the room where we are.
 *
 * Silent until we are past the door, which is what admission actually enforces:
 * a visitor who has not been let in is on the channel and can hear it, but
 * broadcasts nothing, so nobody's client has a position to draw them at.
 */
export function PresenceSender({
  room,
  playerRef,
  dancing = false,
}: {
  room: Room
  /** Our own eye position, the thing we broadcast. */
  playerRef: React.RefObject<THREE.Vector3>
  dancing?: boolean
}) {
  const { camera } = useThree()

  /**
   * The last thing we put on the wire.
   *
   * Owned here rather than hanging off `room`, because this component is its
   * only reader *and* its only writer - and a ref reached through a prop is a
   * prop being mutated, which the compiler rightly rejects.
   */
  const lastSent = useRef<LastSent>(neverSent())

  useFrame(() => {
    const channel = room.channel.current
    if (!channel) return

    const inside = room.admission === 'owner' || room.admission === 'admitted'
    if (!inside) return

    const now = performance.now()
    const last = lastSent.current
    if (now - last.at < SEND_INTERVAL) return

    const player = playerRef.current
    // Heading, not pitch. Nobody needs to know we are looking at our shoes.
    const yaw = Math.atan2(camera.getWorldDirection(SEND_DIR).x, SEND_DIR.z)

    const next = {
      x: player.x,
      y: player.y,
      z: player.z,
      yaw,
      dancing,
      // Nobody can be hit in these rooms; the field is the lounge's.
      health: null,
    }

    if (!worthSending(last, next) && now - last.at < KEEPALIVE_MS) return

    lastSent.current = { at: now, ...next }

    void channel.send({
      type: 'broadcast',
      event: 'move',
      payload: {
        u: room.userId,
        // Rounded before it goes on the wire. Nobody can see a millimetre, and
        // shorter numbers mean smaller frames twelve times a second.
        x: +player.x.toFixed(2),
        y: +player.y.toFixed(2),
        z: +player.z.toFixed(2),
        r: +yaw.toFixed(3),
        d: dancing,
      } satisfies MoveMessage,
    })
  })

  return null
}

/** Everybody else in the room. */
export function RemotePeeps({ room }: { room: Room }) {
  return (
    <>
      {room.peers.map((peer) => (
        <RemotePeep
          key={peer.userId}
          room={room}
          userId={peer.userId}
          avatar={peer.avatar}
          name={peer.name}
        />
      ))}
    </>
  )
}

/**
 * One other person.
 *
 * Reads its position straight out of the shared transform map every frame
 * rather than taking it as a prop, so a packet arriving does not re-render
 * anything - it just changes the number this loop is easing toward. The only
 * React state here is the animation clip, which changes when somebody starts or
 * stops walking and not before.
 */
function RemotePeep({
  room,
  userId,
  avatar,
  name,
}: {
  room: Room
  userId: string
  avatar: string
  name: string
}) {
  const group = useRef<THREE.Group>(null)
  const [clip, setClip] = useState<AvatarClip>('idle')

  /**
   * This peer's emote slot, created on first render rather than on first
   * packet.
   *
   * `<EmoteBubble>` needs a stable ref for the life of the body, and the map
   * entry is created by whichever comes first - a packet arriving, or this. Both
   * paths have to end up pointing at the *same* object, or the bubble watches a
   * slot nobody writes to.
   */
  const emote = useRef(
    room.emotes.current?.get(userId) ??
      (() => {
        const fresh = noEmote()
        room.emotes.current?.set(userId, fresh)
        return fresh
      })(),
  )

  useFrame((_, delta) => {
    const node = group.current
    const state = room.transforms.current?.get(userId)
    if (!node || !state) return

    const travelled = advance(state.current, state.target, delta)

    node.position.set(
      state.current.x,
      state.current.y - EYE_HEIGHT,
      state.current.z,
    )
    node.rotation.y = state.current.yaw

    const next: AvatarClip = state.dancing ? 'dance' : gaitFor(travelled, delta)
    if (next !== clip) setClip(next)
  })

  return (
    <group ref={group}>
      <Suspense fallback={null}>
        {/* Other people are not obstacles to the cursor. Being unable to place
            a sofa because a visitor is standing where you were aiming would be
            a worse problem than clipping through each other. */}
        <AvatarModel model={avatar} clip={clip} ignoreRay />
      </Suspense>

      <Nameplate name={name} />
      <EmoteBubble state={emote} />
    </group>
  )
}
