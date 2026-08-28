/**
 * A WebRTC handshake, small enough to photograph.
 *
 * ---------------------------------------------------------------------------
 * Why this is a packer and not a compressor
 * ---------------------------------------------------------------------------
 * The obvious way to get an SDP into a QR code is to deflate it. That works -
 * a data-channel offer is about 900 bytes of extremely repetitive text and
 * gzip takes it to roughly 400 - and 400 bytes is a version-17 QR, which is a
 * dense grid that a phone camera reads slowly and badly in airport lighting.
 *
 * It is also the wrong observation. Almost none of that 900 bytes is
 * information: `v=0`, the bundle group, the media line, the SCTP port and the
 * message size are identical in every data-channel offer any browser has ever
 * produced. What actually varies is six things - the ICE user fragment and
 * password, the DTLS fingerprint, the setup role, the candidate list, and
 * whether this is an offer or an answer.
 *
 * Packed as bytes, those six come to about a hundred. That is a version-6 QR
 * at medium error correction: big modules, reads instantly, survives a
 * fingerprint on the lens. And the same hundred bytes is a URL fragment short
 * enough to send in a message.
 *
 * The trade is that this only understands SDP that *this app* generates, and
 * would not survive being pointed at an arbitrary peer. That is an acceptable
 * trade precisely because both ends are this app: there is no interop story
 * here to protect, and the day there is, the version nibble at the front is how
 * a reader recognises a payload it cannot read.
 *
 * ---------------------------------------------------------------------------
 * mDNS candidates are the normal case, not an edge case
 * ---------------------------------------------------------------------------
 * Chrome and Safari do not put your local IP in an SDP any more; they put a
 * random `<uuid>.local` and answer the mDNS query for it. So the common
 * candidate is not an address at all, it is a UUID - which is sixteen bytes if
 * it is recognised as one and fifty-two characters if it is not. Recognising it
 * is most of why this fits.
 *
 * It also still works, which is the part worth stating: mDNS resolves within a
 * subnet, and a phone hotspot is one subnet. Two devices on the same hotspot
 * resolve each other's `.local` names without anything on the internet being
 * asked.
 */

/** Bumped when the byte layout changes. Four bits, so fifteen more of these. */
export const WIRE_VERSION = 1

export type Setup = 'actpass' | 'active' | 'passive'

const SETUPS: Setup[] = ['actpass', 'active', 'passive']

/** Where a candidate says it can be reached. */
export type Address =
  /** A dotted-quad. Rare now, but a hotspot subnet hands these out. */
  | { kind: 'ip4'; value: string }
  | { kind: 'ip6'; value: string }
  /** `<uuid>.local`, which is what Chrome and Safari actually emit. */
  | { kind: 'mdns'; value: string }

export interface Candidate {
  address: Address
  port: number
}

export interface Handshake {
  kind: 'offer' | 'answer'
  setup: Setup
  ufrag: string
  pwd: string
  /** The sha-256 DTLS fingerprint, as 32 raw bytes. */
  fingerprint: Uint8Array
  candidates: Candidate[]
}

// ---------------------------------------------------------------------------
// Reading what the browser produced
// ---------------------------------------------------------------------------

/**
 * Pull the six things that matter out of a real SDP.
 *
 * Returns null rather than throwing on anything it does not recognise. A
 * handshake that cannot be packed is a handshake we fall back to sending whole,
 * which is a longer link and a working room - and that is a much better outcome
 * than an exception thrown at the person holding the phone.
 */
export function readSdp(sdp: string, kind: 'offer' | 'answer'): Handshake | null {
  const ufrag = firstMatch(sdp, /^a=ice-ufrag:(.+)$/m)
  const pwd = firstMatch(sdp, /^a=ice-pwd:(.+)$/m)
  const print = firstMatch(sdp, /^a=fingerprint:sha-256 ([0-9A-Fa-f:]+)$/m)
  const setup = firstMatch(sdp, /^a=setup:(actpass|active|passive)$/m) as Setup | null

  if (!ufrag || !pwd || !print || !setup) return null

  const fingerprint = readFingerprint(print)
  if (!fingerprint) return null

  /**
   * Host candidates only.
   *
   * There is no STUN server in this design and no internet assumed, so a srflx
   * or relay candidate cannot exist - and if one somehow did, it would be an
   * address reachable from outside the room, which is not what this is for.
   */
  const candidates: Candidate[] = []
  for (const line of sdp.split(/\r?\n/)) {
    const found = /^a=candidate:\S+ (\d+) (udp|UDP) \d+ (\S+) (\d+) typ host/.exec(line)
    if (!found) continue
    // Component 1 is RTP; a data channel bundles everything onto it, so
    // component 2 would be a duplicate route to the same socket.
    if (found[1] !== '1') continue
    const address = readAddress(found[3])
    const port = Number(found[4])
    if (!address || !Number.isInteger(port) || port < 1 || port > 65535) continue
    if (candidates.some((one) => same(one, address, port))) continue
    candidates.push({ address, port })
  }

  if (candidates.length === 0) return null

  return { kind, setup, ufrag, pwd, fingerprint, candidates }
}

