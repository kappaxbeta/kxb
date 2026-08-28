/**
 * Face video: who calls whom, and what they say to arrange it.
 *
 * The pure half of the feature. Everything here is arithmetic over a roster -
 * no sockets, no `RTCPeerConnection`, no DOM - because the two decisions that
 * actually break a mesh are decisions, not plumbing: *whether* a pair should be
 * connected at all, and *which end* of the pair makes the offer. Both are
 * answered here, identically on both machines, and tested without a browser.
 *
 * ---------------------------------------------------------------------------
 * No glare, rather than recovery from glare
 * ---------------------------------------------------------------------------
 * The usual arrangement for a peer-to-peer mesh is "perfect negotiation": both
 * ends may offer at any moment, and a polite peer rolls its own offer back when
 * one arrives mid-flight. It exists because in the general case there is no
 * agreed ordering between two clients.
 *
 * Here there is one. Presence hands every client the same roster, and every
 * client is already identified by a connection id that sorts. So the offerer is
 * simply the lower id and the other end never offers at all - which removes the
 * rollback path, the polite/impolite flag, and the class of bug where both ends
 * decide they were the polite one.
 *
 * ---------------------------------------------------------------------------
 * A link exists because somebody has a camera on
 * ---------------------------------------------------------------------------
 * A room where nobody has switched their camera on opens no connections at all,
 * which is the whole reason `face` rides along on presence: without it, either
 * every pair holds an idle connection against the possibility of a camera, or
 * a camera switched on has no way to announce itself. One boolean on a payload
 * that is already being sent is cheaper than either.
 */

/** What one signalling message is doing. */
export type FaceKind = 'offer' | 'answer' | 'ice' | 'bye'

/**
 * One signalling message, on the room's own channel.
 *
 * Single letters for the same reason every other message in this room uses
 * them: it rides the same socket as movement, and the field names are a
 * meaningful fraction of a candidate.
 *
 * Addressed `to` a *connection* rather than to a person, because a peer
 * connection is between two tabs. Two tabs of the same account in the same room
 * is a normal thing to be doing - it is how this was tested - and a message
 * routed by user id would be answered twice by one of them.
 */
export interface FaceMessage {
  /** Who sent it. */
  u: string
  /** Which of their tabs sent it. */
  c: string
  /** Which tab it is for. Everybody else on the channel drops it. */
  to: string
  k: FaceKind
  /** An SDP, or one ICE candidate as JSON. Absent on `bye`. */
  d?: string
}

/** A client in the room, as presence describes it. */
export interface FaceClient {
  userId: string
  conn: string
  /** Their camera is on and they have something to send. */
  face: boolean
}

/** Which end of a pair we are. */
export type FaceRole = 'offer' | 'answer'

/** One connection we mean to be holding. */
export interface WantedLink {
  /** The far tab. */
  conn: string
  /** Whose tab it is, which is the body the picture gets drawn over. */
  userId: string
  role: FaceRole
  /**
   * Whether this peer is sending a picture *right now*.
   *
   * Not a reason to build or drop the connection - the connection carries a
   * camera in either direction and outlives any particular one being on. It is
   * how the receiving end knows to take a face back down: a peer who switches
   * off stops sending frames, and a video element that stops receiving them
   * holds its last one, which reads as somebody sitting very still rather than
   * as a camera that is off.
   */
  receiving: boolean
}

/**
 * How many cameras a room will carry at once.
 *
 * Small, and the reason is upload rather than download: a mesh has every
 * broadcaster sending its own copy to every other person in the room, so the
 * cost of one more camera is borne by everybody who already had one. Four is
 * about where a domestic upstream stops being able to pretend otherwise.
 *
 * The cap is on *broadcasters*, not on links, and it is applied to the same
 * sorted list on every machine - so all of them admit the same four. A cap each
 * client applied to its own view of the room would let two clients admit
 * different sets, and a pair that disagrees about whether it should exist is
 * the one failure this whole module is arranged to avoid.
 */
export const MAX_FACES = 4

/**
 * One entry per tab, keeping the newest.
 *
 * Presence does not replace a client's row when it re-tracks - it appends, and
 * hands the whole list back on sync. So a tab that has switched its camera on
 * appears twice in the roster: once as it joined, with no camera, and once as
 * it is now. `Multiplayer` already lives with this for the roster of *people*,
 * where it dedupes on first-seen and the answer is the same either way.
 *
 * Here it is not the same either way, and the cost of ignoring it was the whole
 * feature: the two copies disagree about whether a camera is on, so `linkRole`
 * answers differently depending on which one it reads, the two ends of a pair
 * settle on incompatible roles, and every sync tears the connection down and
 * builds another one that fails the same way. Later wins, because presence
 * appends in the order the client tracked.
 */
