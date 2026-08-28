'use client'

import { useEffect, useRef, useState } from 'react'
import type { XpNetwork, XpSocket } from '@kxb/xp/host'
import { arrivals, type SceneClaim } from '@/app/xp/_hosts/room-scene'

/**
 * The room, as opposed to the room of the level you are standing in.
 *
 * ---------------------------------------------------------------------------
 * Why there are two topics and not one
 * ---------------------------------------------------------------------------
 * S1 put the scene in the topic (docs/xp/scenes.md §1.6), which is what makes
 * two people in two scenes cost nothing: they are not on one stream being
 * filtered, they are on two. `./together` is that stream - bodies, faces, and
 * the picture of the world each client's own actions made true.
 *
 * A door cannot go on it, and the reason is not the send. It is the *repair*.
 * `XpSocket` says in as many words that it makes no delivery guarantee, so the
 * design has always been that everybody present tells a newcomer where the room
 * actually is (`greeting`). Put the claim on the scene topic and that repair
 * inverts: somebody joining arrives in `enter`, which is the one topic nobody
 * is on any more, so there is nobody there to tell them - and they stand alone
 * in the lobby while the room is in the back room, permanently, with nothing on
 * screen to say why. It is the exact failure the greeting exists to prevent,
 * reintroduced by moving where it is sent.
 *
 * There is a smaller reason too, and it would have been a bug on its own: the
 * client that walks through a door is the client that leaves the topic. Sending
 * a claim and then unsubscribing in the same commit is a race with no winner
 * worth having.
 *
 * So: this topic is the *instance* - it never changes for as long as somebody
 * is in the room - and it carries the one message everybody must hear whichever
 * room of the level they are in.
 *
 * ---------------------------------------------------------------------------
 * What it deliberately does not carry
 * ---------------------------------------------------------------------------
 * No positions, no faces, no world picture. Those are all "who can see me",
 * which is the question the scene topic answers by existing. This one is
 * "which room is this game in", and it is a handful of messages per session:
 * one per door, and one greeting per arrival.
 */
export function useRoomLink({
  network,
  room,
  me,
  announce,
  greet,
  onSwap,
}: {
  /** Null when this level is one person alone in it, and then nothing joins. */
  network: XpNetwork | null
  /** The instance, without a scene on it - `roomId`, not `sceneTopic`. */
  room?: string
  me?: { id: string }
  /**
   * A door this client went through, to be told to the room.
   *
   * A counter beside the name rather than the name alone, exactly as
   * `./together`'s packets are: the thing being reported is an *event*, and two
   * people walking through the same door twice is a name that has not changed.
   */
  announce?: SceneClaim
  /**
   * What to tell a newcomer, or null in a room that has been through no doors.
   *
   * Null is nearly every room and it matters: announcing "we are on the level
   * you already loaded" is a message that changes nothing, sent by everybody
   * present, every time anybody arrives.
   */
  greet: SceneClaim | null
  /** A claim off the wire, unchecked. See `readClaim`. */
  onSwap: (payload: unknown) => void
}): void {
  const socket = useRef<XpSocket | null>(null)
  /** Only to redraw when *who* is here changes, which is rare. */
  const [present, setPresent] = useState<string[]>([])

  /**
   * Held in a ref so the join effect does not depend on it.
   *
   * A parent that rebuilds this callback would otherwise leave and rejoin the
   * room - and this is the topic whose whole value is that it does not move.
   */
  const onDoor = useRef(onSwap)
  useEffect(() => {
    onDoor.current = onSwap
  }, [onSwap])

  /**
   * The id and not the object, because the object is a prop.
   *
   * A parent handing over a fresh `{ id, name }` on every render would leave
   * and rejoin the room each time - which is the one thing this topic must not
   * do, since it is where the door messages are.
   */
  const myId = me?.id

  useEffect(() => {
    if (!network || !room || !myId) return
    let live = true
    let joined: XpSocket | null = null

    void network.join(room).then((open) => {
      // Left before the join finished, which is what a fast reload looks like.
      if (!live) {
        open.leave()
        return
      }
      joined = open
      socket.current = open

      /**
       * Handed up as it arrived rather than unpacked here, which is where
       * `./together` left it too: whether a payload is a claim is `readClaim`'s
       * question, and it lives with the rule that decides which of two claims a
       * room lands on. Splitting them would put half the validation beside the
       * socket and half beside the decision.
       */
      open.on('door', (payload) => {
        onDoor.current(payload)
      })

      open.onPeers((peers) => {
        setPresent(peers.filter((peer) => peer.id !== myId).map((peer) => peer.id))
      })
    })

    return () => {
      live = false
      socket.current = null
      joined?.leave()
    }
  }, [network, room, myId])

  /**
   * Telling the room about a door this client went through.
   *
   * Keyed on the counter alone: the name is read when the effect runs, and
   * listing it would re-announce a door whose name simply repeated. Nothing is
   * sent for the first render - the counter starts wherever the parent's does
   * and only a *change* is an event - so joining a room does not announce a
   * door nobody walked through.
   */
  const announced = useRef(announce?.at)
  useEffect(() => {
    if (!announce) return
    if (announced.current === announce.at) return
    announced.current = announce.at
    socket.current?.send('door', announce)
  }, [announce])

  /**
   * Telling whoever just arrived where the room actually is.
   *
   * Sent by *everybody* present rather than by an elected one, because there is
   * nobody to elect. That is only safe because it is idempotent: the newcomer
   * runs the same total ordering over however many copies arrive, so N answers
   * and one answer land in the same place. See `winner` in ../_hosts/room-scene.
   *
   * Keyed on *who* is here rather than on how many, which is the fix for a bug
   * this had once already: counting misses the case where somebody leaves and
   * somebody else joins between two renders, because the number is unchanged
   * and the newcomer is never told where the room is. See `arrivals`.
   */
  const greeted = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const fresh = arrivals(present, greeted.current)
    /**
     * Recorded even when there is nothing to say. Otherwise a room with no
     * claim yet - which is nearly every room, right up until the first door -
     * accumulates nobody in `greeted`, and the moment a door *is* opened
     * everybody present counts as new and is greeted at once.
     */
    greeted.current = new Set(present)
    if (fresh.length === 0) return
    if (greet) socket.current?.send('door', greet)
  }, [greet, present])
}
