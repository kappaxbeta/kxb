'use client'

import { decodeHandshake, encodeHandshake } from '@/domain/nearby/sdp'

/**
 * One WebRTC connection, opened by photograph.
 *
 * ---------------------------------------------------------------------------
 * No signalling server, and therefore no trickle
 * ---------------------------------------------------------------------------
 * Trickle ICE exists because signalling is usually a socket: you send the offer
 * immediately and dribble candidates down the same pipe as they are found,
 * which shaves a second off the connection.
 *
 * There is no pipe here. The offer is a QR code on a screen, and it can only be
 * shown once - so everything the other side needs has to be *in* it. That means
 * waiting for gathering to finish before showing anything, which is the one
 * place this design pays for having no server. On a local network it is fast:
 * host candidates are found by asking the OS for its interfaces, with nothing
 * to time out against.
 *
 * ---------------------------------------------------------------------------
 * No STUN either, and that is not an oversight
 * ---------------------------------------------------------------------------
 * `iceServers: []`. A STUN server is how a peer discovers its public address,
 * which is exactly the thing this design has no use for: both ends are on one
 * hotspot, the only useful candidates are host candidates, and asking Google
 * for a reflexive address would be a request to the internet from a feature
 * whose whole claim is that it does not need one.
 *
 * It also keeps the handshake small enough to photograph - a srflx candidate is
 * another line in the QR code for a route that cannot work here anyway.
 */

/** Past this, gathering is not going to finish and what we have is what we get. */
const GATHER_TIMEOUT_MS = 3000

export interface PeerLink {
  connection: RTCPeerConnection
  /** Open once the other side answers. Everything rides this. */
  channel: RTCDataChannel
  /** The packed handshake, for a QR code or a link. */
  code: string
  close(): void
}

/**
 * Wait until ICE has found everything it is going to find.
 *
 * Resolves early on `complete`, and on a timer otherwise. The timer is not
 * belt-and-braces: a machine with a virtual interface that never answers can
 * leave gathering pending indefinitely, and a QR code that never appears is a
 * worse failure than one built from the candidates we already had.
 */
function gathered(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      connection.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    const check = () => {
      if (connection.iceGatheringState === 'complete') done()
    }
    const timer = setTimeout(done, GATHER_TIMEOUT_MS)
    connection.addEventListener('icegatheringstatechange', check)
  })
}

function fresh(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [] })
}

/**
 * Pack a local description, or fall back to sending it whole.
 *
 * The packer only understands SDP of the shape this app produces (see
 * `@/domain/nearby/sdp`). If a browser ever hands us something it does not
 * recognise, a long link still works and a QR code will not - which is the
 * right way round, because the link is the fallback path anyway.
 */
function pack(sdp: string, kind: 'offer' | 'answer'): string {
  const packed = encodeHandshake(sdp, kind)
  if (packed) return packed
  // `~` cannot appear in base64url, so it is an unambiguous marker for "this is
  // the raw thing, not a packed one".
  return `~${btoa(sdp).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

function unpack(code: string): { kind: 'offer' | 'answer'; sdp: string } | null {
  const trimmed = code.trim()
  if (trimmed.startsWith('~')) {
    try {
      const base64 = trimmed.slice(1).replace(/-/g, '+').replace(/_/g, '/')
      const sdp = atob(base64)
      // The raw form does not carry which it is, so it is read off the SDP.
      return { kind: /a=setup:active/.test(sdp) ? 'answer' : 'offer', sdp }
    } catch {
      return null
    }
  }
  return decodeHandshake(trimmed)
}

/**
 * Start a connection: create the channel, gather, and hand back a code to show.
 *
 * The data channel is created *before* the offer, and that ordering is load
 * bearing - an offer built with no channel on the connection has no
 * `m=application` line, so the answer has nothing to agree to and the channel
 * never opens.
 */
export async function offerLink(label: string): Promise<PeerLink> {
  const connection = fresh()

  const channel = connection.createDataChannel(label, {
    /**
     * Ordered and reliable, which is not the obvious choice for positions.
     *
     * An unreliable channel would suit movement better - a dropped sample is
     * replaced by the next one 80ms later, and retransmitting where somebody
     * *was* is worse than useless. But this one channel also carries the
     * roster, and a roster update that goes missing is somebody invisible for
     * the rest of the session. One reliable channel is the honest trade until
     * there is a reason for two.
     */
    ordered: true,
  })

  await connection.setLocalDescription(await connection.createOffer())
  await gathered(connection)

  return {
    connection,
    channel,
    code: pack(connection.localDescription!.sdp, 'offer'),
    close: () => connection.close(),
  }
}

/** Finish the connection with what the other side photographed back. */
export async function acceptAnswer(link: PeerLink, code: string): Promise<boolean> {
  const read = unpack(code)
  if (!read || read.kind !== 'answer') return false
  try {
    await link.connection.setRemoteDescription({ type: 'answer', sdp: read.sdp })
    return true
  } catch {
    // A code from a different session, or one that was scanned twice. Neither
    // is worth an exception reaching the person holding the phone.
    return false
  }
}

/**
 * The other side: take an offer, produce an answer to show back.
 *
 * The channel arrives rather than being created - it is the offerer's channel,
 * surfaced here by `ondatachannel` once the connection is up.
 */
export async function answerLink(
  offerCode: string,
): Promise<(PeerLink & { channelReady: Promise<RTCDataChannel> }) | null> {
  const read = unpack(offerCode)
  if (!read || read.kind !== 'offer') return null

  const connection = fresh()

  /**
   * Hooked up before the remote description is set.
   *
   * `ondatachannel` can fire as soon as the connection comes up, which on a
   * local network is quick enough to beat an assignment made afterwards - and a
   * channel nobody was listening for is a room that connects and stays silent.
   */
  let handOver: (channel: RTCDataChannel) => void = () => {}
  const channelReady = new Promise<RTCDataChannel>((resolve) => {
    handOver = resolve
  })
  connection.ondatachannel = (event) => handOver(event.channel)

  try {
    await connection.setRemoteDescription({ type: 'offer', sdp: read.sdp })
    await connection.setLocalDescription(await connection.createAnswer())
  } catch {
    connection.close()
    return null
  }

  await gathered(connection)

  return {
    connection,
    // Not open yet; callers wait on `channelReady`. Present so the shape
    // matches, and never written to before it resolves.
    channel: null as unknown as RTCDataChannel,
    channelReady,
    code: pack(connection.localDescription!.sdp, 'answer'),
    close: () => connection.close(),
  }
}
