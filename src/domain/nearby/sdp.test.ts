import { describe, expect, test } from 'bun:test'
import {
  decodeHandshake,
  encodeHandshake,
  fromCode,
  packHandshake,
  readSdp,
  toCode,
  unpackHandshake,
} from './sdp'

/**
 * The handshake, checked without two phones.
 *
 * Everything here is a string a browser actually produced, or a close copy of
 * one. The property that matters is not that the bytes round-trip - that is
 * easy - but that what comes *out* is an SDP a peer connection will accept,
 * which means every field a stack looks at has to survive being thrown away and
 * rebuilt from a template.
 */

/** Chrome, data channel only, mDNS candidates. The common case. */
const CHROME_OFFER = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:2999745851 1 udp 2113937151 4f1a8c2e-9b3d-4a5f-8e7c-1d2b3a4c5d6e.local 54321 typ host generation 0 network-cost 999',
  'a=candidate:1854506785 1 udp 2113939711 172.20.10.3 54322 typ host generation 0 network-cost 999',
  'a=ice-ufrag:AbC1',
  'a=ice-pwd:2Kj9vQm3xR7pL0sT4wY8nZ1e',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 7B:8C:1D:2E:3F:40:51:62:73:84:95:A6:B7:C8:D9:EA:FB:0C:1D:2E:3F:40:51:62:73:84:95:A6:B7:C8:D9:EA',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
].join('\r\n')

/** Firefox, answering, with a link-local v6 candidate and a longer ufrag. */
const FIREFOX_ANSWER = [
  'v=0',
  'o=mozilla...THIS_IS_SDPARTA-99.0 8168903 0 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:0 1 UDP 2122252543 fe80::14ab:33ff:fe12:3456 49203 typ host',
  'a=ice-ufrag:8d4f2a1b',
  'a=ice-pwd:c7e91f3b5a2d8046e1f7c3b9a5d20418',
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
  'a=setup:active',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:1073741823',
].join('\r\n')

describe('reading an SDP', () => {
  test('takes the six things that vary and ignores the boilerplate', () => {
    const read = readSdp(CHROME_OFFER, 'offer')
    expect(read).not.toBeNull()
    expect(read!.ufrag).toBe('AbC1')
    expect(read!.pwd).toBe('2Kj9vQm3xR7pL0sT4wY8nZ1e')
    expect(read!.setup).toBe('actpass')
    expect(read!.fingerprint).toHaveLength(32)
    expect(read!.fingerprint[0]).toBe(0x7b)
    expect(read!.candidates).toHaveLength(2)
    // The mDNS name is recognised as a UUID rather than kept as a string, which
    // is most of the reason the payload fits in a small QR code.
    expect(read!.candidates[0].address.kind).toBe('mdns')
    expect(read!.candidates[1].address).toEqual({ kind: 'ip4', value: '172.20.10.3' })
    expect(read!.candidates[1].port).toBe(54322)
  })

  test('reads an uppercase UDP and a v6 link-local', () => {
    // Firefox writes `UDP`, Chrome writes `udp`. A parser that only knew one
    // would work on the machine it was written on.
    const read = readSdp(FIREFOX_ANSWER, 'answer')
    expect(read).not.toBeNull()
    expect(read!.candidates).toHaveLength(1)
    expect(read!.candidates[0].address).toEqual({
      kind: 'ip6',
      value: 'fe80::14ab:33ff:fe12:3456',
    })
  })

  test('refuses what it cannot pack rather than guessing', () => {
    // No candidates at all - a handshake that names nowhere to connect.
    expect(readSdp(CHROME_OFFER.replace(/^a=candidate:.*$/gm, ''), 'offer')).toBeNull()
    // No fingerprint - a handshake DTLS would refuse anyway.
    expect(readSdp(CHROME_OFFER.replace(/^a=fingerprint:.*$/m, ''), 'offer')).toBeNull()
    expect(readSdp('not an sdp at all', 'offer')).toBeNull()
    // A relay candidate is not a thing this design can produce, and quietly
    // keeping one would be putting a route out of the room into the QR code.
    const relayed = CHROME_OFFER.replace(/typ host/g, 'typ relay')
    expect(readSdp(relayed, 'offer')).toBeNull()
  })
})

