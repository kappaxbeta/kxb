import { describe, expect, test } from 'bun:test'
import {
  admitted,
  type FaceClient,
  freshest,
  linkRole,
  MAX_FACE_PAYLOAD,
  MAX_FACES,
  sanitiseFace,
  wantedLinks,
} from '@/domain/world/faces'

function client(conn: string, face = false, userId = `user-${conn}`): FaceClient {
  return { userId, conn, face }
}

describe('admitted', () => {
  test('is nobody when no camera is on', () => {
    expect(admitted([client('a'), client('b')])).toEqual([])
  })

  test('takes the cameras in id order, so every client admits the same ones', () => {
    const room = [client('d', true), client('a', true), client('c', true)]
    expect(admitted(room)).toEqual(['a', 'c', 'd'])
    // The same room, shuffled, is the same answer - which is the whole point.
    expect(admitted([...room].reverse())).toEqual(['a', 'c', 'd'])
  })

  test('stops at the cap', () => {
    const room = Array.from({ length: MAX_FACES + 3 }, (_, index) =>
      client(`conn-${index}`, true),
    )
    expect(admitted(room)).toHaveLength(MAX_FACES)
  })
})

describe('freshest', () => {
  test('keeps the last row presence gave for a tab', () => {
    const room = [client('a'), client('a', true)]
    expect(freshest(room)).toEqual([client('a', true)])
  })

  test('drops a row with no connection id', () => {
    expect(freshest([client(''), client('a')])).toEqual([client('a')])
  })

  test('leaves a room with one row each alone', () => {
    const room = [client('a', true), client('b')]
    expect(freshest(room)).toEqual(room)
  })
})

describe('linkRole', () => {
  test('is nothing at all when neither camera is on', () => {
    expect(linkRole(client('a'), client('b'), [])).toBeNull()
  })

  test('the end with the camera calls the end without one', () => {
    const live = ['a']
    expect(linkRole(client('a', true), client('b'), live)).toBe('offer')
    expect(linkRole(client('b'), client('a', true), live)).toBe('answer')
  })

  test('two cameras: the lower id calls, and both agree which that is', () => {
    const live = ['a', 'b']
    expect(linkRole(client('a', true), client('b', true), live)).toBe('offer')
    expect(linkRole(client('b', true), client('a', true), live)).toBe('answer')
  })

  test('a camera the cap turned away is not a reason to connect', () => {
    // `b` says its camera is on, but it did not make the admitted list.
    expect(linkRole(client('a'), client('b', true), ['z'])).toBeNull()
  })
})

describe('wantedLinks', () => {
  test('is empty in a room with no cameras', () => {
    const self = client('a')
    expect(wantedLinks(self, [self, client('b'), client('c')])).toEqual([])
  })

  test('one broadcaster reaches everybody else', () => {
    const self = client('a', true)
    const room = [self, client('b'), client('c')]

    const links = wantedLinks(self, room)
    expect(links.map((link) => link.conn)).toEqual(['b', 'c'])
    expect(links.every((link) => link.role === 'offer')).toBe(true)
  })

  test('never links a client to itself', () => {
    const self = client('a', true)
    expect(wantedLinks(self, [self, self]).length).toBe(0)
  })

  test('drops a client presence has no connection id for', () => {
    const self = client('a', true)
    expect(wantedLinks(self, [self, client('')])).toEqual([])
  })

  test('the two ends of a pair agree that the pair exists', () => {
    const a = client('a', true)
    const b = client('b', true)
    const room = [a, b, client('c')]

    const fromA = wantedLinks(a, room)
    const fromB = wantedLinks(b, room)

    expect(fromA.find((link) => link.conn === 'b')?.role).toBe('offer')
    expect(fromB.find((link) => link.conn === 'a')?.role).toBe('answer')
    // And both still carry the person with no camera.
    expect(fromA.some((link) => link.conn === 'c')).toBe(true)
    expect(fromB.some((link) => link.conn === 'c')).toBe(true)
  })

  test('turning our camera on does not disturb the link at all', () => {
    // The whole point of the transceiver being `sendrecv` from the start. This
    // used to flip the role, which meant a rebuild, which meant everybody in
    // the room saw a second of black because one person pressed a button.
    const off = client('a')
    const on = client('a', true)
    const room = (self: FaceClient) => [self, client('b', true)]

    const before = wantedLinks(off, room(off))[0]
    const after = wantedLinks(on, room(on))[0]

    expect(after.conn).toBe(before.conn)
    expect(after.role).toBe(before.role)
  })

  test('a peer switching off keeps the link and stops the picture', () => {
    const self = client('a', true)
    const on = wantedLinks(self, [self, client('b', true)])[0]
    const off = wantedLinks(self, [self, client('b')])[0]

    // Still connected - they may switch on again in a moment - but no longer
    // sending, which is what takes their face down.
    expect(off.conn).toBe(on.conn)
    expect(off.role).toBe(on.role)
    expect(on.receiving).toBe(true)
    expect(off.receiving).toBe(false)
  })

  test('somebody else joining does not disturb an existing link', () => {
    const a = client('a', true)
    const b = client('b')

    const before = wantedLinks(a, [a, b]).find((link) => link.conn === 'b')
    const after = wantedLinks(a, [a, b, client('c')]).find((link) => link.conn === 'b')

    expect(after?.role).toBe(before?.role ?? 'answer')
    expect(after?.receiving).toBe(before?.receiving ?? true)
  })
})

