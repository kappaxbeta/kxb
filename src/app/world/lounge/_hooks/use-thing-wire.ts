'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useRef, useState } from 'react'

import type { Claim, Pulse } from '@/domain/thingiverse/live'

/**
 * The half of the things channel that carries what things are *doing*.
 *
 * Its own hook rather than forty more lines in `use-things`, and the split is
 * along a real seam: everything in that file is a row, a command or a piece of
 * React state, and every one of these is a mailbox read sixty times a second by
 * a frame loop in another file. They share a socket and nothing else.
 *
 * Nothing here applies anything. Packets land in refs and are drained by
 * `useThingLife` inside the Canvas - because a `setState` per arriving packet
 * would re-render the whole scene four times a second to move a bar.
 */
export function useThingWire() {
  /**
   * This tab, as distinct from this person.
   *
   * The same value `multiplayer.tsx` mints for the ball, for the same reason
   * spelled out at length there: everything else in the room identifies a
   * *player*, which is right for a body and wrong for anything exactly one
   * client must be in charge of. Two tabs of the lowest-sorting person would
   * otherwise both elect themselves and run two simulations that disagree about
   * how cooked the burger is.
   *
   * `useState` rather than a ref, and that is not a preference either: a lazily
   * filled ref is a write during render, which React 19 refuses. This is a
   * value decided once and never set again, which is what a lazy initialiser is
   * for.
   */
  const [conn] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`,
  )

  /** Every tab on the topic, from the channel's own presence. The candidates. */
  const roomRef = useRef<string[]>([])

  /**
   * The last heartbeat heard, and the claims that have arrived since the frame
   * loop last looked.
   *
   * The pulse is *replaced* rather than queued - a heartbeat is a snapshot and
   * the newest is the only one worth having. The claims are queued, because
   * each happened once and a dropped one is a swing that did nothing.
   */
  const pulseRef = useRef<Pulse | null>(null)
  const claimsRef = useRef<Claim[]>([])

  const channelRef = useRef<RealtimeChannel | null>(null)

  /** Say what everything is doing. Only the driver calls this. */
  const pulse = useCallback((message: Pulse) => {
    channelRef.current?.send({ type: 'broadcast', event: 'life', payload: message })
  }, [])

  /**
   * Tell the driver what you just did.
   *
   * Sent the instant it happens rather than on the heartbeat, because a claim
   * is an event: it happened once, and one that arrived late or twice is a
   * crate hit twice for one swing.
   */
  const claim = useCallback((message: Claim) => {
    channelRef.current?.send({ type: 'broadcast', event: 'claim', payload: message })
  }, [])

  /**
   * Attach the handlers to the room's channel, and say we are here.
   *
   * Called from inside the channel effect in `use-things` rather than opening a
   * channel of its own, which is worth a word because that file spends a
   * paragraph arguing furniture does not belong on the movement channel. A
   * machine's state is not movement either: it is four packets a second for a
   * room that has any and nothing at all for the rooms that do not. What it
   * *is* is a fact about the same objects that topic already carries, and
   * splitting it off would mean a second private topic, a second Realtime
   * authorization policy and a second subscription for one more sentence about
   * the same crate.
   */
  const attach = useCallback(
    (channel: RealtimeChannel) => {
      channelRef.current = channel
      return channel
        .on('presence', { event: 'sync' }, () => {
          /*
            Who the election chooses between. Presence rather than "everybody we
            have heard from", which is what this tried first and is unsound in a
            way that is invisible until it is not: a client only ever hears from
            the *driver*, so a second client whose connection sorts lower would
            never learn there was anybody to defer to, would elect itself, and
            the room would have two drivers stepping two copies of every
            machine. Nothing about that looks wrong until two people watch the
            same burger cook at different speeds.
          */
          const state = channel.presenceState<{ c?: string }>()
          const room: string[] = []
          for (const entries of Object.values(state)) {
            for (const entry of entries) if (entry.c) room.push(entry.c)
          }
          roomRef.current = room
        })
        .on('broadcast', { event: 'life' }, ({ payload }) => {
          const heard = payload as Pulse
          // Our own heartbeat, bounced back by a second tab of the same person:
          // the socket does not echo to the sender, but a second socket is not
          // the sender. Only the driver's word counts, and if we are driving,
          // ours already has.
          if (!heard?.d || heard.d === conn) return
          pulseRef.current = heard
        })
        .on('broadcast', { event: 'claim' }, ({ payload }) => {
          const made = payload as Claim
          if (!made?.i) return
          // Kept whether or not we are driving. A client about to be elected
          // should not lose the swing that arrived a frame early, and one that
          // is not driving drops the whole queue on its next frame anyway.
          claimsRef.current.push(made)
        })
    },
    [conn],
  )

  /** Announce this tab, once the socket is up. Called from `subscribe`. */
  const arrive = useCallback(
    (channel: RealtimeChannel) => {
      // Tracked on the way in, so the election has a complete room from the
      // first sync rather than one that fills in as people happen to speak.
      void channel.track({ c: conn })
    },
    [conn],
  )

  /** Let go of the socket, and of the room it described. */
  const leave = useCallback(() => {
    channelRef.current = null
    roomRef.current = []
  }, [])

  return { conn, roomRef, pulseRef, claimsRef, pulse, claim, attach, arrive, leave }
}
