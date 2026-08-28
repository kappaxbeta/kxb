import { describe, expect, test } from 'bun:test'
import {
  type Activity,
  BEAT_MS,
  BEATS_PER_WINDOW,
  beatActivity,
  clipFor,
  createRoamer,
  moodFor,
  perchFor,
  POSTURE,
  POTTER_RADIUS,
  roamAt,
  type Roamable,
  ROAM_SPEED,
  routeTo,
  seedFrom,
  TRAVEL_MS,
  WINDOW_MS,
  windowAt,
} from '@/domain/world/autonomy'
import { rectangleRoom, TILE, tileKey } from '@/domain/world/grid'

/**
 * A five-by-four room with nothing in it, which is the café's opening plan.
 *
 * Sorted keys rather than the set's own order, because that order is part of
 * the contract `perchFor` relies on - see the comment there.
 */
function room(width = 5, depth = 4): Roamable {
  const tiles = [...rectangleRoom(width, depth)].sort()
  const inside = new Set(tiles)
  return {
    tiles,
    walkable: (tile) => inside.has(tileKey(tile.x, tile.z)),
  }
}

/** Walk one window at a realistic frame rate, collecting every pose. */
function sample(seed: number, from: number, to: number, step = 1000 / 60) {
  const roamer = createRoamer(seed, room())
  const poses = []
  for (let t = from; t <= to; t += step) poses.push({ t, ...roamer.at(t) })
  return poses
}

describe('the schedule is a function of the clock', () => {
  test('two roamers with the same seed agree at the same instant', () => {
    const a = createRoamer(seedFrom('agent-one'), room())
    const b = createRoamer(seedFrom('agent-one'), room())

    // Deliberately stepped at different rates: this is the whole reason the
    // module is a closed form rather than a tick, so it is the first thing
    // worth proving.
    for (let t = 0; t < WINDOW_MS * 3; t += 997) a.at(t)
    for (let t = 0; t < WINDOW_MS * 3; t += 43) b.at(t)

    const when = WINDOW_MS * 3 + 12_345
    expect(a.at(when)).toEqual(b.at(when))
  })

  test('different seeds do not march in lockstep', () => {
    const a = createRoamer(seedFrom('agent-one'), room())
    const b = createRoamer(seedFrom('agent-two'), room())

    let apart = 0
    for (let t = 0; t < WINDOW_MS * 8; t += 500) {
      const one = a.at(t)
      const two = b.at(t)
      if (Math.hypot(one.x - two.x, one.z - two.z) > 0.5) apart++
    }

    expect(apart).toBeGreaterThan(500)
  })

  test('an agent that arrives an hour late sees the same room', () => {
    const early = createRoamer(seedFrom('cat'), room())
    const late = createRoamer(seedFrom('cat'), room())

    for (let t = 0; t < 3_600_000; t += 5_000) early.at(t)

    expect(late.at(3_600_000)).toEqual(early.at(3_600_000))
  })
})

describe('windowAt', () => {
  test('splits an instant into which window and how far in', () => {
    expect(windowAt(0)).toEqual({ index: 0, elapsed: 0 })
    expect(windowAt(WINDOW_MS - 1)).toEqual({ index: 0, elapsed: WINDOW_MS - 1 })
    expect(windowAt(WINDOW_MS)).toEqual({ index: 1, elapsed: 0 })
    expect(windowAt(WINDOW_MS * 4 + 7)).toEqual({ index: 4, elapsed: 7 })
  })
})