describe('the packed bytes', () => {
  test('round-trip every field', () => {
    for (const [sdp, kind] of [
      [CHROME_OFFER, 'offer'],
      [FIREFOX_ANSWER, 'answer'],
    ] as const) {
      const read = readSdp(sdp, kind)!
      const back = unpackHandshake(packHandshake(read))
      expect(back).toEqual(read)
    }
  })

  test('fit in a QR code somebody can actually scan', () => {
    const code = encodeHandshake(CHROME_OFFER, 'offer')!
    // A version-6 QR at medium correction holds 134 bytes. The whole argument
    // for packing rather than compressing is landing under that, because a
    // dense grid is the thing a phone camera fails on in bad light.
    expect(code.length).toBeLessThanOrEqual(134)
    // And a URL fragment nobody minds pasting.
    expect(code.length).toBeLessThan(200)
  })

  test('refuse a payload from a version they do not know', () => {
    const bytes = packHandshake(readSdp(CHROME_OFFER, 'offer')!)
    const future = Uint8Array.from(bytes)
    future[0] = (15 << 4) | (future[0] & 0b1111)
    // Null rather than a misparse: the version nibble exists so that a payload
    // from a newer build is refused with a message instead of producing an SDP
    // made of the wrong bytes.
    expect(unpackHandshake(future)).toBeNull()
  })

  test('refuse a truncated or padded payload', () => {
    const bytes = packHandshake(readSdp(CHROME_OFFER, 'offer')!)
    expect(unpackHandshake(bytes.subarray(0, bytes.length - 3))).toBeNull()
    expect(unpackHandshake(Uint8Array.from([...bytes, 0, 0]))).toBeNull()
  })
})

describe('base64url', () => {
  test('round-trips every length, so no padding case is missed', () => {
    // The three-byte group is where a hand-written encoder goes wrong, and it
    // goes wrong only on inputs whose length is not a multiple of three.
    for (let length = 0; length < 40; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff)
      expect([...fromCode(toCode(bytes))!]).toEqual([...bytes])
    }
  })

  test('is URL-safe, so a fragment survives being sent as a link', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    expect(toCode(bytes)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('rejects a code somebody mistyped', () => {
    expect(fromCode('not valid base64!!')).toBeNull()
  })
})

describe('writing an SDP back out', () => {
  test('produces every line a data channel needs', () => {
    const { sdp } = decodeHandshake(encodeHandshake(CHROME_OFFER, 'offer')!)!

    for (const required of [
      'v=0',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'a=ice-ufrag:AbC1',
      'a=ice-pwd:2Kj9vQm3xR7pL0sT4wY8nZ1e',
      'a=setup:actpass',
      'a=mid:0',
      'a=sctp-port:5000',
    ]) {
      expect(sdp).toContain(required)
    }

    // CRLF, which is what the grammar says and what the strict parsers want.
    expect(sdp.endsWith('\r\n')).toBe(true)
    expect(sdp).not.toContain('\n\n')
  })

  test('keeps the fingerprint byte for byte', () => {
    // The one field where a single wrong character means the DTLS handshake
    // fails at the very end, after everything else looked like it worked.
    const { sdp } = decodeHandshake(encodeHandshake(CHROME_OFFER, 'offer')!)!
    expect(sdp).toContain(
      'a=fingerprint:sha-256 7B:8C:1D:2E:3F:40:51:62:73:84:95:A6:B7:C8:D9:EA:FB:0C:1D:2E:3F:40:51:62:73:84:95:A6:B7:C8:D9:EA',
    )
  })

  test('keeps both candidates, in the order they were offered', () => {
    const { sdp } = decodeHandshake(encodeHandshake(CHROME_OFFER, 'offer')!)!
    const at = sdp.indexOf('4f1a8c2e-9b3d-4a5f-8e7c-1d2b3a4c5d6e.local 54321 typ host')
    const then = sdp.indexOf('172.20.10.3 54322 typ host')
    expect(at).toBeGreaterThan(-1)
    expect(then).toBeGreaterThan(at)
  })

  test('survives a full pass through the packer and back into itself', () => {
    // Encode, decode, then encode the *decoded* SDP again. A template that
    // dropped or renamed a field would produce a different code the second
    // time round, which is the cheapest possible test that the rebuild is
    // faithful to what the reader wants.
    const once = encodeHandshake(CHROME_OFFER, 'offer')!
    const { sdp } = decodeHandshake(once)!
    expect(encodeHandshake(sdp, 'offer')).toBe(once)
  })

  test('carries whether it is an offer or an answer', () => {
    expect(decodeHandshake(encodeHandshake(CHROME_OFFER, 'offer')!)!.kind).toBe('offer')
    expect(decodeHandshake(encodeHandshake(FIREFOX_ANSWER, 'answer')!)!.kind).toBe('answer')
  })

  test('normalises a v6 address the way a stack would print it', () => {
    const { sdp } = decodeHandshake(encodeHandshake(FIREFOX_ANSWER, 'answer')!)!
    // The longest zero run collapses to `::`, rather than coming back as
    // fe80:0:0:0:14ab:33ff:fe12:3456 - which is the same address and not the
    // same string, and string is what a comparison in a log will use.
    expect(sdp).toContain('fe80::14ab:33ff:fe12:3456')
  })
})
