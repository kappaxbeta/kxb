import { describe, expect, test } from 'bun:test'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import {
  finishCrossed,
  finishMarks,
  raceReady,
  startGrid,
  startMark,
} from '@/app/world/lounge/_sim/race'
import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_LINE_WIDTH,
  type Goal,
} from '@/domain/lounge/goal-events'

/** A line across Z, so a racer travels along Z to cross it. */
function line(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'm',
    kind: 'start',
    x: 0,
    y: 0,
    z: 0,
    width: DEFAULT_LINE_WIDTH,
    height: DEFAULT_LINE_HEIGHT,
    facing: 0,
    ...overrides,
  }
}

const START = line()
const FINISH = line({ id: 'f', kind: 'finish', z: 40 })

describe('reading a course out of a world', () => {
  test('a start and a finish is a course', () => {
    expect(raceReady([START, FINISH])).toBe(true)
  })

  test('a start with nowhere to end is not', () => {
    expect(raceReady([START])).toBe(false)
  })

  test('a finish with nowhere to begin is not', () => {
    expect(raceReady([FINISH])).toBe(false)
  })

  test('a football pitch is not a course', () => {
    expect(raceReady([line({ kind: 'red' }), line({ id: 'b', kind: 'blue' })])).toBe(false)
  })

  test('a wide finish may be built out of several marks', () => {
    const wider = line({ id: 'f2', kind: 'finish', x: 9, z: 40 })
    expect(finishMarks([START, FINISH, wider])).toHaveLength(2)
    expect(startMark([START, FINISH, wider])?.id).toBe('m')
  })
})

describe('the grid', () => {
  test('everybody stands on the line, not around it', () => {
    for (let index = 0; index < 4; index++) {
      const spot = startGrid(START, [FINISH], { index, total: 4 })
      // The line runs through the middle of cell z=0; the whole field starts
      // the same distance out.
      expect(spot.z).toBe(0.5)
    }
  })

  test('racers stand apart from one another', () => {
    const spots = [0, 1, 2, 3].map((index) => startGrid(START, [FINISH], { index, total: 4 }))
    const cells = new Set(spots.map((spot) => `${spot.x},${spot.z}`))
    expect(cells.size).toBe(4)
  })

  test('a pair does not stand at opposite ends of a wide line', () => {
    const [a, b] = [0, 1].map((index) => startGrid(START, [FINISH], { index, total: 2 }))
    expect(Math.abs(a!.x - b!.x)).toBeLessThanOrEqual(START.width / 2)
  })

  test('the grid is centred on the line', () => {
    const spots = [0, 1, 2, 3, 4].map((index) =>
      startGrid(START, [FINISH], { index, total: 5 }),
    )
    const middle = spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length
    expect(middle).toBeCloseTo(0.5, 5)
  })

  test('a field wider than the line wraps into rows behind it', () => {
    const narrow = line({ width: 2 })
    const third = startGrid(narrow, [FINISH], { index: 2, total: 4 })

    // The finish is at +Z, so a second row stands at -Z. Never ahead.
    expect(third.z).toBeLessThan(0.5)
  })

  test('rows go back whichever side the finish is on', () => {
    const behind = line({ id: 'f', kind: 'finish', z: -40 })
    const narrow = line({ width: 2 })
    expect(startGrid(narrow, [behind], { index: 2, total: 4 }).z).toBeGreaterThan(0.5)
  })

  test('a line across X spreads the grid along Z', () => {
    const across = line({ facing: 1 })
    const spots = [0, 1].map((index) => startGrid(across, [], { index, total: 2 }))
    expect(spots[0]!.x).toBe(spots[1]!.x)
    expect(spots[0]!.z).not.toBe(spots[1]!.z)
  })

  test('one racer stands in the middle of the line', () => {
    expect(startGrid(START, [FINISH], { index: 0, total: 1 })).toEqual({ x: 0.5, z: 0.5 })
  })

  test('every client derives the same grid from the same slot', () => {
    expect(startGrid(START, [FINISH], { index: 3, total: 6 })).toEqual(
      startGrid(START, [FINISH], { index: 3, total: 6 }),
    )
  })
})

describe('crossing the line', () => {
  const eye = (x: number, z: number) => ({ x, y: EYE_HEIGHT, z })

  test('running through the finish counts', () => {
    expect(finishCrossed(eye(0.5, 39), eye(0.5, 41), [START, FINISH])).toBe(true)
  })

  test('a dash that jumps the plane in one frame still counts', () => {
    // Seven blocks in a step is what a dash covers; a spot check would miss it.
    expect(finishCrossed(eye(0.5, 37), eye(0.5, 44), [START, FINISH])).toBe(true)
  })

  test('running past the end of the line does not', () => {
    expect(finishCrossed(eye(20, 39), eye(20, 41), [START, FINISH])).toBe(false)
  })

  test('crossing the start line is not finishing', () => {
    expect(finishCrossed(eye(0.5, -1), eye(0.5, 1), [START, FINISH])).toBe(false)
  })

  test('standing still on the line does not re-finish every frame', () => {
    expect(finishCrossed(eye(0.5, 40.5), eye(0.5, 40.5), [START, FINISH])).toBe(false)
  })
})
