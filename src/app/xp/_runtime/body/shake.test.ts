import { describe, expect, test } from 'bun:test'
import { emptyWorld, type EntityWorld } from '@kxb/xp/engine'
import { SHAKE_REACH, SHAKE_SECONDS, shakeOf, struckIn } from '@/app/xp/_runtime/body/shake'

/**
 * The flinch, driven directly.
 *
 * The Browser pane never fires `requestAnimationFrame`, so a shake cannot be
 * watched - which is exactly why the decay and the edge detection are functions
 * rather than trigonometry inside a `useFrame`.
 */

function worldWith(rows: Record<number, number | undefined>): EntityWorld {
  const world = emptyWorld()
  for (const [id, hp] of Object.entries(rows)) {
    world.alive.add(Number(id))
    world.props.set(Number(id), hp === undefined ? {} : { hp })
  }
  return world
}

describe('noticing that something was hit', () => {
  test('a first sighting is recorded and not reported', () => {
    // Otherwise every entity in the level flinches on the first frame, which is
    // the shape "an absent previous value means full" would have produced.
    const seen = new Map<number, number>()
    expect(struckIn(worldWith({ 0: 100, 1: 40 }), seen)).toEqual([])
    expect(seen.get(0)).toBe(100)
  })

  test('health going down is a hit, whatever took it off', () => {
    const seen = new Map<number, number>()
    struckIn(worldWith({ 0: 100, 1: 40 }), seen)
    expect(struckIn(worldWith({ 0: 82, 1: 40 }), seen)).toEqual([0])
  })

  test('health going up is not', () => {
    const seen = new Map<number, number>()
    struckIn(worldWith({ 0: 50 }), seen)
    expect(struckIn(worldWith({ 0: 100 }), seen)).toEqual([])
  })

  test('standing still is not, however long it stands', () => {
    const seen = new Map<number, number>()
    const world = worldWith({ 0: 100 })
    struckIn(world, seen)
    expect(struckIn(world, seen)).toEqual([])
    expect(struckIn(world, seen)).toEqual([])
  })

  test('a thing with no health is not watched at all', () => {
    const seen = new Map<number, number>()
    struckIn(worldWith({ 0: undefined }), seen)
    expect(seen.size).toBe(0)
  })

  test('and one that has gone is forgotten, so the map stays level-sized', () => {
    const seen = new Map<number, number>()
    struckIn(worldWith({ 0: 100, 1: 100 }), seen)
    struckIn(worldWith({ 0: 100 }), seen)
    expect([...seen.keys()]).toEqual([0])
  })

  test('a thing that comes back is a first sighting again, not a hit', () => {
    /**
     * The `deactivate` case. It returns at whatever health its `returned` rule
     * gave it, and remembering the zero it left on would make the frame it
     * comes back the frame it appears to be hit.
     */
    const seen = new Map<number, number>()
    struckIn(worldWith({ 0: 100 }), seen)
    struckIn(worldWith({ 0: 0 }), seen)
    struckIn(worldWith({}), seen)
    expect(struckIn(worldWith({ 0: 100 }), seen)).toEqual([])
  })
})

describe('how far it moves', () => {
  test('nothing before it starts and nothing after it ends', () => {
    expect(shakeOf(0, 3)).toEqual({ x: 0, z: 0, turn: 0 })
    expect(shakeOf(SHAKE_SECONDS + 0.01, 3)).toEqual({ x: 0, z: 0, turn: 0 })
  })

  test('it never leaves the reach, so a target never dodges out of its own box', () => {
    for (let left = 0.001; left <= SHAKE_SECONDS; left += 0.002) {
      for (const id of [0, 1, 7, 42]) {
        const at = shakeOf(left, id)
        expect(Math.abs(at.x)).toBeLessThanOrEqual(SHAKE_REACH)
        expect(Math.abs(at.z)).toBeLessThanOrEqual(SHAKE_REACH)
      }
    }
  })

  test('it settles: late in the flinch it is smaller than early', () => {
    const early = Math.max(...sampled(SHAKE_SECONDS, SHAKE_SECONDS * 0.7))
    const late = Math.max(...sampled(SHAKE_SECONDS * 0.3, 0))
    expect(late).toBeLessThan(early)
  })

  test('it crosses back over its own mark rather than leaning one way', () => {
    const swings = sampledSigned(SHAKE_SECONDS, 0)
    expect(swings.some((x) => x > 0)).toBe(true)
    expect(swings.some((x) => x < 0)).toBe(true)
  })

  test('two things hit on the same frame do not move in lockstep', () => {
    // Free, and the alternative - a row of crates swaying together - reads as
    // wind rather than as damage.
    expect(shakeOf(0.2, 0).x).not.toBeCloseTo(shakeOf(0.2, 1).x, 3)
  })
})

function sampled(from: number, to: number): number[] {
  return sampledSigned(from, to).map(Math.abs)
}

function sampledSigned(from: number, to: number): number[] {
  const out: number[] = []
  for (let left = from; left > to; left -= 0.005) out.push(shakeOf(left, 3).x)
  return out
}
