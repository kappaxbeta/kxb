import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { drive, type Course } from '@/app/xp/_runtime/input/pilot'
import { cameraOf, parseXp, type XpDocument } from '@kxb/xp'
import { buildSolids } from '@kxb/xp/engine'

/**
 * The courses we ship, actually run.
 *
 * `xps.test.ts` measures every gap against a simulated jump, which catches the
 * mistake that shipped in the first draft of `ladder-run` - a six-cell gap with
 * a two-cell rise. What it cannot say is that the course can be *run*: a gap
 * inside the budget is still unreachable under an overhang, and every budget in
 * the world says it is fine.
 *
 * This is the stronger claim, and it is the only kind of proof available here -
 * the Browser pane never fires a frame, so a course nobody has driven is a
 * course nobody has played.
 */

const XPS = path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'xps')

function load(id: string): XpDocument {
  const parsed = parseXp(JSON.parse(readFileSync(path.join(XPS, `${id}.xp.json`), 'utf8')))
  if (!parsed.ok) throw new Error(`${id} does not parse`)
  return parsed.document
}

/** A course from a document's own start and finish marks. */
function course(xp: XpDocument): Course {
  const start = xp.world.marks.find((mark) => mark.kind === 'start')
  const finish = xp.world.marks.find((mark) => mark.kind === 'finish')
  if (!start || !finish) throw new Error('not a course')

  return {
    isSolid: buildSolids(xp.world).isSolid,
    from: { x: xp.spawn.x, y: xp.spawn.y, z: xp.spawn.z },
    to: { x: finish.x, y: finish.y, z: finish.z },
    floorY: xp.world.floorY,
    camera: cameraOf(xp),
  }
}

describe('sidestep, the side-on course', () => {
  const xp = load('sidestep')

  test('it is watched from the side, which is what the pilot has to steer by', () => {
    // Not decoration: the pilot takes its heading from `movementBasis`, so a
    // course driven with the wrong basis would be proving a level nobody plays.
    expect(cameraOf(xp).kind).toBe('side')
  })

  test('a body can run it from the start mark to the gate', () => {
    /**
     * The claim the arithmetic cannot make. If this fails after somebody tunes
     * `JUMP_SPEED`, moves a platform, or widens a gap, it fails *here* rather
     * than in front of whoever opens the level.
     */
    const run = drive(course(xp))

    expect(run.fell).toBe(false)
    expect(run.stuck).toBe(false)
    expect(run.arrived).toBe(true)
  })

  test('and it takes a plausible amount of time, not a suspicious one', () => {
    /**
     * A bound rather than a number, and both ends matter. Too slow means the
     * pilot is grinding along a wall it happens to be able to climb; *too fast*
     * means it is not running the course at all - falling through the floor into
     * a straight line to the finish would arrive quickly and prove nothing.
     */
    const run = drive(course(xp))
    expect(run.seconds).toBeGreaterThan(3)
    expect(run.seconds).toBeLessThan(45)
  })
})

describe('what it refuses to answer', () => {
  test('ladder-run is an L, so the pilot says so rather than running one leg', () => {
    /**
     * The most important assertion in this file, because the first version of
     * the pilot got it *wrong in the confident direction*: `ladder-run` finishes
     * at (48, -41), and a pilot comparing only the axis it walks on reported
     * `arrived: true` the moment it passed x=48 - having run one leg of two, in
     * 4.4 seconds, with no sign anything was missing.
     *
     * A test that passes with the course half-run is worth less than no test,
     * because somebody believes it. So the steering model refuses a course whose
     * finish is off its axis, and this is what pins that.
     *
     * It is also the concrete argument for `sidestep` existing: the board used
     * to claim `ladder-run` would work side-on almost unchanged, and this is the
     * same fact from the other end.
     */
    const run = drive(course(load('ladder-run')))
    expect(run.offAxis).toBe(true)
    expect(run.arrived).toBe(false)
  })

  test('and a straight course is not refused', () => {
    // The other half of the pair: without it the test above passes for a pilot
    // that refuses everything.
    expect(drive(course(load('sidestep'))).offAxis).toBe(false)
  })
})

describe('the pilot itself', () => {
  const flat = (length: number): Course => ({
    // A floor one cell thick at y = -1, running from x = 0 to `length`.
    isSolid: (x, y, z) => y === -1 && x >= 0 && x <= length && z === 0,
    from: { x: 0.5, y: 0, z: 0.5 },
    to: { x: length - 0.5, y: 0, z: 0.5 },
    floorY: -1,
    camera: { kind: 'side', axis: 'x' },
  })

  test('it walks a flat course without jumping at all', () => {
    // The regression the take-off point exists for: the rough version pressed
    // jump on every grounded frame and bounced on the spot. A flat run is where
    // that shows up as taking far longer than walking the distance.
    const run = drive(flat(30))
    expect(run.arrived).toBe(true)
    // 30 cells at sprint pace is a shade over two seconds. Bouncing would be
    // several times that, and standing still would not arrive.
    expect(run.seconds).toBeLessThan(4)
  })

  test('it reports being stuck rather than looping to the time limit', () => {
    // A wall it cannot climb: the run has to end with a reason, not by running
    // out of frames, or a broken course looks the same as a slow one.
    const walled: Course = {
      ...flat(30),
      isSolid: (x, y, z) => (y === -1 && x >= 0 && x <= 30 && z === 0) || (x === 10 && y < 6),
    }
    const run = drive(walled)
    expect(run.arrived).toBe(false)
    expect(run.stuck).toBe(true)
    expect(run.reached).toBeLessThan(11)
  })

  test('it reports falling rather than arriving by accident', () => {
    // Ground that stops halfway, with the finish beyond it. Without the check, a
    // pilot that fell past the floor would keep travelling and "arrive".
    const broken: Course = {
      ...flat(30),
      isSolid: (x, y, z) => y === -1 && x >= 0 && x <= 6 && z === 0,
    }
    const run = drive(broken)
    expect(run.arrived).toBe(false)
    expect(run.fell).toBe(true)
  })

  test('it clears a gap it is meant to clear', () => {
    // Two platforms with four cells of nothing between them - inside the sprint
    // jump, and the whole reason the take-off point is computed.
    const gap: Course = {
      ...flat(30),
      isSolid: (x, y, z) =>
        y === -1 && z === 0 && ((x >= 0 && x <= 10) || (x >= 15 && x <= 30)),
    }
    const run = drive(gap)
    expect(run.fell).toBe(false)
    expect(run.arrived).toBe(true)
  })
})
