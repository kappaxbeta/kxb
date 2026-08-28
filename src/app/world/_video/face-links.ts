'use client'

import {
  type FaceClient,
  type FaceMessage,
  sanitiseFace,
  wantedLinks,
} from '@/domain/world/faces'

/**
 * The connections themselves, driven by the roster.
 *
 * `@/domain/world/faces` decides which links should exist; this holds them. The
 * split is worth naming because it is what makes the hard half testable: the
 * decisions - who calls whom, what forces a rebuild, what a cap admits - are
 * arithmetic over a list, and everything left in here is `RTCPeerConnection`
 * bookkeeping that only a browser can run.
 *
 * ---------------------------------------------------------------------------
 * A camera switch is not a renegotiation, and not a rebuild either
 * ---------------------------------------------------------------------------
 * Every connection is built with one video transceiver, `sendrecv`, whether or
 * not there is a camera to put in it. Switching a camera on then swaps a track
 * into the sender that is already there - `replaceTrack`, which needs no new
 * offer as long as the kind matches what was negotiated.
 *
 * That single decision removes two problems at once, which is why it is worth
 * naming. It removes renegotiation, and with it the glare that perfect
 * negotiation exists to resolve: no second offer is ever sent, so there is
 * never one in flight to collide with. And it removes the *rebuild* an earlier
 * version needed - when the offering end was whichever end held the camera, a
 * button press flipped the role, and honouring the new role meant throwing the
 * connection away. Everybody in the room saw a second of black because one
 * person pressed a button.
 *
 * So the role is decided by connection id alone and never changes, and the
 * tracks move underneath it.
 *
 * ---------------------------------------------------------------------------
 * The watchdog is the error handling
 * ---------------------------------------------------------------------------
 * There is no retry around an individual message. Signalling rides a broadcast
 * channel, so an offer can be lost, and a lost offer is a connection that never
 * forms - but so is a failed ICE negotiation, a peer that reloaded between the
 * offer and the answer, and a candidate pair that worked until somebody moved
 * onto another network. One timer that notices "this link is not carrying
 * anything and should be" answers all of them; four separate retries would
 * answer one each and still miss the fourth.
 */

/** How long a link is given to come up before it is thrown away and retried. */
const PATIENCE_MS = 12_000

/** How often the timer looks. */
const WATCH_MS = 4_000

interface Link {
  conn: string
  userId: string
  role: 'offer' | 'answer'
  /**
   * The sender our camera goes into, held from construction.
   *
   * There from the first frame of the connection's life whether or not we have
   * a camera, because a sender that exists is one `replaceTrack` away from
   * carrying a picture and a sender that does not is a renegotiation away.
   */
  sender: RTCRtpSender
  /**
   * And the one our microphone goes into, on the same terms.
   *
   * Negotiated from construction like the video one, so switching a mic on is
   * a track swap rather than a second offer - and so push-to-talk, which is a
   * flag on an already-negotiated track, costs nothing at all per press.
   */
  voiceSender: RTCRtpSender
  pc: RTCPeerConnection
  /** When this attempt started, for the watchdog. */
  since: number
  /**
   * Candidates that arrived before there was a description to attach them to.
   *
   * Trickle means the far end starts sending candidates the moment it has any,
   * and on a fast local network that is reliably *before* its own offer has
   * been applied here. `addIceCandidate` before `setRemoteDescription` throws,
   * so they wait here instead of being dropped - dropping them is how a pair
   * that had a perfectly good route ends up with none.
   */
  waiting: RTCIceCandidateInit[]
  /** Whether the remote description has landed, which is what unblocks the above. */
  described: boolean
}

export interface FaceLinks {
  /** The room changed, or our own camera did. Bring the connections into line. */
  reconcile(room: readonly FaceClient[]): void
  /**
   * Our own camera changed. Put it into every link we hold, or take it out.
   *
   * Separate from `reconcile` because it is a different question with a
   * different answer: reconcile decides which connections should *exist*, and
   * this decides what is travelling over the ones that already do. Switching a
   * camera on changes only the second, which is the entire point.
   */
  retrack(): void
  /** One signalling message off the channel. Untrusted. */
  accept(payload: unknown): void
  /** Everything down, and the far ends told. */
  close(): void
}

