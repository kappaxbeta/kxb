import { describe, expect, test } from 'bun:test'
import { DEFAULT_SCENE, type StudioScene } from '@/domain/studio/scene'
import { freeSpot } from '@/domain/studio/spawn'

const at = (x: number, z: number) => ({
  model: 'crate',
  x,
  top: 1,
  z,
  rotation: 0,
  time: 0,
  scale: 1,
  tint: null,
  pitch: 0,
  roll: 0,
})

const scene = (over: Partial<StudioScene>): StudioScene => ({ ...DEFAULT_SCENE, ...over })

const clear = (spot: { x: number; z: number }, s: StudioScene) =>
  [...s.peeps, ...s.blocks].every((one) => Math.hypot(one.x - spot.x, one.z - spot.z) >= 1.4)

describe('where a new prop lands', () => {
  /**
   * The bug this exists for. Three peeps stand within a cell and a half of the
   * origin in the default scene, so a prop added there arrives behind one.
   */
  test('never the origin, where the default cast stands', () => {
    const spot = freeSpot(DEFAULT_SCENE)
    expect(spot).not.toEqual({ x: 0, z: 0 })
    expect(clear(spot, DEFAULT_SCENE)).toBe(true)
  })

  test('the front of the island when it is empty', () => {
    const empty = scene({ peeps: [], blocks: [] })
    expect(freeSpot(empty)).toEqual({ x: 0, z: 3 })
  })

  test('steps aside for something already standing there', () => {
    const one = scene({ peeps: [], blocks: [at(0, 3)] })
    const spot = freeSpot(one)
    expect(spot).not.toEqual({ x: 0, z: 3 })
    expect(clear(spot, one)).toBe(true)
  })

  test('adding several in a row spreads them out', () => {
    let s = scene({ peeps: [], blocks: [] })
    const spots: string[] = []
    for (let i = 0; i < 5; i++) {
      const spot = freeSpot(s)
      spots.push(`${spot.x},${spot.z}`)
      s = scene({ ...s, blocks: [...s.blocks, at(spot.x, spot.z)] })
    }
    expect(new Set(spots).size).toBe(5)
  })

  /** A small patch must not put a prop off the edge of its own ground. */
  test('stays on the ground it has', () => {
    const small = scene({ peeps: [], blocks: [], ground: { cols: 5, rows: 5, top: 'grass', rounded: true } })
    const spot = freeSpot(small)
    expect(Math.abs(spot.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(spot.z)).toBeLessThanOrEqual(2)
  })

  /** Total: a crowded scene still gets a prop rather than a dead button. */
  test('still answers when every spot is taken', () => {
    const packed = scene({
      peeps: [],
      blocks: Array.from({ length: 40 }, (_, i) => at((i % 13) - 6, Math.floor(i / 13) - 5)),
    })
    expect(freeSpot(packed)).toBeTruthy()
  })
})