export function freshest(room: readonly FaceClient[]): FaceClient[] {
  const byConn = new Map<string, FaceClient>()
  for (const client of room) {
    if (!client.conn) continue
    byConn.set(client.conn, client)
  }
  return [...byConn.values()]
}

/** The cameras this room is carrying, in the order every client agrees on. */
export function admitted(room: readonly FaceClient[]): string[] {
  return freshest(room)
    .filter((client) => client.face)
    .map((client) => client.conn)
    .sort()
    .slice(0, MAX_FACES)
}

/**
 * Which end of a pair offers, or that there is no pair.
 *
 * `null` means there is nothing to connect: neither camera is on, or the one
 * that is has not been admitted by the cap above.
 *
 * Note what the answer does *not* depend on: which end holds the camera. Every
 * link is built with a transceiver that can carry video both ways whether or
 * not there is a track to put in it yet, so an offer from an end with no
 * picture is a perfectly good offer - and the ordering presence already gave us
 * settles it in one line. An earlier version made the end with the camera call,
 * which meant the role flipped when somebody pressed a button, which meant the
 * connection had to be torn down and rebuilt to honour the new role. Deciding
 * it by id alone is what makes a camera switch cost nothing.
 */
export function linkRole(
  self: FaceClient,
  peer: FaceClient,
  live: readonly string[],
): FaceRole | null {
  const sending = self.face && live.includes(self.conn)
  const receiving = peer.face && live.includes(peer.conn)

  // Nothing to carry in either direction.
  if (!sending && !receiving) return null

  return self.conn < peer.conn ? 'offer' : 'answer'
}

/**
 * Every connection this client should be holding, given the room.
 *
 * Deliberately a full statement of the desired state rather than a diff. The
 * caller compares it against what it has and closes whatever is not on it,
 * which means a client that misses an event - somebody leaving while the tab
 * was asleep - still converges on the next sync rather than holding a
 * connection to a tab that is gone.
 */
export function wantedLinks(
  self: FaceClient,
  room: readonly FaceClient[],
): WantedLink[] {
  /**
   * Our own row, overwritten with what we actually know.
   *
   * The roster's copy of us has been round trip to the server and back, so for
   * the moment after the switch is pressed it still says the camera is off.
   * Believing it would have us decide we are not sending, tear down the link we
   * just built, and rebuild it when the roster caught up - a blink and a
   * needless renegotiation on every press. We are the authority on our own
   * camera; the roster is the authority on everybody else's.
   */
  const byConn = new Map(freshest(room).map((client) => [client.conn, client]))
  byConn.set(self.conn, self)
  const settled = [...byConn.values()]

  const live = admitted(settled)
  const links: WantedLink[] = []

  for (const peer of settled) {
    if (!peer.conn || peer.conn === self.conn) continue

    const role = linkRole(self, peer, live)
    if (!role) continue

    links.push({
      conn: peer.conn,
      userId: peer.userId,
      role,
      receiving: peer.face && live.includes(peer.conn),
    })
  }

  return links
}

/**
 * The largest SDP or candidate we will look at.
 *
 * An offer from this app is a couple of kilobytes; a candidate is a line. This
 * is not a size we expect to approach - it is a bound on what somebody else on
 * the channel can hand `setRemoteDescription`, which is a parser we did not
 * write, in a process that is drawing everybody's room.
 */
export const MAX_FACE_PAYLOAD = 16 * 1024

/**
 * One message off the channel, or nothing.
 *
 * Everything on a Realtime broadcast is untrusted the same way `wire.ts` treats
 * a data channel frame: it arrives from another browser, and the only thing the
 * policy on the topic guarantees is that its sender is allowed in the room.
 * Being allowed in the room is not the same as being trusted to hand us a
 * well-formed anything.
 */
export function sanitiseFace(payload: unknown): FaceMessage | null {
  if (!payload || typeof payload !== 'object') return null
  const message = payload as Partial<FaceMessage>

  if (typeof message.u !== 'string' || !message.u) return null
  if (typeof message.c !== 'string' || !message.c) return null
  if (typeof message.to !== 'string' || !message.to) return null

  const kind = message.k
  if (
    kind !== 'offer' &&
    kind !== 'answer' &&
    kind !== 'ice' &&
    kind !== 'bye'
  ) {
    return null
  }

  if (kind === 'bye') return { u: message.u, c: message.c, to: message.to, k: kind }

  if (typeof message.d !== 'string' || !message.d) return null
  if (message.d.length > MAX_FACE_PAYLOAD) return null

  return { u: message.u, c: message.c, to: message.to, k: kind, d: message.d }
}
