import { describe, expect, test } from 'bun:test'

import { createReader } from './spell'
import { circle, line } from './handwriting'

const slash = () => line({ x: 60, y: 60 }, { x: 140, y: 140 }, 3)
const backslash = () => line({ x: 140, y: 60 }, { x: 60, y: 140 }, 3)
const ring = () => circle(240, 100, 50, 5)
const stem = () => line({ x: 280, y: 20 }, { x: 280, y: 140 }, 2)
/** The same stroke, standing well clear of the ring: a letter of its own. */
const apart = () => line({ x: 420, y: 20 }, { x: 420, y: 140 }, 2)

describe('createReader', () => {
  test('two rings are a rainbow', () => {
    const reader = createReader()
    expect(reader.add(ring(), 0)).toBeNull()
    expect(reader.add(circle(420, 100, 50, 5), 400)).toBe('rainbow')
  })

  test('a ring and a stroke standing clear of it is the beam', () => {
    const reader = createReader()
    expect(reader.add(ring(), 0)).toBeNull()
    expect(reader.add(apart(), 400)).toBe('beam')
  })

  test('the same stroke against the ring dances instead', () => {
    // The gap is the letter. This pair is a d; the pair above is an o and an i.
    const reader = createReader()
    expect(reader.add(ring(), 0)).toBeNull()
    expect(reader.add(stem(), 400)).toBe('dance')
  })

  test('a cross closes a magic into a shout', () => {
    const reader = createReader()
    reader.add(slash(), 0)
    reader.add(backslash(), 200)
    // The magic fires on the way past, which is the design: you see the burst,
    // and the third letter is what sends it to everybody else.
    expect(reader.add(ring(), 500)).toBe('magic')
    reader.add(slash(), 800)
    expect(reader.add(backslash(), 1000)).toBe('shout')
  })

  test('a word can be narrowed to the ones this room understands', () => {
    const reader = createReader({ allowed: ['dance'] })
    reader.add(slash(), 0)
    reader.add(backslash(), 200)
    expect(reader.add(ring(), 500)).toBeNull()
    expect(reader.add(circle(100, 300, 40, 3), 900)).toBeNull()
    const bowl = createReader({ allowed: ['dance'] })
    expect(bowl.add(ring(), 0)).toBeNull()
    expect(bowl.add(stem(), 300)).toBe('dance')
  })

  test('an X and then an O is the magic word', () => {
    const reader = createReader()
    expect(reader.add(slash(), 0)).toBeNull()
    expect(reader.add(backslash(), 300)).toBeNull()
    expect(reader.add(ring(), 900)).toBe('magic')
  })

  test('an O and then an X is the same word', () => {
    const reader = createReader()
    expect(reader.add(ring(), 0)).toBeNull()
    expect(reader.add(slash(), 400)).toBeNull()
    expect(reader.add(backslash(), 700)).toBe('magic')
  })

  test('a bowl and a stem dances, whichever half comes first', () => {
    const first = createReader()
    expect(first.add(stem(), 0)).toBeNull()
    expect(first.add(ring(), 300)).toBe('dance')

    // The awkward order: the ring is a whole letter on its own, so it has
    // already been read as an O by the time the stem lands.
    const second = createReader()
    expect(second.add(ring(), 0)).toBeNull()
    expect(second.add(stem(), 300)).toBe('dance')
  })

  test('a d in one stroke dances on its own', () => {
    const reader = createReader()
    const d = [...circle(100, 100, 40, 3), ...line({ x: 140, y: 100 }, { x: 140, y: 20 }, 2)]
    expect(reader.add(d, 0)).toBe('dance')
  })

  test('an O left on its own spells nothing', () => {
    const reader = createReader()
    expect(reader.add(ring(), 0)).toBeNull()
  })

  test('a letter waits, but not forever', () => {
    const reader = createReader({ window: 1000 })
    expect(reader.add(slash(), 0)).toBeNull()
    expect(reader.add(backslash(), 200)).toBeNull()
    expect(reader.add(ring(), 4000)).toBeNull()
  })

  test('the two halves of an X have to be near each other in time as well', () => {
    const reader = createReader({ window: 1000 })
    expect(reader.add(slash(), 0)).toBeNull()
    // The first half has been forgotten, so this is one line and nothing else.
    expect(reader.add(backslash(), 5000)).toBeNull()
  })

  test('putting the pen away forgets the half-written word', () => {
    const reader = createReader()
    expect(reader.add(slash(), 0)).toBeNull()
    expect(reader.add(backslash(), 300)).toBeNull()
    reader.reset()
    expect(reader.add(ring(), 600)).toBeNull()
  })

  test('the same word can be written twice', () => {
    const reader = createReader()
    reader.add(slash(), 0)
    reader.add(backslash(), 200)
    expect(reader.add(ring(), 500)).toBe('magic')
    reader.add(slash(), 900)
    reader.add(backslash(), 1100)
    expect(reader.add(ring(), 1400)).toBe('magic')
  })
})
