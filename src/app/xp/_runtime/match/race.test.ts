import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  crossedAt,
  crossings,
  finishMarks,
  formatRunTime,
  NO_RUN,
  raceReady,
  startMarks,
  stepRun,
  type Spot,
} from '@/app/xp/_runtime/match/race'
import { parseXp, type Mark } from '@kxb/xp'
import { EYE_HEIGHT, SPRINT_PACE } from '@kxb/xp/engine'

/**
 * A race clock, checked without running one.
 *
 * The runtime cannot be watched - the Browser pane is always `document.hidden`,
 * so `requestAnimationFrame` never fires and the canvas stays black - which
 * makes "did that finish count" a question a screenshot cannot answer. Every
 * awkward case below is one that would otherwise be found by somebody running a
 * course and being told the wrong number.
 */

/** A frame at 60fps, and the longest one the simulation will admit to. */
const FRAME = 1 / 60
const SLOW_FRAME = 0.05

function mark(over: Partial<Mark> & Pick<Mark, 'kind'>): Mark {
  return { x: 0, y: 0, z: 0, facing: 0, width: 6, height: 4, ...over }
}

/**
 * The check this file exists to replace: are you standing in it?
 *
 * Written out here rather than described, so the tests below can show it giving
 * the wrong answer on the same input the swept test gets right. The thickness is
 * generous - a third of a cell either side - and it still is not enough.
 */
function standingIn(at: Spot, m: Mark, thickness = 0.33): boolean {
  const radians = (m.facing * Math.PI) / 180
  const depth = (at.x - m.x) * Math.sin(radians) + (at.z - m.z) * Math.cos(radians)
  const across = (at.x - m.x) * Math.cos(radians) - (at.z - m.z) * Math.sin(radians)
  return (
    Math.abs(depth) <= thickness &&
    Math.abs(across) <= m.width / 2 &&
    at.y + EYE_HEIGHT >= m.y &&
    at.y <= m.y + m.height
  )
}

