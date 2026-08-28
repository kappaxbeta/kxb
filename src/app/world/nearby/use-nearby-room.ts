'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type EmoteMessage,
  type EmoteState,
  type MoveMessage,
  noEmote,
  type PeerTransform,
  showEmote,
} from '@/app/world/_presence/presence-core'
import type { Peer, Room } from '@/app/world/_presence/room-presence'
import { isEmote } from '@/domain/world/emotes'
import type { Nearby } from './use-nearby'

/**
 * The nearby mesh, wearing the shape the scene already knows how to draw.
 *
 * ---------------------------------------------------------------------------
 * Why an adapter and not a new renderer
 * ---------------------------------------------------------------------------
 * `RemotePeeps` and `PresenceSender` already do this job: interpolate other
 * people out of a transform map inside the frame loop, draw a body and a
 * nameplate, and put twelve positions a second on the wire. None of it knows
 * or cares what the wire is - everything they need arrives on a `Room`, and
 * the only transport-shaped thing on it is `channel`, which they use for
 * exactly one call.
 *
 * So this builds a `Room` out of a data channel instead of a Realtime one. The
 * scene draws WebRTC peers with the code it already had, and nothing in the
 * lounge learns that a second transport exists.
 *
 * The alternative was making `<Multiplayer>` transport-agnostic - 1762 lines,
 * live, and welded to Supabase presence. This touches none of it.
 */

/**
 * A room with no doorman.
 *
 * `admission` gates whether `PresenceSender` broadcasts at all, and the
 * homestead uses it for knocking. Getting in here is having been handed a QR
 * code, which happened before any of this existed - so everybody who reaches
 * this point is already inside, and the knock machinery has nothing to do.
 */
export function useNearbyRoom(nearby: Nearby): Room {
  const transforms = useRef(new Map<string, PeerTransform>())
  const emotes = useRef(new Map<string, EmoteState>())
  const selfEmote = useRef(noEmote())

  /**
   * The channel, behind a ref with a stable identity.
   *
   * `PresenceSender` reads `room.channel.current` inside `useFrame`. A new
   * object per render would be fine for it, but the ref is what the `Room`
   * contract says, and the send is duck-typed onto the one method that is
   * actually called - `RealtimeChannel` has dozens and this needs one.
   */
  const channel = useRef(
    {
      send: ({ event, payload }: { event: string; payload: unknown }) => {
        nearby.send(event, payload)
        // `RealtimeChannel.send` resolves; the caller does `void` it, but the
        // shape has to match or the type is a lie.
        return Promise.resolve('ok' as const)
      },
    } as unknown as Room['channel']['current'],
  )

  useEffect(() => {
    /**
     * Somebody moved.
     *
     * The same handling the Realtime room does, and deliberately so - a peer
     * seeded at the origin visibly slides in from the middle of the world the
     * first time they are heard from, which is why `current` starts at the
     * first known position rather than at nothing.
     */
    const offMove = nearby.on('move', (payload, from) => {
      const message = payload as MoveMessage
      if (!message || typeof message.x !== 'number' || typeof message.z !== 'number') return

      /**
       * The envelope's sender, not the id inside the payload.
       *
       * In a star the host repeats other people's frames, so the payload is
       * the only place the author is named - but a peer can put anything
       * there. The mesh stamps `from` from the link the frame arrived on, so
       * taking that is what stops one guest from driving another's body.
       */
      const who = from
      const target = { x: message.x, y: message.y, z: message.z, yaw: message.r }
      const existing = transforms.current.get(who)

      if (existing) {
        existing.target = target
        existing.dancing = Boolean(message.d)
        return
      }

      transforms.current.set(who, {
        target,
        current: { ...target },
        dancing: Boolean(message.d),
        // Nobody can be hit in here; the field is the lounge's.
        health: null,
      })
    })

    const offEmote = nearby.on('emote', (payload, from) => {
      const message = payload as EmoteMessage
      // A face we cannot draw is a face nobody sees.
      if (!message || !isEmote(message.e)) return

      let slot = emotes.current.get(from)
      if (!slot) {
        slot = noEmote()
        emotes.current.set(from, slot)
      }
      showEmote(slot, message.e)
    })

    return () => {
      offMove()
      offEmote()
    }
  }, [nearby])

  /**
   * Forget anybody who left.
   *
   * The roster is the authority on who is here. Without this their last
   * position stays in the map and `RemotePeeps` stops drawing them - which is
   * correct - but the entry leaks, and if the same id ever came back they
   * would appear at wherever they were standing when the link dropped.
   */
  const here = nearby.members.map((member) => member.id).join(',')
  useEffect(() => {
    const present = new Set(here.split(','))
    for (const id of [...transforms.current.keys()]) {
      if (!present.has(id)) transforms.current.delete(id)
    }
    for (const id of [...emotes.current.keys()]) {
      if (!present.has(id)) emotes.current.delete(id)
    }
  }, [here])

  const peers: Peer[] = useMemo(
    () =>
      nearby.members
        // Never ourselves: our own body is drawn by the scene from the camera,
        // and a second one would be the same person a round trip behind.
        .filter((member) => member.id !== nearby.self.id)
        .map((member) => ({
          userId: member.id,
          name: member.name,
          avatar: member.avatar || 'fox',
        })),
    [nearby.members, nearby.self.id],
  )

  /** Pull a face: ours immediately, theirs when the frame lands. */
  const [emote] = useState(() => (id: Parameters<Room['emote']>[0]) => {
    showEmote(selfEmote.current, id)
    nearby.send('emote', { u: nearby.self.id, e: id })
  })

  return useMemo<Room>(
    () => ({
      admission: 'owner',
      peers,
      transforms,
      emotes,
      selfEmote,
      knocks: [],
      emote,
      // There is no door to answer. Getting in was being handed a code.
      admit: () => {},
      refuse: () => {},
      eject: () => {},
      knockAgain: () => {},
      channel,
      userId: nearby.self.id,
      isOwner: true,
    }),
    [peers, emote, nearby.self.id],
  )
}
