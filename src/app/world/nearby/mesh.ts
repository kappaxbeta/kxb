'use client'

import {
  cleanMember,
  cleanRoster,
  decode,
  encode,
  forwardTo,
  HELLO,
  ROSTER,
  type Envelope,
  type Member,
} from '@/domain/nearby/wire'

/**
 * A room made of data channels, with the person who opened it in the middle.
 *
 * ---------------------------------------------------------------------------
 * A star, not a mesh, whatever the file is called
 * ---------------------------------------------------------------------------
 * Everybody connects to the host and to nobody else. A full mesh would be
 * fewer hops and better latency, and it is the wrong shape here for one
 * practical reason: every edge costs a handshake, and a handshake is somebody
 * holding up a phone. Five people fully meshed is ten photographs. Five people
 * in a star is five, and the host takes them one after another.
 *
 * The cost is that the host relays, so their upload carries the room and their
 * leaving ends it. Both are acceptable for six people standing together, and
 * both are why `maxGuests` is small.
 *
 * ---------------------------------------------------------------------------
 * Everything inbound is untrusted
 * ---------------------------------------------------------------------------
 * A frame arrives from a device we know nothing about. It is parsed by
 * `@/domain/nearby/wire` and nowhere else, and a frame that does not parse is
 * dropped rather than thrown on - an exception in a channel handler takes the
 * connection with it.
 */

/** The hotspot's ceiling, near enough: an iPhone admits five wifi clients. */
export const MAX_GUESTS = 5

export type Role = 'alone' | 'hosting' | 'guest'

type Handler = (payload: unknown, from: string) => void

export interface Mesh {
  readonly self: Member
  role(): Role
  /** Everybody, us included, as the host last said. */
  members(): Member[]
  send(event: string, payload: unknown): void
  on(event: string, handler: Handler): () => void
  /** Told whenever the roster or the role changes. */
  watch(listener: () => void): () => void
  /** Host: take a newly opened channel to a guest. */
  addGuest(channel: RTCDataChannel): void
  /** Guest: take our one channel to the host. */
  attachHost(channel: RTCDataChannel): void
  close(): void
}

export function createMesh(self: Member): Mesh {
  const handlers = new Map<string, Set<Handler>>()
  const watchers = new Set<() => void>()

  /** Host only: one entry per guest, keyed by a link id until they say hello. */
  const links = new Map<string, RTCDataChannel>()
  /** Host only: which member is on which link. */
  const whose = new Map<string, Member>()
  /** Guest only. */
  let upstream: RTCDataChannel | null = null

  let role: Role = 'alone'
  let roster: Member[] = [self]
  let nextLink = 0

  const changed = () => {
    for (const listener of watchers) listener()
  }

  const deliver = (envelope: Envelope) => {
    // Never to ourselves. Our own action already happened locally; hearing it
    // back a round trip later is the same event applied twice.
    if (envelope.f === self.id) return
    for (const handler of handlers.get(envelope.e) ?? []) handler(envelope.p, envelope.f)
  }

  const post = (channel: RTCDataChannel | null, envelope: Envelope) => {
    if (!channel || channel.readyState !== 'open') return
    try {
      channel.send(encode(envelope))
    } catch {
      // A channel that closed between the check and the send. The roster will
      // catch up when `onclose` fires; losing this frame is not worth more.
    }
  }

  /** Host: the roster is ours to decide, so say what it is. */
  const publishRoster = () => {
    roster = [self, ...whose.values()]
    for (const channel of links.values()) {
      post(channel, { e: ROSTER, f: self.id, p: roster })
    }
    changed()
  }

  return {
    self,
    role: () => role,
    members: () => roster,

    send(event, payload) {
      const envelope: Envelope = { e: event, f: self.id, p: payload }
      if (role === 'guest') {
        // Guests only ever talk to the host, who repeats it to the others.
        post(upstream, envelope)
        return
      }
      for (const channel of links.values()) post(channel, envelope)
    },

    on(event, handler) {
      const set = handlers.get(event) ?? new Set()
      set.add(handler)
      handlers.set(event, set)
      return () => set.delete(handler)
    },

    watch(listener) {
      watchers.add(listener)
      return () => watchers.delete(listener)
    },

    addGuest(channel) {
      const id = `link-${nextLink++}`
      links.set(id, channel)
      role = 'hosting'

      channel.onmessage = (event) => {
        const envelope = decode(event.data)
        if (!envelope) return

        if (envelope.e === HELLO) {
          const member = cleanMember(envelope.p)
          if (!member) return
          /**
           * The id on the envelope wins over the one in the payload.
           *
           * They are the same when a peer is honest. When they are not, taking
           * the payload's would let somebody introduce themselves as another
           * guest and have their frames attributed to that body.
           */
          whose.set(id, { ...member, id: envelope.f })
          publishRoster()
          return
        }

        deliver(envelope)
        // The relay. Everybody except the link it came in on.
        for (const other of forwardTo(links, id)) post(links.get(other)!, envelope)
      }

      channel.onclose = () => {
        links.delete(id)
        whose.delete(id)
        if (links.size === 0) role = 'alone'
        publishRoster()
      }

      publishRoster()
    },

    attachHost(channel) {
      upstream = channel
      role = 'guest'

      channel.onmessage = (event) => {
        const envelope = decode(event.data)
        if (!envelope) return

        if (envelope.e === ROSTER) {
          // The host is the authority on who is here, so this replaces rather
          // than merges - somebody who left is gone, not missing from an update.
          roster = cleanRoster(envelope.p, MAX_GUESTS + 1)
          changed()
          return
        }

        deliver(envelope)
      }

      channel.onclose = () => {
        upstream = null
        role = 'alone'
        roster = [self]
        changed()
      }

      // Introduce ourselves, so the host can put us in the roster.
      post(channel, { e: HELLO, f: self.id, p: self })
      changed()
    },

    close() {
      for (const channel of links.values()) channel.close()
      upstream?.close()
      links.clear()
      whose.clear()
      handlers.clear()
      upstream = null
      role = 'alone'
      roster = [self]
      changed()
      watchers.clear()
    },
  }
}