/**
 * The bug this whole dedupe exists for, as it actually arrived.
 *
 * Presence appends rather than replaces, so a tab that switched its camera on
 * is in the roster twice - once as it joined, once as it is. Read raw, the two
 * ends of a pair settled on incompatible roles and rebuilt the connection on
 * every sync forever.
 */
describe('a roster with both copies of everybody in it', () => {
  const a = client('a', true)
  const b = client('b', true)
  const room = [client('a'), a, client('b'), b]

  test('is one link per tab, not two', () => {
    const links = wantedLinks(a, room)
    expect(links).toHaveLength(1)
    expect(links[0].conn).toBe('b')
  })

  test('and the two ends still agree on which of them calls', () => {
    expect(wantedLinks(a, room)[0].role).toBe('offer')
    expect(wantedLinks(b, room)[0].role).toBe('answer')
  })

  test('reads the camera as on, not as the stale row that says off', () => {
    expect(admitted(room)).toEqual(['a', 'b'])
  })
})

describe('our own row, before the roster has caught up', () => {
  test('is believed over the stale copy of it', () => {
    const self = client('a', true)
    // The room still has us as we were a moment ago, camera off.
    const room = [client('a'), client('b', true)]

    // Both cameras on and 'a' sorts first, so we call - which is only true if
    // our own switch was believed over the roster's copy of it.
    expect(wantedLinks(self, room)[0].role).toBe('offer')
  })
})

describe('sanitiseFace', () => {
  const offer = { u: 'user', c: 'conn', to: 'them', k: 'offer', d: 'v=0' }

  test('takes a well-formed message', () => {
    expect(sanitiseFace(offer)).toEqual(offer as never)
  })

  test('refuses anything that is not an object', () => {
    for (const junk of [null, undefined, 7, 'offer', []]) {
      expect(sanitiseFace(junk)).toBeNull()
    }
  })

  test('refuses a message with nobody to deliver it to', () => {
    expect(sanitiseFace({ ...offer, to: '' })).toBeNull()
    expect(sanitiseFace({ ...offer, c: '' })).toBeNull()
    expect(sanitiseFace({ ...offer, u: '' })).toBeNull()
  })

  test('refuses a kind it would not know what to do with', () => {
    expect(sanitiseFace({ ...offer, k: 'hangup' })).toBeNull()
  })

  test('a goodbye carries nothing, and is allowed to', () => {
    const bye = sanitiseFace({ u: 'user', c: 'conn', to: 'them', k: 'bye' })
    expect(bye?.k).toBe('bye')
    expect(bye?.d).toBeUndefined()
  })

  test('refuses an offer with no description in it', () => {
    expect(sanitiseFace({ ...offer, d: undefined })).toBeNull()
    expect(sanitiseFace({ ...offer, d: '' })).toBeNull()
  })

  test('refuses a description too big to be one', () => {
    expect(sanitiseFace({ ...offer, d: 'x'.repeat(MAX_FACE_PAYLOAD + 1) })).toBeNull()
  })

  test('drops fields nobody asked for', () => {
    const cleaned = sanitiseFace({ ...offer, evil: 'yes' }) as unknown as Record<
      string,
      unknown
    >
    expect(cleaned.evil).toBeUndefined()
  })
})
