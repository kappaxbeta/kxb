import { describe, expect, test } from 'bun:test'
import { cleanName, cleanRoster, decode, encode, forwardTo } from './wire'

/**
 * Frames from a stranger's phone.
 *
 * Every test here is an attack or an accident, because that is what this
 * module is for: nothing arriving down a data channel is ours, and the only
 * place that is judged is `decode`. A parser that throws would take the
 * connection down with it, so the shape of every answer is null.
 */

describe('decode', () => {
  test('reads a frame we sent', () => {
    expect(decode(encode({ e: 'move', p: { x: 1 }, f: 'abc' }))).toEqual({
      e: 'move',
      p: { x: 1 },
      f: 'abc',
    })
  })

  test('refuses rubbish rather than throwing', () => {
    for (const bad of [
      '',
      'not json',
      '[]',
      'null',
      '{}',
      '{"e":"move"}', // no sender
      '{"f":"abc"}', // no event
      '{"e":"","f":"abc"}', // empty event
      '{"e":"move","f":""}', // empty sender
      `{"e":"${'x'.repeat(33)}","f":"a"}`, // event name past the cap
      `{"e":"move","f":"${'x'.repeat(65)}"}`, // sender id past the cap
      42,
      null,
      undefined,
      { e: 'move', f: 'a' }, // an object, not the string a channel delivers
    ]) {
      expect(decode(bad as unknown)).toBeNull()
    }
  })

  test('refuses a frame far too big to be a position', () => {
    // A channel is reliable and ordered, so a peer can wedge the receiver by
    // sending something enormous. The cap is checked before `JSON.parse`, which
    // is the expensive part.
    expect(decode(`{"e":"move","f":"a","p":"${'x'.repeat(70_000)}"}`)).toBeNull()
  })

  test('keeps the payload untouched, because it is not this layer to judge', () => {
    // Whoever handles `move` validates a move. This only guarantees an envelope.
    expect(decode('{"e":"move","f":"a","p":null}')?.p).toBeNull()
    expect(decode('{"e":"x","f":"a"}')?.p).toBeUndefined()
  })
})

describe('cleanName', () => {
  test('keeps an ordinary name', () => {
    expect(cleanName('Wren')).toBe('Wren')
    expect(cleanName('  Bo  ')).toBe('Bo')
  })

  test('never returns nothing, because a nameless body cannot be referred to', () => {
    for (const empty of ['', '   ', 42, null, undefined, {}]) {
      expect(cleanName(empty as unknown)).toBe('Someone')
    }
  })

  test('strips the characters that would let a name paint over the page', () => {
    // Built from code points rather than pasted in. These characters are
    // invisible, so a literal in a source file is one nobody can see, review,
    // or notice being dropped by a copy and paste - which is exactly how the
    // implementation silently stopped stripping them the first time.
    const OVERRIDE = String.fromCharCode(0x202e)
    const EMBEDS = String.fromCharCode(0x202a, 0x202b, 0x2066)
    expect(cleanName(`We${OVERRIDE}lls`)).toBe('Wells')
    expect(cleanName(EMBEDS)).toBe('Someone')
    expect(cleanName(`a${String.fromCharCode(0x07)}b`)).toBe('ab')
  })

  test('truncates rather than refusing, so a long name is still somebody', () => {
    expect(cleanName('x'.repeat(200))).toHaveLength(40)
  })
})

describe('cleanRoster', () => {
  test('cleans every entry and drops the unusable ones', () => {
    const roster = cleanRoster(
      [
        { id: 'a', name: 'Wren', avatar: 'fox' },
        { name: 'no id' },
        'not an object',
        { id: 'b', name: '', avatar: 42 },
      ],
      8,
    )
    expect(roster).toEqual([
      { id: 'a', name: 'Wren', avatar: 'fox' },
      { id: 'b', name: 'Someone', avatar: '' },
    ])
  })

  test('drops a repeated id, first one winning', () => {
    // Two entries for one id is two bodies fighting over one position.
    const roster = cleanRoster(
      [
        { id: 'a', name: 'First' },
        { id: 'a', name: 'Second' },
      ],
      8,
    )
    expect(roster).toHaveLength(1)
    expect(roster[0].name).toBe('First')
  })

  test('stops at the limit, so a host cannot flood a guest with bodies', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `p${i}`, name: 'x' }))
    expect(cleanRoster(many, 8)).toHaveLength(8)
  })

  test('is an empty room for anything that is not a list', () => {
    expect(cleanRoster('nope', 8)).toEqual([])
    expect(cleanRoster(null, 8)).toEqual([])
  })
})

describe('forwardTo', () => {
  test('sends to everybody but the sender', () => {
    const links = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    expect(forwardTo(links, 'b').sort()).toEqual(['a', 'c'])
  })

  test('never echoes back down the link it arrived on', () => {
    // The loop that makes a two-person room melt.
    const links = new Map([['a', 1]])
    expect(forwardTo(links, 'a')).toEqual([])
  })
})