describe('beats', () => {
  test('the last beat of a window is always a settled one', () => {
    // Load-bearing: it is what makes the window seam continuous. If this fails
    // agents teleport half a metre every forty-eight seconds.
    for (let window = 0; window < 200; window++) {
      expect(beatActivity(seedFrom('seam'), window, BEATS_PER_WINDOW - 1)).toBe('watch')
    }
  })

  test('a mood actually changes what the body does', () => {
    const counts = new Map<string, Record<string, number>>()

    for (let window = 0; window < 4000; window++) {
      const mood = moodFor(seedFrom('spread'), window)
      const row = counts.get(mood) ?? { potter: 0, watch: 0, sit: 0, sleep: 0 }
      for (let beat = 0; beat < BEATS_PER_WINDOW - 1; beat++) {
        row[beatActivity(seedFrom('spread'), window, beat)]++
      }
      counts.set(mood, row)
    }

    // Every mood turns up, and each leans the way its weights say.
    expect([...counts.keys()].sort()).toEqual(['drowsy', 'restless', 'settled'])
    expect(counts.get('restless')!.sleep).toBe(0)
    expect(counts.get('drowsy')!.sleep).toBeGreaterThan(counts.get('drowsy')!.potter)
    expect(counts.get('settled')!.sit).toBeGreaterThan(counts.get('settled')!.sleep)
  })

  test('every activity a beat can pick is one the renderer knows', () => {
    const seen = new Set<Activity>()
    for (let window = 0; window < 500; window++) {
      for (let beat = 0; beat < BEATS_PER_WINDOW; beat++) {
        seen.add(beatActivity(seedFrom('coverage'), window, beat))
      }
    }
    expect(seen.size).toBe(4)
    for (const activity of seen) {
      expect(POSTURE[activity]).toBeDefined()
      expect(clipFor(activity)).toBe(activity === 'potter' ? 'walk' : 'idle')
    }
  })
})

describe('roamAt', () => {
  test('a body never leaves the room it is roaming', () => {
    const plan = room()
    // The furthest a pose may sit from the centre of a square, which is a
    // potter step. Half a tile would put it in the next square along.
    const slack = POTTER_RADIUS

    for (const pose of sample(seedFrom('bounds'), 0, WINDOW_MS * 6, 250)) {
      expect(pose.x).toBeGreaterThanOrEqual(-TILE / 2 - slack)
      expect(pose.x).toBeLessThanOrEqual(4 * TILE + TILE / 2 + slack)
      expect(pose.z).toBeGreaterThanOrEqual(-TILE / 2 - slack)
      expect(pose.z).toBeLessThanOrEqual(3 * TILE + TILE / 2 + slack)
    }

    expect(plan.tiles).toHaveLength(20)
  })

  test('nothing jumps, including across a window seam', () => {
    const step = 1000 / 60
    // A shade over the top speed a hurried crossing can reach, per frame.
    const ceiling = (ROAM_SPEED * 4 * step) / 1000

    const poses = sample(seedFrom('continuity'), 0, WINDOW_MS * 5, step)
    let worst = 0
    for (let i = 1; i < poses.length; i++) {
      worst = Math.max(
        worst,
        Math.hypot(poses[i].x - poses[i - 1].x, poses[i].z - poses[i - 1].z),
      )
    }

    expect(worst).toBeLessThan(ceiling)
  })

  test('a window ends standing on the square the next one walks from', () => {
    const plan = room()
    const seed = seedFrom('seam-position')

    for (let window = 1; window < 40; window++) {
      const last = roamAt(seed, window * WINDOW_MS - 1, routeTo(seed, window, plan))
      const next = routeTo(seed, window + 1, plan)[0]

      expect(last.x).toBeCloseTo(next.x, 6)
      expect(last.z).toBeCloseTo(next.z, 6)
    }
  })

  test('the travel phase actually gets somewhere, then stops', () => {
    const plan = room()
    const seed = seedFrom('journey')

    // A window whose perch is genuinely somewhere else, so there is a walk to
    // watch rather than a body that was already there.
    let window = 1
    while (window < 100) {
      const from = perchFor(seed, window - 1, plan.tiles)
      const to = perchFor(seed, window, plan.tiles)
      if (Math.abs(from.x - to.x) + Math.abs(from.z - to.z) >= 3) break
      window++
    }

    const route = routeTo(seed, window, plan)
    const start = window * WINDOW_MS
    const perch = route[route.length - 1]

    expect(roamAt(seed, start + 100, route).activity).toBe('travel')

    // By the time the beats begin it is standing on its mark, whatever the
    // route was.
    const arrived = roamAt(seed, start + TRAVEL_MS, route)
    expect(arrived.x).toBeCloseTo(perch.x, 6)
    expect(arrived.z).toBeCloseTo(perch.z, 6)
    expect(arrived.activity).not.toBe('travel')
  })

  test('a settled body holds still rather than creeping', () => {
    const seed = seedFrom('stillness')
    const plan = room()

    // Find a beat the agent spends asleep, then check it is not drifting
    // through the back half of it.
    for (let window = 0; window < 60; window++) {
      for (let beat = 0; beat < BEATS_PER_WINDOW - 1; beat++) {
        if (beatActivity(seed, window, beat) !== 'sleep') continue

        const route = routeTo(seed, window, plan)
        const base = window * WINDOW_MS + TRAVEL_MS + beat * BEAT_MS
        const half = roamAt(seed, base + BEAT_MS / 2, route)
        const end = roamAt(seed, base + BEAT_MS - 1, route)

        expect(half.x).toBeCloseTo(end.x, 6)
        expect(half.z).toBeCloseTo(end.z, 6)
        expect(end.activity).toBe('sleep')
        return
      }
    }

    throw new Error('no sleeping beat found to check')
  })
})

