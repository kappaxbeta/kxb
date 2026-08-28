/**
 * Getting through a NAT, and paying for it.
 *
 * `@/domain/world/faces` decides which pairs should be connected. This is about
 * whether they *can* be - which on the open internet is a different question,
 * and the one the prototype deliberately left unanswered.
 *
 * ---------------------------------------------------------------------------
 * Three tiers, and only the last one costs anything
 * ---------------------------------------------------------------------------
 * A candidate is an address a peer might be reachable at, and ICE tries every
 * pair of them until one works.
 *
 *   - **host** - the address the machine thinks it has. Enough on one network,
 *     and enough between two IPv6 machines, where the address is already
 *     globally routable. Costs nothing and needs no server.
 *   - **srflx** - the address the world sees you at, learned by asking a STUN
 *     server. This is what gets two ordinary home connections talking, and STUN
 *     is a single request-response: a box serving it carries no media and
 *     barely notices.
 *   - **relay** - a TURN server forwarding the media itself, for the pairs that
 *     cannot reach each other at all: symmetric NAT, carrier-grade NAT, a
 *     corporate network that drops UDP. Every byte of every relayed stream goes
 *     through it twice, in and out, which is the entire reason this is the last
 *     resort rather than the default.
 *
 * IPv6 is worth naming here because it changes the shape rather than the
 * numbers: with a globally routable address on both ends there is nothing for
 * STUN to reflect, so the host candidate *is* the answer. It does not remove
 * the need for a relay - one IPv4-only end collapses the pair back - but it
 * decides how often the relay is reached for, and the relay is the only part
 * with a bill attached.
 *
 * ---------------------------------------------------------------------------
 * Why the credentials are minted rather than configured
 * ---------------------------------------------------------------------------
 * A TURN server that anybody may use is a bandwidth account anybody may spend.
 * So the credential cannot be a constant in the bundle - and specifically not a
 * `NEXT_PUBLIC_` one, which is not a naming convention but an instruction to
 * inline the value into the JavaScript sent to every visitor.
 *
 * coturn's answer, which this implements, is to derive the password from a
 * shared secret and an expiry: the username *is* the expiry, the password is
 * its HMAC, and the server checks both without storing anything per user. A
 * leaked credential is then worth an hour rather than forever, and revoking
 * every credential at once is one secret rotation.
 *
 * The signing itself is not here - see `signTurn` in the route. What is here is
 * everything that can be decided without a key, which is the part worth testing.
 */

/** The schemes a browser will actually dial. */
const SCHEMES = ['stun:', 'stuns:', 'turn:', 'turns:']

/**
 * How long a minted credential is good for.
 *
 * An hour. Long enough that nobody is refreshing mid-conversation, short enough
 * that one scraped from a browser's network tab is worth very little. The
 * client refreshes well before this - see `FRESHEN_AFTER_MS`.
 */
export const TURN_TTL_SECONDS = 3600

/**
 * When the client goes back for another set.
 *
 * Comfortably inside the hour above, because the failure it prevents is not
 * "the credential expired" - it is "the credential expired *between* the roster
 * saying connect and the connection being built", which is a link that fails
 * for a reason no log makes obvious.
 */
export const FRESHEN_AFTER_MS = 45 * 60 * 1000

/**
 * The servers, as configured.
 *
 * A comma-separated list, because it is set as one environment variable on a
 * box and a list of URLs is what `RTCPeerConnection` wants. Anything that is
 * not a URL a browser would dial is dropped rather than passed on: an
 * `RTCPeerConnection` constructed with a malformed ICE server throws, and it
 * would throw for every person in the room.
 */
export function turnUrls(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((one) => one.trim())
    .filter((one) => SCHEMES.some((scheme) => one.startsWith(scheme)))
}

/**
 * The username, which is also the expiry.
 *
 * coturn parses the part before the colon as a unix timestamp and refuses the
 * credential once it is in the past - so the deadline travels in the clear, as
 * part of the thing it bounds, and there is no table of issued credentials to
 * keep or to clean up.
 *
 * The user id is only along for the ride. coturn ignores it; a log of who was
 * relaying at the time does not.
 */
export function turnUsername(userId: string, expiresAt: number): string {
  return `${Math.floor(expiresAt)}:${userId}`
}

/** When a credential minted now should stop working. */
export function turnExpiry(now: number, ttl = TURN_TTL_SECONDS): number {
  return Math.floor(now / 1000) + ttl
}

/**
 * The list handed to the browser.
 *
 * STUN URLs are separated from the rest and left unauthenticated, because they
 * are: a STUN binding request has no credential, and attaching one is at best
 * ignored. Only the `turn:`/`turns:` entries carry the minted pair.
 */
export function iceServers(
  urls: readonly string[],
  credential?: { username: string; credential: string },
): RTCIceServer[] {
  const stun = urls.filter((one) => one.startsWith('stun'))
  const turn = urls.filter((one) => one.startsWith('turn'))

  const servers:   RTCIceServer[] = []
  if (stun.length > 0) servers.push({ urls: stun })
  if (turn.length > 0 && credential) {
    servers.push({
      urls: turn,
      username: credential.username,
      credential: credential.credential,
    })
  }

  return servers
}