describe('crossing a mark', () => {
  test('a sprint through the line counts, and no thickness would have', () => {
    const finish = mark({ kind: 'finish' })

    // One clamped frame at sprint pace - two thirds of a cell - straddling the
    // plane as evenly as it can.
    const step = SPRINT_PACE * SLOW_FRAME
    const from = { x: 0, y: 0, z: -step / 2 }
    const to = { x: 0, y: 0, z: step / 2 }

    /**
     * Thin enough to be honest about where the line is, and it misses the
     * arrival entirely: neither sample is in it, and the crossing is lost.
     */
    expect(standingIn(from, finish, 0.1)).toBe(false)
    expect(standingIn(to, finish, 0.1)).toBe(false)

    /**
     * Thick enough to catch that frame, and now it lies the other way: a player
     * a third of a cell short of the finish has already finished. There is no
     * thickness that is both, which is the argument for sweeping instead of
     * picking one.
     */
    expect(standingIn(from, finish, step / 2 + 0.01)).toBe(true)

    const t = crossedAt(from, to, finish)
    expect(t).not.toBeNull()
    expect(t).toBeCloseTo(0.5, 6)
  })

  test('the plane is where the renderer turns it to, not the nearest axis', () => {
    /**
     * A mark at forty-five degrees, which is the case the lounge's version
     * cannot express: its `facing` is a quarter turn and its test picks an axis.
     * `./marks.tsx` rotates the frame by the degrees it is given, so a line at
     * forty-five degrees is a real line and has to be crossed like one.
     */
    const diagonal = mark({ kind: 'finish', facing: 45 })

    // Straight through the middle, perpendicular to the line.
    const through = crossedAt({ x: -2, y: 0, z: -2 }, { x: 2, y: 0, z: 2 }, diagonal)
    expect(through).toBeCloseTo(0.5, 6)

    /**
     * And a walk that meets the *plane* well off the end of the line does not.
     *
     * This is the assertion an axis-aligned test fails: along +x at z = 3 the
     * plane is met at x = -3, which is four and a quarter cells out along a line
     * three cells long.
     */
    expect(crossedAt({ x: -4, y: 0, z: 3 }, { x: 0, y: 0, z: 3 }, diagonal)).toBeNull()
  })

  test('past the end of the line is not through it', () => {
    const finish = mark({ kind: 'finish', width: 6 })
    // Four cells to the side of a line three cells wide either way.
    expect(crossedAt({ x: 4, y: 0, z: -1 }, { x: 4, y: 0, z: 1 }, finish)).toBeNull()
    expect(crossedAt({ x: 2.9, y: 0, z: -1 }, { x: 2.9, y: 0, z: 1 }, finish)).not.toBeNull()
  })

  test('a body crosses a frame, not a point at its feet', () => {
    // A gate hanging with its bottom edge at head height: walking under it is
    // not going through it.
    const high = mark({ kind: 'finish', y: 6, height: 4 })
    expect(crossedAt({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, high)).toBeNull()

    /**
     * But feet just below the bottom edge *is* through it, because a player is
     * `EYE_HEIGHT` tall and their head is inside the frame. A test on the feet
     * alone would refuse a finish somebody visibly ran through.
     */
    const low = mark({ kind: 'finish', y: 1, height: 4 })
    expect(crossedAt({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, low)).not.toBeNull()
  })

  test('standing on the line does not cross it over and over', () => {
    const start = mark({ kind: 'start' })
    const on = { x: 0, y: 0, z: 0 }
    // Two frames of not moving, exactly on the plane. Without this a player who
    // stopped on their own start line would reset their clock sixty times a
    // second.
    expect(crossedAt(on, on, start)).toBeNull()
  })

  test('both lines in one frame come back in the order they were met', () => {
    const marks = [
      mark({ kind: 'finish', z: 6 }),
      mark({ kind: 'start', z: 0 }),
    ]
    const met = crossings({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 9 }, marks)
    expect(met.map((c) => c.kind)).toEqual(['start', 'finish'])
  })
})

describe('the clock', () => {
  const COURSE: Mark[] = [mark({ kind: 'start' }), mark({ kind: 'finish', z: 20 })]

  /** Walk `by` cells along +z over one frame, and step the clock. */
  function walk(run: ReturnType<typeof stepRun>, from: number, by: number, delta = FRAME) {
    return stepRun(run, COURSE, {
      from: { x: 0, y: 0, z: from },
      to: { x: 0, y: 0, z: from + by },
      delta,
    })
  }

  test('nothing runs until the start is crossed', () => {
    const before = walk(NO_RUN, -5, 1)
    expect(before.phase).toBe('waiting')
    expect(before.time).toBe(0)
  })

  test('a finish nobody started is not a result', () => {
    // Walking backwards through the finish line, which on a course whose finish
    // is reachable on foot is a thing people do while looking around.
    const back = stepRun(NO_RUN, COURSE, {
      from: { x: 0, y: 0, z: 21 },
      to: { x: 0, y: 0, z: 19 },
      delta: FRAME,
    })
    expect(back.phase).toBe('waiting')
    expect(back.finishes).toBe(0)
    expect(back.best).toBeNull()
  })

  test('the clock starts at the line rather than at the top of the frame', () => {
    // Crossing a quarter of the way through the frame leaves three quarters of
    // it on the clock. At 60fps the difference is 12ms - more than the gap
    // between two people racing the same course.
    const started = walk(NO_RUN, -0.25, 1)
    expect(started.phase).toBe('running')
    expect(started.time).toBeCloseTo(FRAME * 0.75, 9)
  })

  test('and stops at the line rather than at the end of the frame', () => {
    let run = walk(NO_RUN, -1, 1)
    expect(run.phase).toBe('running')

    // Straight to just short of the finish, one frame at a time.
    run = stepRun(run, COURSE, {
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 19.5 },
      delta: FRAME,
    })
    const running = run.time

    // A frame that carries them half a cell past a line half a cell away: the
    // clock takes half of it, not all of it.
    run = stepRun(run, COURSE, {
      from: { x: 0, y: 0, z: 19.5 },
      to: { x: 0, y: 0, z: 20.5 },
      delta: FRAME,
    })
    expect(run.phase).toBe('finished')
    expect(run.time).toBeCloseTo(running + FRAME * 0.5, 9)
    expect(run.finishes).toBe(1)
    expect(run.best).toBe(run.time)
  })

  test('the clock keeps counting between the lines', () => {
    // Crossed halfway through the first frame, so half of that frame and all of
    // the sixty after it.
    let run = walk(NO_RUN, -1, 2)
    for (let i = 0; i < 60; i++) run = walk(run, 5, 0.01)
    expect(run.phase).toBe('running')
    expect(run.time).toBeCloseTo(FRAME * 60.5, 6)
  })

  test('crossing the start again is a new run, not a longer one', () => {
    let run = walk(NO_RUN, -1, 2)
    for (let i = 0; i < 30; i++) run = walk(run, 5, 0.01)
    expect(run.time).toBeGreaterThan(0.4)

    /**
     * Which is what makes a death on a course cost the run without needing a
     * rule for it: `world.restart` puts you back behind the line and the walk
     * over it is an ordinary crossing.
     */
    run = walk(run, -1, 2)
    expect(run.phase).toBe('running')
    expect(run.time).toBeCloseTo(FRAME * 0.5, 9)
  })

  test('a start and a finish in the same frame is a run, in that order', () => {
    // Twenty-odd cells in one step, which is what a fall or a launch looks like.
    const run = stepRun(NO_RUN, COURSE, {
      from: { x: 0, y: 0, z: -1 },
      to: { x: 0, y: 0, z: 21 },
      delta: SLOW_FRAME,
    })
    expect(run.phase).toBe('finished')
    expect(run.finishes).toBe(1)
    // Started at t = 1/22 and finished at t = 21/22 of one frame.
    expect(run.time).toBeCloseTo(SLOW_FRAME * (20 / 22), 9)
  })

  test('the best is the fastest run, not the last one', () => {
    let run = walk(NO_RUN, -1, 1)
    for (let i = 0; i < 120; i++) run = walk(run, 5, 0.01)
    run = walk(run, 19.5, 1)
    expect(run.phase).toBe('finished')
    const slow = run.time

    // A second, faster run over the same course.
    run = walk(run, -1, 1)
    run = walk(run, 19.5, 1)
    expect(run.finishes).toBe(2)
    expect(run.time).toBeLessThan(slow)
    expect(run.best).toBe(run.time)

    // And a third, slower one, which must not become the best.
    run = walk(run, -1, 1)
    for (let i = 0; i < 200; i++) run = walk(run, 5, 0.01)
    const best = run.best
    run = walk(run, 19.5, 1)
    expect(run.time).toBeGreaterThan(best!)
    expect(run.best).toBe(best)
  })

  test('being put somewhere is not travelling there', () => {
    /**
     * The bug this guard exists for. A player dies just past the finish and is
     * put back at the spawn; the straight line between the two goes through the
     * finish frame, and timing it as travel hands out a result for dying near
     * the line.
     *
     * The two assertions together are the point: the segment really does cross -
     * so an implementation without the flag would award the run - and the flag
     * is what refuses it.
     */
    let run = walk(NO_RUN, -1, 1)
    expect(run.phase).toBe('running')

    const died = { x: 0, y: 0, z: 21 }
    const spawn = { x: 0, y: 0, z: -1 }

    expect(crossings(died, spawn, COURSE).map((c) => c.kind)).toEqual(['finish', 'start'])

    run = stepRun(run, COURSE, { from: died, to: spawn, delta: FRAME, teleported: true })
    expect(run.phase).toBe('running')
    expect(run.finishes).toBe(0)
    expect(run.best).toBeNull()
  })
})

describe('a course, as shipped', () => {
  const raw = readFileSync(
    path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'xps', 'ladder-run.xp.json'),
    'utf8',
  )
  const parsed = parseXp(JSON.parse(raw))
  if (!parsed.ok) throw new Error('ladder-run does not parse')
  const xp = parsed.document

  test('declares competition and has the marks to back it', () => {
    expect(xp.capabilities).toContain('competition')
    expect(raceReady(xp.world.marks)).toBe(true)
    expect(startMarks(xp.world.marks)).toHaveLength(1)
    expect(finishMarks(xp.world.marks)).toHaveLength(1)
  })

  test('the start line is where a runner leaves the spawn', () => {
    /**
     * Not a tautology about the JSON: `ladder-run` spawns you *on* its start
     * line, so the first step of the course is the crossing that starts the
     * clock. If this stops holding the level still plays and the timer silently
     * never starts, which is the failure worth a test.
     */
    const feet = { x: xp.spawn.x, y: xp.spawn.y, z: xp.spawn.z }
    const stepped = { x: feet.x + 0.5, y: feet.y, z: feet.z }

    const run = stepRun(NO_RUN, xp.world.marks, { from: feet, to: stepped, delta: FRAME })
    expect(run.phase).toBe('running')
  })

  test('the gate at the end stops the clock', () => {
    const [finish] = finishMarks(xp.world.marks)
    // Through it along its own normal - facing 180, so the run is along -z.
    const before = { x: finish.x, y: finish.y, z: finish.z + 1 }
    const after = { x: finish.x, y: finish.y, z: finish.z - 1 }

    let run = stepRun(NO_RUN, xp.world.marks, {
      from: { x: xp.spawn.x, y: xp.spawn.y, z: xp.spawn.z },
      to: { x: xp.spawn.x + 0.5, y: xp.spawn.y, z: xp.spawn.z },
      delta: FRAME,
    })
    run = stepRun(run, xp.world.marks, { from: before, to: after, delta: FRAME })

    expect(run.phase).toBe('finished')
    expect(run.finishes).toBe(1)
  })
})

