import { describe, expect, test } from 'bun:test'
import { gatherShoves } from '@/app/xp/_runtime/body/shoves'

/**
 * How far every peer moved since the last frame, which is what `stepBodies`
 * needs to know which way each one is pushing.
 *
 * The memory of where they were is the whole thing, and both of its rules are
 * the kind that go wrong quietly: a peer who has gone still shoving, and a peer
 * who has just arrived shoving from nowhere.
 */

/** Everything fills a list the caller owns; these tests hand it a fresh one. */
const into = () => [] as Parameters<typeof gatherShoves>[2]

const box = (x: number, y = 0, z = 0) => ({
  minX: x - 1, maxX: x + 1, minY: y, maxY: y + 2, minZ: z - 1, maxZ: z + 1,
})

describe('a peer that has moved', () => {
  test('shoves by how far, from the middle of its feet', () => {
    const wasAt = new Map([['a', { x: 0, y: 0, z: 0 }]])
    const list = into(); gatherShoves([{ id: 'a', box: box(3, 0, 4) }], wasAt, list); const [shove] = list
    expect(shove).toMatchObject({ dx: 3, dy: 0, dz: 4 })
  })

  test('and the memory follows it', () => {
    const wasAt = new Map([['a', { x: 0, y: 0, z: 0 }]])
    gatherShoves([{ id: 'a', box: box(3) }], wasAt, into())
    expect(wasAt.get('a')).toEqual({ x: 3, y: 0, z: 0 })
  })

  test('a peer standing still shoves with nothing', () => {
    const wasAt = new Map([['a', { x: 2, y: 0, z: 0 }]])
    const list = into(); gatherShoves([{ id: 'a', box: box(2) }], wasAt, list); const [shove] = list
    expect(shove).toMatchObject({ dx: 0, dy: 0, dz: 0 })
  })

  /** The base of the box, not the middle of it - a body is shoved at the feet. */
  test('height is read off the bottom of the box', () => {
    const wasAt = new Map<string, { x: number; y: number; z: number }>()
    gatherShoves([{ id: 'a', box: box(0, 5) }], wasAt, into())
    expect(wasAt.get('a')?.y).toBe(5)
  })
})

/**
 * They are a solid thing to walk into from the moment they appear. They are
 * simply not pushing yet, which is true - nobody knows which way somebody is
 * going until there are two frames of them.
 */
describe('a peer nobody has seen before', () => {
  test('is still in the list', () => {
    expect((() => { const l = into(); gatherShoves([{ id: 'new', box: box(0) }], new Map(), l); return l })().length).toBe(1)
  })

  test('but shoves with zero rather than from the origin', () => {
    const list = into(); gatherShoves([{ id: 'new', box: box(40, 0, 40) }], new Map(), list); const [shove] = list
    expect(shove).toMatchObject({ dx: 0, dy: 0, dz: 0 })
  })

  test('and is remembered for next frame', () => {
    const wasAt = new Map<string, { x: number; y: number; z: number }>()
    gatherShoves([{ id: 'new', box: box(7) }], wasAt, into())
    expect(wasAt.has('new')).toBe(true)
  })
})

/**
 * Pruned by what is present this frame rather than on a leave message, which is
 * what makes it self-correcting: there is no event to miss.
 */
describe('a peer that has gone', () => {
  test('is forgotten', () => {
    const wasAt = new Map([['gone', { x: 0, y: 0, z: 0 }], ['here', { x: 0, y: 0, z: 0 }]])
    gatherShoves([{ id: 'here', box: box(1) }], wasAt, into())
    expect([...wasAt.keys()]).toEqual(['here'])
  })

  test('and is not in the shove list', () => {
    const wasAt = new Map([['gone', { x: 0, y: 0, z: 0 }]])
    expect((() => { const l = into(); gatherShoves([], wasAt, l); return l })()).toEqual([])
  })

  test('an empty room forgets everybody', () => {
    const wasAt = new Map([['a', { x: 0, y: 0, z: 0 }], ['b', { x: 0, y: 0, z: 0 }]])
    gatherShoves([], wasAt, into())
    expect(wasAt.size).toBe(0)
  })

  /** Coming back is arriving: no delta from wherever they were before. */
  test('and shoves with zero when they come back', () => {
    const wasAt = new Map<string, { x: number; y: number; z: number }>()
    gatherShoves([{ id: 'a', box: box(0) }], wasAt, into())
    gatherShoves([], wasAt, into())
    const list = into(); gatherShoves([{ id: 'a', box: box(9) }], wasAt, list); const [shove] = list
    expect(shove).toMatchObject({ dx: 0, dz: 0 })
  })
})

describe('a room with several people in it', () => {
  test('every one of them shoves', () => {
    const wasAt = new Map([['a', { x: 0, y: 0, z: 0 }], ['b', { x: 0, y: 0, z: 0 }]])
    const out = into(); gatherShoves([{ id: 'a', box: box(1) }, { id: 'b', box: box(2) }], wasAt, out)
    expect(out.map((s) => s.dx)).toEqual([1, 2])
  })

  test('and the boxes are handed through as they came', () => {
    const b = box(5)
    expect((() => { const l = into(); gatherShoves([{ id: 'a', box: b }], new Map(), l); return l[0]!.box })()).toBe(b)
  })
})

/**
 * The caller empties the list once at the top of the frame and pushes its own
 * shoulder in first, so a clear in here would delete the one shove that is
 * always present.
 */
describe('the list it is handed', () => {
  test('is appended to, not emptied first', () => {
    const own = { box: box(0), dx: 1, dy: 0, dz: 0 }
    const list = [own]
    gatherShoves([{ id: 'a', box: box(5) }], new Map(), list)
    expect(list.length).toBe(2)
    expect(list[0]).toBe(own)
  })

  /** No new array per frame - the whole reason it fills rather than returns. */
  test('and is the same array afterwards', () => {
    const list = into()
    gatherShoves([{ id: 'a', box: box(1) }], new Map(), list)
    const same = list
    gatherShoves([{ id: 'a', box: box(2) }], new Map(), list)
    expect(list).toBe(same)
  })
})
