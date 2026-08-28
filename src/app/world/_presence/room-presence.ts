'use client'

/**
 * Other people in somebody's café, house or garden - and whether you are one.
 *
 * The lounge is the commons and needs none of this: every member is already
 * welcome, so `Multiplayer` opens a channel and starts drawing bodies. These
 * three rooms belong to a *person*, which turns "who is here" into two
 * questions rather than one - who is standing in the room, and who is allowed
 * to be.
 *
 * ---------------------------------------------------------------------------
 * Durable door, ephemeral admission
 * ---------------------------------------------------------------------------
 * The *policy* - open, knock, closed - is an event on the homestead stream,
 * because it is a setting you expect to still hold tomorrow.
 *
 * The *admission* is not written down anywhere. A knock, an invitation and an
 * ejection all live on the Realtime channel and die with the tab, which is the
 * whole reason there is no guest-list table to garbage-collect, no revocation
 * to get wrong, and no way for yesterday's visitor to still be holding a key.
 * Being let in is exactly as durable as the conversation that let you in.
 *
 * ---------------------------------------------------------------------------
 * What "admitted" actually enforces
 * ---------------------------------------------------------------------------
 * Worth being precise, because it is less than it looks. Admission gates two
 * things: whether your position goes out on the wire, and whether the owner's
 * client draws you. It does *not* gate reading the room's furniture - the read
 * model is membership-scoped by design (see 20260730000000), and the page has
 * already fetched the layout before this code runs.
 *
 * So a closed door stops a colleague from being *in* your house. It does not
 * stop a colleague who is already in your workspace from knowing what your
 * house looks like. The Realtime policy in 20260731000000 says the same thing
 * about the channel itself, and for the same reason: a Postgres policy cannot
 * check an invitation that only exists in two browser tabs.
 */

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type EmoteMessage,
  type EmoteState,
  KNOCK_TTL_MS,
  type MoveMessage,
  noEmote,
  type PeerTransform,
  pruneKnocks,
  showEmote,
} from '@/app/world/_presence/presence-core'
import { useReportConnection } from '@/app/components/connection'
import { leaveHere, publishHere } from '@/app/world/_stores/here-store'
import { type DoorMode } from '@/domain/homestead/events'
import { type EmoteId, isEmote } from '@/domain/world/emotes'
import { DEFAULT_AVATAR, isKnownAvatar } from '@/domain/lounge/avatars'
import type { OwnedPlace } from '@/domain/world/places'
import { createClient } from '@/lib/supabase/client'

/** Somebody standing in the room. */
export interface Peer {
  userId: string
  name: string
  avatar: string
}

/** Somebody waiting outside it. */
export interface Knock {
  userId: string
  name: string
  /** When they knocked, so a stale one can be aged out of the list. */
  at: number
}

/**
 * Where you stand with the front door.
 *
 * `absent` is its own state rather than folded into `refused`, because they
 * call for opposite things from the visitor: one is "nobody is home, come back
 * later", the other is "they said no". Collapsing them would have the app tell
 * somebody they had been turned away when in fact nobody had heard them.
 */
export type Admission =
  | 'owner'
  | 'connecting'
  | 'knocking'
  | 'absent'
  | 'admitted'
  | 'refused'
  | 'closed'
  | 'ejected'
  | 'error'

/** Are we past the door? The one predicate the scene actually cares about. */
export function isInside(admission: Admission): boolean {
  return admission === 'owner' || admission === 'admitted'
}

/** Addressed messages. All of them name a recipient; everyone else ignores them. */
interface KnockMessage {
  /** Who is knocking. */
  u: string
  n: string
}

interface AnswerMessage {
  /** Who it is addressed to. */
  t: string
}

/**
 * How long to wait for the owner's presence to show up before deciding they
 * are not home.
 *
 * Presence sync can fire before every peer's `track` has landed, so declaring
 * absence on the first sync would tell a visitor nobody was home in the
 * fraction of a second before the owner appeared. This is long enough to
 * outlast that and short enough that a genuinely empty house does not leave
 * somebody waiting at the door wondering.
 */
const OWNER_GRACE_MS = 2500


/**
 * Everything the scene needs from the room, gathered into one object.
 *
 * Passed down as a prop rather than through React context, deliberately.
 * Half of these are read inside `useFrame`, which runs under react-three-fiber's
 * own reconciler - and a value threaded as a prop crosses that boundary with no
 * bridging, no extra provider, and no chance of the 3D half silently reading a
 * different context instance than the DOM half.
 */
