import { describe, expect, test } from 'bun:test'
import {
  FRESHEN_AFTER_MS,
  iceServers,
  TURN_TTL_SECONDS,
  turnExpiry,
  turnUrls,
  turnUsername,
} from '@/domain/world/turn'

describe('turnUrls', () => {
  test('is empty when nothing is configured', () => {
    expect(turnUrls(undefined)).toEqual([])
    expect(turnUrls('')).toEqual([])
  })

  test('takes a list and trims it', () => {
    expect(turnUrls('stun:a.test:3478, turn:b.test:3478')).toEqual([
      'stun:a.test:3478',
      'turn:b.test:3478',
    ])
  })

  test('drops anything a browser would not dial', () => {
    // An RTCPeerConnection built with one of these throws, and it would throw
    // for everybody in the room rather than for the person who mistyped it.
    expect(turnUrls('https://relay.test, turn:b.test:3478, relay.test')).toEqual([
      'turn:b.test:3478',
    ])
  })

  test('keeps the TLS variants, which are the ones that survive a hostile network', () => {
    expect(turnUrls('turns:b.test:5349,stuns:a.test:5349')).toHaveLength(2)
  })
})

describe('turnUsername', () => {
  test('leads with the expiry, because that is what coturn checks', () => {
    expect(turnUsername('user-1', 1_800_000_000)).toBe('1800000000:user-1')
  })

  test('is whole seconds even when handed a fraction', () => {
    expect(turnUsername('user-1', 1_800_000_000.9)).toBe('1800000000:user-1')
  })
})

describe('turnExpiry', () => {
  test('is the TTL from now, in seconds', () => {
    expect(turnExpiry(1_800_000_000_000)).toBe(1_800_000_000 + TURN_TTL_SECONDS)
  })

  test('refreshes with room to spare before it expires', () => {
    // The gap is the whole point: a credential that expires between "the roster
    // says connect" and "the connection is built" fails for a reason nothing
    // logs usefully.
    expect(FRESHEN_AFTER_MS).toBeLessThan(TURN_TTL_SECONDS * 1000)
  })
})

describe('iceServers', () => {
  const credential = { username: '1800000000:user-1', credential: 'signed' }

  test('is empty when nothing is configured', () => {
    expect(iceServers([], credential)).toEqual([])
  })

  test('leaves STUN unauthenticated', () => {
    const servers = iceServers(['stun:a.test:3478'], credential)
    expect(servers).toEqual([{ urls: ['stun:a.test:3478'] }])
  })

  test('carries the credential on the relay only', () => {
    const servers = iceServers(['stun:a.test:3478', 'turn:b.test:3478'], credential)
    expect(servers).toHaveLength(2)
    expect(servers[0].username).toBeUndefined()
    expect(servers[1]).toEqual({
      urls: ['turn:b.test:3478'],
      username: credential.username,
      credential: credential.credential,
    })
  })

  test('drops a relay it has no credential for', () => {
    // Better than offering one that cannot authenticate: ICE would spend its
    // whole gathering budget failing against it.
    expect(iceServers(['turn:b.test:3478'])).toEqual([])
  })

  test('groups every relay URL under one entry', () => {
    const servers = iceServers(['turn:b.test:3478', 'turns:b.test:5349'], credential)
    expect(servers).toHaveLength(1)
    expect(servers[0].urls).toEqual(['turn:b.test:3478', 'turns:b.test:5349'])
  })
})