export function openFaceLinks({
  self,
  stream,
  voice,
  ice,
  send,
  onStream,
  onVoice,
}: {
  /** Who we are right now, camera included. Read fresh - the camera flips. */
  self: () => FaceClient
  /** Our own picture, or null. Read at the moment a link is built. */
  stream: () => MediaStream | null
  /**
   * Our own microphone, or null.
   *
   * Whether it is *live* is not this module's business - the track is handed
   * over open or muted and `setMicLive` flips it in place. Push-to-talk must
   * not be a thing the network layer knows about, or every press would be a
   * renegotiation.
   */
  voice: () => MediaStream | null
  /**
   * Where to gather candidates, read per connection rather than held.
   *
   * A getter because relay credentials expire and are replaced - see
   * `@/domain/world/turn`. A link built an hour into a session has to be built
   * against the set that is current *then*, and a value captured when this was
   * opened would be the set that was current when somebody walked in.
   *
   * Empty is a working configuration, not a missing one: host candidates alone
   * connect two people on one network, and two people who both have IPv6.
   */
  ice: () => RTCIceServer[]
  send: (message: FaceMessage) => void
  /** A picture arrived for somebody, or theirs went away. */
  onStream: (userId: string, stream: MediaStream | null) => void
  /** A voice arrived for somebody, or theirs went away. */
  onVoice: (userId: string, stream: MediaStream | null) => void
}): FaceLinks {
  const links = new Map<string, Link>()

  /**
   * Which connection a person's picture is currently coming from.
   *
   * Needed because pictures are filed under a *person* and connections are per
   * tab. Without it, somebody's second tab disconnecting would take down the
   * picture their first tab is still sending.
   */
  const showing = new Map<string, string>()

  /** The last roster we were given, so the watchdog can reconcile against it. */
  let room: readonly FaceClient[] = []
  let closed = false

  function now(): number {
    return performance.now()
  }

  function drop(link: Link, tell: boolean): void {
    links.delete(link.conn)

    // Silence the handlers before closing: a connection being torn down still
    // fires `oniceconnectionstatechange`, and a handler that reconciles on the
    // way down would reopen the link we are in the middle of closing.
    link.pc.onicecandidate = null
    link.pc.ontrack = null
    link.pc.onconnectionstatechange = null
    try {
      link.pc.close()
    } catch {
      // A connection that is already gone is the state we wanted anyway.
    }

    if (showing.get(link.userId) === link.conn) {
      showing.delete(link.userId)
      onStream(link.userId, null)
    }
    // Voice goes with the connection unconditionally, unlike the picture: a
    // muted track still arrives, so there is no "are they sending" to track,
    // and a voice left in the store after its connection closed is a speaker
    // standing where nobody is.
    onVoice(link.userId, null)

    if (tell) {
      const me = self()
      send({ u: me.userId, c: me.conn, to: link.conn, k: 'bye' })
    }
  }

  function open(want: { conn: string; userId: string; role: 'offer' | 'answer' }): Link {
    const pc = new RTCPeerConnection({ iceServers: ice() })

    /**
     * One video transceiver, both ways, made before anything is negotiated.
     *
     * `addTransceiver` rather than `addTrack`, and unconditionally rather than
     * only when we have a camera. That is the whole trick: the m-line is
     * negotiated as `sendrecv` once, so a track can be dropped into it later
     * without a second offer - and an offer from an end holding no camera is
     * still an offer the other end can answer with one.
     */
    const transceiver = pc.addTransceiver('video', { direction: 'sendrecv' })

    /**
     * And one for voice, in this order, on every connection.
     *
     * The order is load-bearing: m-lines are matched by position, so both ends
     * must add them the same way round or one end's camera arrives in the
     * other end's speaker. Both ends run this same function, which is what
     * makes that true rather than a convention somebody has to remember.
     */
    const voiceTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' })

    const link: Link = {
      ...want,
      pc,
      sender: transceiver.sender,
      voiceSender: voiceTransceiver.sender,
      since: now(),
      waiting: [],
      described: false,
    }
    links.set(want.conn, link)

    // Our own picture, if there is one to put in yet. If there is not, this is
    // exactly what happens again when the switch is pressed.
    void carry(link)

    pc.onicecandidate = ({ candidate }) => {
      // A null candidate is "that is all of them", which needs no message: the
      // far end is not waiting for an end-of-candidates marker to try the ones
      // it has.
      if (!candidate) return
      const me = self()
      send({
        u: me.userId,
        c: me.conn,
        to: want.conn,
        k: 'ice',
        d: JSON.stringify(candidate.toJSON()),
      })
    }

    /**
     * A track arriving, and the stream it is *not* wrapped in.
     *
     * `addTrack(track, stream)` puts an msid on the wire and the far end gets
     * `event.streams[0]` for free. `addTransceiver` + `replaceTrack` does not:
     * nothing associates the sender with a stream, so there is no msid, so
     * `event.streams` arrives empty - and a handler that reads `[0]` and
     * returns when it is missing is a handler that never draws a face.
     *
     * That is exactly what happened when the transceiver went in, and it is
     * worth the note because the failure is silent and total: signalling
     * completes, ICE connects, the connection reports `connected`, and no
     * picture ever appears.
     *
     * Wrapping the track here rather than calling `setStreams` on the sender,
     * because the receiving end is where the distinction stops mattering - a
     * stream of one track is what every consumer of this wants anyway.
     */
    pc.ontrack = (event) => {
      const arrived = event.streams[0] ?? new MediaStream([event.track])
      if (event.track.kind === 'audio') {
        onVoice(want.userId, arrived)
        return
      }
      showing.set(want.userId, want.conn)
      onStream(want.userId, arrived)
    }

    pc.onconnectionstatechange = () => {
      if (closed) return
      if (pc.connectionState === 'failed') {
        // Not a `bye`: the far end already knows this connection failed, and a
        // goodbye would ask it to close the link it is about to rebuild.
        drop(link, false)
        reconcile(room)
      }
    }

    if (want.role === 'offer') void offer(link)

    return link
  }

  async function offer(link: Link): Promise<void> {
    try {
      const description = await link.pc.createOffer()
      await link.pc.setLocalDescription(description)
      if (closed || links.get(link.conn) !== link) return

      const me = self()
      send({
        u: me.userId,
        c: me.conn,
        to: link.conn,
        k: 'offer',
        d: JSON.stringify(link.pc.localDescription),
      })
    } catch {
      // Left for the watchdog. A failure here is a connection that never comes
      // up, which is exactly the state the timer is looking for.
    }
  }

  async function answer(link: Link, sdp: string): Promise<void> {
    try {
      await link.pc.setRemoteDescription(JSON.parse(sdp) as RTCSessionDescriptionInit)
      if (closed || links.get(link.conn) !== link) return
      flush(link)

      const description = await link.pc.createAnswer()
      await link.pc.setLocalDescription(description)
      if (closed || links.get(link.conn) !== link) return

      const me = self()
      send({
        u: me.userId,
        c: me.conn,
        to: link.conn,
        k: 'answer',
        d: JSON.stringify(link.pc.localDescription),
      })
    } catch {
      // As above: the watchdog is the retry.
    }
  }

  /** Candidates that arrived early, now that there is somewhere to put them. */
  function flush(link: Link): void {
    link.described = true
    const held = link.waiting
    link.waiting = []
    for (const candidate of held) {
      void link.pc.addIceCandidate(candidate).catch(() => {
        // One unusable candidate is not a failed connection. ICE tries every
        // pair it has; this one simply is not one of them.
      })
    }
  }

  /**
   * Put our current camera into a link's sender, or take it back out.
   *
   * `replaceTrack` rather than `addTrack`/`removeTrack`: the first needs no
   * renegotiation and the other two do. Null is a real argument here - it is
   * what a camera being switched off looks like on the wire.
   */
  async function carry(link: Link): Promise<void> {
    const mine = stream()
    const mineVoice = voice()
    try {
      await link.sender.replaceTrack(mine?.getVideoTracks()[0] ?? null)
      await link.voiceSender.replaceTrack(mineVoice?.getAudioTracks()[0] ?? null)
    } catch {
      // A sender on a connection that is closing. Nothing to carry, and the
      // reconcile that closed it has already forgotten this link.
    }
  }

  function reconcile(next: readonly FaceClient[]): void {
    if (closed) return
    room = next

    const me = self()
    const want = wantedLinks(me, next)
    const wanted = new Map(want.map((link) => [link.conn, link]))

    for (const link of [...links.values()]) {
      const still = wanted.get(link.conn)
      // Gone from the room, or from the cap. Nothing else closes a link any
      // more - a camera switching at either end is a track swap, not a
      // teardown. See the header.
      if (!still) {
        drop(link, true)
        continue
      }

      /**
       * They stopped sending, so take their face down.
       *
       * The connection stays up - they may switch on again in a moment, and
       * rebuilding it for that would be the blink this design exists to avoid.
       * But their video element stops receiving frames rather than being told
       * anything, so it holds its last one; without this, a camera switched off
       * reads as somebody sitting very still.
       */
      if (!still.receiving && showing.get(link.userId) === link.conn) {
        showing.delete(link.userId)
        onStream(link.userId, null)
      }
    }

    for (const link of want) {
      if (links.has(link.conn)) continue
      // Only one end dials. The other builds its connection when the offer
      // lands, which is also what makes it robust to the two ends learning
      // about each other a moment apart.
      if (link.role === 'answer') continue
      open(link)
    }
  }

  function accept(payload: unknown): void {
    if (closed) return

    const message = sanitiseFace(payload)
    if (!message) return

    const me = self()
    // Everybody on the channel hears this; only the addressee acts on it. The
    // same arrangement as `hit` and `push`, and for the same reason: Realtime
    // has no private lane, and a channel per pair would be a channel per pair.
    if (message.to !== me.conn) return
    if (message.c === me.conn) return

    if (message.k === 'bye') {
      const link = links.get(message.c)
      if (link) drop(link, false)
      // Straight back into the roster's answer. Usually this is the far end
      // rebuilding because its camera changed, and it is about to call us.
      reconcile(room)
      return
    }

    let link = links.get(message.c)

    if (message.k === 'offer') {
      /**
       * An offer from somebody we have no link to yet.
       *
       * Not an error, and common: presence reaches the two of us at slightly
       * different moments, so the end that learns first dials before the other
       * has reconciled. Building the link here rather than dropping the offer
       * is what stops that race from costing a full watchdog cycle every time
       * somebody switches a camera on.
       */
      if (!link) {
        const wanted = wantedLinks(me, room).find(
          (candidate) => candidate.conn === message.c,
        )
        // Nothing on our roster says this pair should exist. Either their
        // presence has not reached us at all, or the cap turned them away.
        if (!wanted || wanted.role !== 'answer') return
        link = open(wanted)
      }

      if (link.role !== 'answer') return
      if (!message.d) return
      void answer(link, message.d)
      return
    }

    if (!link) return

    if (message.k === 'answer') {
      if (link.role !== 'offer' || link.described || !message.d) return
      void link.pc
        .setRemoteDescription(JSON.parse(message.d) as RTCSessionDescriptionInit)
        .then(() => {
          if (links.get(link.conn) === link) flush(link)
        })
        .catch(() => {
          // Watchdog.
        })
      return
    }

    // A candidate.
    if (!message.d) return
    let candidate: RTCIceCandidateInit
    try {
      candidate = JSON.parse(message.d) as RTCIceCandidateInit
    } catch {
      return
    }

    if (!link.described) {
      // Bounded, so a peer cannot make us hold an unlimited number of them by
      // sending candidates for a description it never sends.
      if (link.waiting.length < 64) link.waiting.push(candidate)
      return
    }

    void link.pc.addIceCandidate(candidate).catch(() => {})
  }

  const watching = setInterval(() => {
    if (closed) return

    let rebuild = false
    for (const link of [...links.values()]) {
      const state = link.pc.connectionState
      if (state === 'connected') continue
      if (now() - link.since < PATIENCE_MS) continue

      // Long enough. Whatever went wrong - a lost offer, a route that never
      // worked, a peer that reloaded - the answer is the same one.
      drop(link, true)
      rebuild = true
    }

    if (rebuild) reconcile(room)
  }, WATCH_MS)

  return {
    reconcile,
    retrack() {
      for (const link of links.values()) void carry(link)
    },
    accept,
    close() {
      closed = true
      clearInterval(watching)
      for (const link of [...links.values()]) drop(link, true)
    },
  }
}