export interface Room {
  admission: Admission
  /** Everyone drawn right now, never including you. */
  peers: Peer[]
  /** Live positions, read from the frame loop. Never React state - see below. */
  transforms: React.RefObject<Map<string, PeerTransform>>
  /** Live emotes, keyed the same way. */
  emotes: React.RefObject<Map<string, EmoteState>>
  /** Your own face, drawn over your own body. */
  selfEmote: React.RefObject<EmoteState>
  /** People waiting to be let in. Only ever non-empty for the owner. */
  knocks: Knock[]
  /** Pull a face, and tell the room. */
  emote: (id: EmoteId) => void
  /** Owner only: let somebody in, or turn them away. */
  admit: (userId: string) => void
  refuse: (userId: string) => void
  /** Owner only: throw somebody out who is already inside. */
  eject: (userId: string) => void
  /** Knock again after being refused, or after nobody answered. */
  knockAgain: () => void
  /** The live channel, for the frame loop's outbound packets. */
  channel: React.RefObject<RealtimeChannel | null>
  userId: string
  /** True when this is your own homestead. */
  isOwner: boolean
}

export function useRoom({
  tenantId,
  place,
  /** Whose homestead this is. */
  ownerId,
  door,
  userId,
  name,
  avatar,
}: {
  tenantId: string
  place: OwnedPlace
  ownerId: string
  door: DoorMode
  userId: string
  name: string
  avatar: string
}): Room {
  const supabase = useMemo(() => createClient(), [])
  const isOwner = userId === ownerId

  /**
   * The opening position, computed once.
   *
   * Your own house needs no permission. A door standing open needs none
   * either - the setting *is* the permission, granted in advance. Only `knock`
   * involves a conversation, and only `closed` refuses to have one.
   */
  const [admission, setAdmission] = useState<Admission>(() =>
    isOwner
      ? 'owner'
      : door === 'closed'
        ? 'closed'
        : door === 'open'
          ? 'connecting'
          : 'connecting',
  )

  const [peers, setPeers] = useState<Peer[]>([])
  const [knocks, setKnocks] = useState<Knock[]>([])

  /**
   * A dead channel is worth saying in the tab strip, not just in the room.
   *
   * The favicon in the root layout turns red on this. `'error'` only, not
   * `'closed'` or `'refused'`: a door you were not let through is working
   * exactly as designed, and a red tab would read as a fault.
   */
  useReportConnection(admission === 'error')

  const transforms = useRef(new Map<string, PeerTransform>())
  const emotes = useRef(new Map<string, EmoteState>())
  const selfEmote = useRef<EmoteState>(noEmote())
  const channelRef = useRef<RealtimeChannel | null>(null)

  /**
   * Whether we are inside, readable synchronously.
   *
   * The presence handler and the outbound sender both need it, and both run
   * outside React's render - the handler from a WebSocket callback, the sender
   * from the frame loop. Reading the state variable there would close over
   * whatever it was when the channel was built, which is always `connecting`.
   */
  const insideRef = useRef(isInside(admission))
  useEffect(() => {
    insideRef.current = isInside(admission)
  }, [admission])

  /**
   * Whether the channel has actually joined.
   *
   * `track` before the subscription completes is a message with nowhere to go.
   * The re-announcement effect below fires on mount as well as on transitions,
   * and without this it would spend its first run talking to a socket that is
   * still connecting.
   */
  const subscribed = useRef(false)

  /** Bumped to knock again, which re-runs the effect below from the top. */
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    /**
     * A bolted door is not something to open a socket about.
     *
     * No `setAdmission` here: the initial state already resolves `closed`, and
     * `knockAgain` is not offered for a bolted door - so there is no path that
     * reaches this effect in any other state. Setting it again would just be a
     * synchronous render inside an effect for no gain.
     */
    if (door === 'closed' && !isOwner) return

    /**
     * `room:<tenant>:<place>:<owner>` - see 20260731000000 for the policy that
     * reads this shape. `private: true` is what makes Realtime check it;
     * without the flag the topic is open to anyone holding the anon key who can
     * guess a workspace id.
     */
    const channel = supabase.channel(`room:${tenantId}:${place}:${ownerId}`, {
      config: { private: true, presence: { key: userId } },
    })
    channelRef.current = channel

    /** Cleared on teardown, so a pending decision cannot fire into a dead tab. */
    let graceTimer: ReturnType<typeof setTimeout> | undefined

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{
          userId: string
          name: string
          avatar: string
          /** Only people past the door are drawn. */
          inside: boolean
        }>()

        const entries = Object.values(state).flat()

        const next: Peer[] = []
        for (const entry of entries) {
          if (!entry?.userId || entry.userId === userId) continue
          // Somebody still on the doormat is on the channel but not in the
          // room. Drawing them would make the knock pointless.
          if (!entry.inside) continue
          if (next.some((peer) => peer.userId === entry.userId)) continue

          next.push({
            userId: entry.userId,
            name: entry.name || 'Someone',
            // An avatar we no longer ship must not become a 404 mid-scene.
            avatar: isKnownAvatar(entry.avatar) ? entry.avatar : DEFAULT_AVATAR,
          })
        }

        setPeers(next)

        // Drop the per-peer maps for people who left, or they grow for the life
        // of the session.
        const present = new Set(next.map((peer) => peer.userId))
        for (const key of transforms.current.keys()) {
          if (!present.has(key)) transforms.current.delete(key)
        }
        for (const key of emotes.current.keys()) {
          if (!present.has(key)) emotes.current.delete(key)
        }

        if (isOwner) {
          // Somebody who closed their tab is no longer waiting for an answer -
          // but a knock can outrun the sync that announces its sender, so the
          // rule is not "in presence right now". See `pruneKnocks`.
          const onChannel = new Set(
            entries.flatMap((entry) => (entry?.userId ? [entry.userId] : [])),
          )
          const now = Date.now()
          setKnocks((current) => pruneKnocks(current, onChannel, now))
          return
        }

        /**
         * Is the owner here to answer?
         *
         * Re-knocking on every sync in which they appear is intentional: the
         * common case is knocking at an empty house, having the owner arrive a
         * minute later, and needing them to hear it without the visitor having
         * to press anything.
         */
        const ownerHere = entries.some((entry) => entry?.userId === ownerId)

        if (ownerHere && !insideRef.current) {
          /**
           * Cancel any pending "nobody home".
           *
           * Load-bearing, and its absence was a bug: an earlier sync that did
           * not yet list the owner arms the timer, then this sync finds them
           * and knocks - and 2.5 seconds later the stale timer fired anyway and
           * told somebody mid-knock that the house was empty.
           */
          clearTimeout(graceTimer)

          void channel.send({
            type: 'broadcast',
            event: 'knock',
            payload: { u: userId, n: name } satisfies KnockMessage,
          })
          setAdmission((current) =>
            current === 'connecting' || current === 'absent' ? 'knocking' : current,
          )
        }

        if (!ownerHere && !insideRef.current) {
          clearTimeout(graceTimer)
          graceTimer = setTimeout(() => {
            setAdmission((current) =>
              current === 'connecting' || current === 'knocking'
                ? 'absent'
                : current,
            )
          }, OWNER_GRACE_MS)
        }
      })

      .on('broadcast', { event: 'move' }, ({ payload }) => {
        const message = payload as MoveMessage
        if (!message?.u || message.u === userId) return

        const target = { x: message.x, y: message.y, z: message.z, yaw: message.r }
        const existing = transforms.current.get(message.u)

        if (existing) {
          existing.target = target
          existing.dancing = message.d
        } else {
          transforms.current.set(message.u, {
            target,
            // Seeded to the first known position rather than the origin, so a
            // peer does not visibly slide in from the middle of the world.
            current: { ...target },
            dancing: message.d,
            health: null,
          })
        }
      })

      .on('broadcast', { event: 'emote' }, ({ payload }) => {
        const message = payload as EmoteMessage
        if (!message?.u || message.u === userId) return
        // A face we cannot draw is a face nobody sees - see `isEmote`.
        if (!isEmote(message.e)) return

        let slot = emotes.current.get(message.u)
        if (!slot) {
          slot = noEmote()
          emotes.current.set(message.u, slot)
        }
        showEmote(slot, message.e)
      })

      .on('broadcast', { event: 'knock' }, ({ payload }) => {
        const message = payload as KnockMessage
        // Only the owner answers the door.
        if (!isOwner || !message?.u || message.u === userId) return

        setKnocks((current) => {
          const now = Date.now()
          // Their previous knock is superseded by this one, so it goes whether
          // or not it was stale.
          const fresh = current.filter(
            (knock) => knock.userId !== message.u && now - knock.at < KNOCK_TTL_MS,
          )
          return [...fresh, { userId: message.u, name: message.n || 'Someone', at: now }]
        })
      })

      .on('broadcast', { event: 'invite' }, ({ payload }) => {
        const message = payload as AnswerMessage
        if (message?.t !== userId) return
        setAdmission('admitted')
      })

      .on('broadcast', { event: 'deny' }, ({ payload }) => {
        const message = payload as AnswerMessage
        if (message?.t !== userId) return
        setAdmission('refused')
      })

      .on('broadcast', { event: 'kick' }, ({ payload }) => {
        const message = payload as AnswerMessage
        if (message?.t !== userId) return
        setAdmission('ejected')
      })

      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          subscribed.current = true
          /**
           * An open door admits on arrival.
           *
           * Decided here rather than in the initial state so that it happens
           * *after* the subscription exists - announcing yourself as inside a
           * room you have not joined yet is a packet nobody receives.
           */
          const inside = isOwner || door === 'open'
          if (inside) setAdmission(isOwner ? 'owner' : 'admitted')

          void channel.track({ userId, name, avatar, inside })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Surfaced rather than swallowed: the most likely cause is the
          // presence migration not being applied, and an empty room is
          // indistinguishable from a room nobody is in.
          setAdmission((current) => (isInside(current) ? current : 'error'))
        }
      })

    return () => {
      clearTimeout(graceTimer)
      subscribed.current = false
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [supabase, tenantId, place, ownerId, userId, name, avatar, door, isOwner, attempt])

  /**
   * Re-announce ourselves whenever we cross the threshold.
   *
   * Presence is a snapshot, not a stream of diffs: the owner's client decides
   * who to draw from what everybody last tracked, so being let in has to be
   * followed by saying so. Without this a guest is admitted, sees the room, and
   * stays invisible to everybody in it.
   */
  const inside = isInside(admission)
  useEffect(() => {
    const channel = channelRef.current
    if (!channel || !subscribed.current) return
    void channel.track({ userId, name, avatar, inside })
  }, [inside, userId, name, avatar])

  const emote = useCallback(
    (id: EmoteId) => {
      if (!isEmote(id)) return
      // Your own face goes up immediately rather than waiting for the round
      // trip, which at this distance reads as the button not having worked.
      showEmote(selfEmote.current, id)

      // Emoting is something you can do on the doormat, and it is the only
      // thing you can do there - it is how you wave at somebody to be let in.
      channelRef.current?.send({
        type: 'broadcast',
        event: 'emote',
        payload: { u: userId, e: id } satisfies EmoteMessage,
      })
    },
    [userId],
  )

  const answer = useCallback(
    (event: 'invite' | 'deny' | 'kick', to: string) => {
      if (!isOwner) return
      channelRef.current?.send({
        type: 'broadcast',
        event,
        payload: { t: to } satisfies AnswerMessage,
      })
      setKnocks((current) => current.filter((knock) => knock.userId !== to))
    },
    [isOwner],
  )

  const admit = useCallback((id: string) => answer('invite', id), [answer])
  const refuse = useCallback((id: string) => answer('deny', id), [answer])

  const eject = useCallback(
    (id: string) => {
      answer('kick', id)
      // Stop drawing them now rather than waiting for their next presence
      // sync, so the ejection looks like it took effect when it was ordered.
      transforms.current.delete(id)
      emotes.current.delete(id)
      setPeers((current) => current.filter((peer) => peer.userId !== id))
    },
    [answer],
  )

  /**
   * Knock again.
   *
   * Rebuilds the channel rather than just re-sending, because the states this
   * recovers from - refused, ejected, the owner never turning up - are all ones
   * where the cheap thing to do is start the conversation over rather than
   * reason about which half of the old one is still valid.
   */
  const knockAgain = useCallback(() => {
    setAdmission('connecting')
    setAttempt((n) => n + 1)
  }, [])

  /**
   * Tell the sidebar who is in here with us.
   *
   * Only once we are past the door: a visitor still knocking can see the
   * channel but is not in the room, and listing its occupants in the rail
   * would be a guest list read through the letterbox.
   */
  useEffect(() => {
    if (!inside) {
      leaveHere(place)
      return
    }
    publishHere(place, peers)
    return () => leaveHere(place)
  }, [inside, place, peers])

  return {
    admission,
    peers,
    transforms,
    emotes,
    selfEmote,
    knocks,
    emote,
    admit,
    refuse,
    eject,
    knockAgain,
    channel: channelRef,
    userId,
    isOwner,
  }
}