describe('reading a time', () => {
  test('hundredths, because a course is decided in them', () => {
    expect(formatRunTime(12.4)).toBe('12.40')
    expect(formatRunTime(12.409)).toBe('12.41')
    expect(formatRunTime(0)).toBe('0.00')
  })

  test('minutes only once there are any, and padded when there are', () => {
    expect(formatRunTime(59.99)).toBe('59.99')
    expect(formatRunTime(62.4)).toBe('1:02.40')
    expect(formatRunTime(3600 + 61.5)).toBe('61:01.50')
  })

  test('a run that rounds up to the next minute reads as the next minute', () => {
    // This read `1:60.00` until ./race-record went looking: the minutes were
    // floored off the raw seconds and the remainder rounded afterwards, so a
    // clock could show sixty seconds. Found by asserting that the time stored
    // and the time shown are the same reading.
    expect(formatRunTime(119.999)).toBe('2:00.00')
    expect(formatRunTime(59.999)).toBe('1:00.00')
    expect(formatRunTime(3599.996)).toBe('60:00.00')
  })

  test('a negative clock reads as zero rather than as minus one', () => {
    // Nothing should produce one; a readout showing `-0.00` would be a bug
    // report about the clock rather than about whatever caused it.
    expect(formatRunTime(-1)).toBe('0.00')
  })
})