function same(one: Candidate, address: Address, port: number): boolean {
  return one.port === port && one.address.kind === address.kind && one.address.value === address.value
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const found = pattern.exec(text)
  return found ? found[1].trim() : null
}

function readFingerprint(text: string): Uint8Array | null {
  const parts = text.split(':')
  if (parts.length !== 32) return null
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i += 1) {
    if (!/^[0-9A-Fa-f]{2}$/.test(parts[i])) return null
    bytes[i] = Number.parseInt(parts[i], 16)
  }
  return bytes
}

const MDNS = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.local$/i

function readAddress(text: string): Address | null {
  if (MDNS.test(text)) return { kind: 'mdns', value: text.toLowerCase() }
  if (isIp4(text)) return { kind: 'ip4', value: text }
  if (text.includes(':') && ip6Bytes(text)) return { kind: 'ip6', value: text.toLowerCase() }
  return null
}

function isIp4(text: string): boolean {
  const parts = text.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

/**
 * The layout.
 *
 *   0        version (high nibble) | kind (1 bit) | setup (2 bits)
 *   1        ufrag length
 *   ...      ufrag, ASCII
 *   n        pwd length
 *   ...      pwd, ASCII
 *   32       fingerprint
 *   1        candidate count
 *   per candidate:
 *     1      address kind
 *     4/16   the address
 *     2      port, big-endian
 *
 * Lengths are single bytes because ICE credentials are specified at 4..256
 * characters for the fragment and 22..256 for the password, and nothing emits
 * anything near the top of either range.
 */
export function packHandshake(handshake: Handshake): Uint8Array {
  const ufrag = ascii(handshake.ufrag)
  const pwd = ascii(handshake.pwd)

  const out: number[] = []
  out.push(
    (WIRE_VERSION << 4) | ((handshake.kind === 'answer' ? 1 : 0) << 3) | SETUPS.indexOf(handshake.setup),
  )
  out.push(ufrag.length, ...ufrag)
  out.push(pwd.length, ...pwd)
  out.push(...handshake.fingerprint)
  out.push(handshake.candidates.length)

  for (const candidate of handshake.candidates) {
    const { address } = candidate
    if (address.kind === 'ip4') {
      out.push(0, ...address.value.split('.').map(Number))
    } else if (address.kind === 'mdns') {
      out.push(1, ...uuidBytes(address.value.slice(0, 36)))
    } else {
      out.push(2, ...(ip6Bytes(address.value) as Uint8Array))
    }
    out.push((candidate.port >> 8) & 0xff, candidate.port & 0xff)
  }

  return Uint8Array.from(out)
}

export function unpackHandshake(bytes: Uint8Array): Handshake | null {
  try {
    let at = 0
    const take = (n: number): Uint8Array => {
      if (at + n > bytes.length) throw new Error('short')
      const slice = bytes.subarray(at, at + n)
      at += n
      return slice
    }

    const head = take(1)[0]
    if (head >>> 4 !== WIRE_VERSION) return null
    const kind = (head >> 3) & 1 ? 'answer' : 'offer'
    const setup = SETUPS[head & 0b11]
    if (!setup) return null

    const ufrag = text(take(take(1)[0]))
    const pwd = text(take(take(1)[0]))
    const fingerprint = new Uint8Array(take(32))

    const candidates: Candidate[] = []
    const many = take(1)[0]
    for (let i = 0; i < many; i += 1) {
      const shape = take(1)[0]
      let address: Address
      if (shape === 0) {
        address = { kind: 'ip4', value: [...take(4)].join('.') }
      } else if (shape === 1) {
        address = { kind: 'mdns', value: `${uuidText(take(16))}.local` }
      } else if (shape === 2) {
        address = { kind: 'ip6', value: ip6Text(take(16)) }
      } else {
        return null
      }
      const high = take(1)[0]
      const low = take(1)[0]
      candidates.push({ address, port: (high << 8) | low })
    }

    // Trailing bytes mean this is not what it says it is.
    if (at !== bytes.length) return null
    if (candidates.length === 0) return null

    return { kind, setup, ufrag, pwd, fingerprint, candidates }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Writing an SDP back out
// ---------------------------------------------------------------------------

/**
 * The boilerplate, restored.
 *
 * Every line here is either fixed by the data-channel profile or reconstructed
 * from the packed fields. The session id is a constant rather than a random
 * number: it has to be *stable* for a renegotiation to be recognised as one,
 * and there are no renegotiations in this design - one channel, opened once.
 *
 * The candidate foundation and priority are synthesised rather than carried.
 * ICE uses the foundation to group candidates that share a path and the
 * priority to order the checks, and with a handful of host candidates on one
 * subnet both are busywork: any consistent ordering finds the same working pair
 * in the same first round.
 */
export function writeSdp(handshake: Handshake): string {
  const lines = [
    'v=0',
    'o=- 1 1 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=extmap-allow-mixed',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
  ]

  handshake.candidates.forEach((candidate, i) => {
    // Descending, so the order the packer saw is the order ICE tries.
    const priority = 2113937151 - i
    lines.push(
      `a=candidate:${i + 1} 1 udp ${priority} ${candidate.address.value} ${candidate.port} typ host generation 0`,
    )
  })

  lines.push(
    'a=end-of-candidates',
    `a=ice-ufrag:${handshake.ufrag}`,
    `a=ice-pwd:${handshake.pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fingerprintText(handshake.fingerprint)}`,
    `a=setup:${handshake.setup}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  )

  // A trailing newline. Some stacks are forgiving about its absence and some
  // are not, and the ones that are not fail with a parse error that names a
  // line number rather than the missing character.
  return `${lines.join('\r\n')}\r\n`
}

// ---------------------------------------------------------------------------
// The thing that goes in a QR code or a link
// ---------------------------------------------------------------------------

/** Base64url: the alphabet that survives being a URL fragment unescaped. */
export function toCode(bytes: Uint8Array): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined
    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 0b11) << 4) | ((b ?? 0) >> 4)]
    if (b === undefined) break
    out += ALPHABET[((b & 0b1111) << 2) | ((c ?? 0) >> 6)]
    if (c === undefined) break
    out += ALPHABET[c & 0b111111]
  }
  return out
}

export function fromCode(code: string): Uint8Array | null {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const character of code.trim()) {
    const value = ALPHABET.indexOf(character)
    if (value < 0) return null
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return Uint8Array.from(bytes)
}

/** An SDP, all the way down to something you can photograph. */
export function encodeHandshake(sdp: string, kind: 'offer' | 'answer'): string | null {
  const read = readSdp(sdp, kind)
  return read ? toCode(packHandshake(read)) : null
}

/** And back. Null for anything this version cannot read. */
export function decodeHandshake(code: string): { kind: 'offer' | 'answer'; sdp: string } | null {
  const bytes = fromCode(code)
  if (!bytes) return null
  const handshake = unpackHandshake(bytes)
  if (!handshake) return null
  return { kind: handshake.kind, sdp: writeSdp(handshake) }
}

// ---------------------------------------------------------------------------
// Small conversions
// ---------------------------------------------------------------------------

function ascii(text: string): number[] {
  const out: number[] = []
  for (const character of text) {
    const code = character.charCodeAt(0)
    // ICE credentials are specified as ASCII, so anything else is a string this
    // has no business round-tripping.
    if (code > 0x7f) throw new Error('not ascii')
    out.push(code)
  }
  return out
}

function text(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}

function fingerprintText(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':')
}

function uuidBytes(uuid: string): number[] {
  const hex = uuid.replace(/-/g, '')
  const out: number[] = []
  for (let i = 0; i < 32; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16))
  return out
}

function uuidText(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * IPv6, including the `::` run and a trailing dotted-quad.
 *
 * Written out rather than regexed because a link-local address is the one a
 * hotspot is most likely to offer, and `fe80::` is exactly the shape a naive
 * split gets wrong.
 */
function ip6Bytes(address: string): Uint8Array | null {
  // A zone index (`%en0`) is a local label, meaningless to the other machine.
  const bare = address.split('%')[0]
  const halves = bare.split('::')
  if (halves.length > 2) return null

  const parse = (part: string): number[] | null => {
    if (part === '') return []
    const out: number[] = []
    for (const group of part.split(':')) {
      if (isIp4(group)) {
        out.push(...group.split('.').map(Number))
        continue
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
      const value = Number.parseInt(group, 16)
      out.push((value >> 8) & 0xff, value & 0xff)
    }
    return out
  }

  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  if (head === null || tail === null) return null

  if (halves.length === 1) {
    return head.length === 16 ? Uint8Array.from(head) : null
  }

  const gap = 16 - head.length - tail.length
  if (gap < 0) return null
  return Uint8Array.from([...head, ...new Array(gap).fill(0), ...tail])
}

function ip6Text(bytes: Uint8Array): string {
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16))

  /**
   * The longest run of zeroes becomes `::`, which is what every stack emits and
   * therefore what a comparison against one will expect.
   */
  let bestAt = -1
  let bestRun = 0
  let runAt = -1
  let run = 0
  for (let i = 0; i <= groups.length; i += 1) {
    if (i < groups.length && groups[i] === '0') {
      if (runAt < 0) runAt = i
      run += 1
    } else {
      if (run > bestRun) {
        bestRun = run
        bestAt = runAt
      }
      runAt = -1
      run = 0
    }
  }

  if (bestRun < 2) return groups.join(':')
  return `${groups.slice(0, bestAt).join(':')}::${groups.slice(bestAt + bestRun).join(':')}`
}