describe('routeTo', () => {
  test('walks around furniture rather than through it', () => {
    // A wall of blocked squares down the middle, with one gap.
    const tiles = [...rectangleRoom(5, 4)].sort()
    const blocked = new Set(['2,0', '2,1', '2,2'])
    const plan: Roamable = {
      tiles: tiles.filter((tile) => !blocked.has(tile)),
      walkable: (tile) =>
        !blocked.has(tileKey(tile.x, tile.z)) &&
        tile.x >= 0 &&
        tile.x < 5 &&
        tile.z >= 0 &&
        tile.z < 4,
    }

    for (let window = 1; window < 60; window++) {
      for (const point of routeTo(seedFrom('maze'), window, plan)) {
        const tile = tileKey(Math.round(point.x / TILE), Math.round(point.z / TILE))
        expect(blocked.has(tile)).toBe(false)
      }
    }
  })

  test('a walled-off perch is crossed to anyway rather than never reached', () => {
    // Two halves with no gap at all. Standing still forever would be worse.
    const plan: Roamable = {
      tiles: ['0,0', '4,0'],
      walkable: (tile) => tile.z === 0 && (tile.x === 0 || tile.x === 4),
    }

    const route = routeTo(seedFrom('sundered'), 1, plan)
    expect(route.length).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(route[route.length - 1].x)).toBe(true)
  })
})

describe('createRoamer', () => {
  test('re-routes when the furniture moves under it', () => {
    const open = room()
    const seed = seedFrom('redecorated')

    // A bookcase dropped across the middle of the room, leaving one gap.
    const shut = new Set(['2,0', '2,1', '2,2'])
    const narrowed: Roamable = {
      tiles: open.tiles,
      walkable: (tile) => open.walkable(tile) && !shut.has(tileKey(tile.x, tile.z)),
    }

    // Find a window whose walk is genuinely diverted by it. Most are not - the
    // gap is right there - and a test that happened to pick one of those would
    // pass whether or not the cache was invalidated at all.
    let index = 1
    while (index < 200) {
      const detoured = routeTo(seed, index, narrowed)
      const direct = routeTo(seed, index, open)
      if (JSON.stringify(detoured) !== JSON.stringify(direct)) break
      index++
    }
    expect(index).toBeLessThan(200)

    const when = index * WINDOW_MS + 500
    const roamer = createRoamer(seed, open)

    // Warm the cache on the open room, then ask again at the same instant with
    // the furniture in place. Same window, so only the room can force a rebuild.
    roamer.at(when)
    expect(roamer.at(when, narrowed)).toEqual(
      roamAt(seed, when, routeTo(seed, index, narrowed)),
    )
  })

  test('refuses a room with no floor instead of returning NaN', () => {
    expect(() => perchFor(1, 0, [])).toThrow('no tiles')
  })
})
