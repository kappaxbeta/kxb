import { describe, expect, test } from 'bun:test'
import type { Action } from '@/domain/studio/action'
import {
  actionsFromTake,
  applyTake,
  DEFAULT_TOLERANCE,
  type Intent,
  type Puppet,
  PUPPET_RUN,
  PUPPET_WALK,
  type Sample,
  simplify,
  STILL_INTENT,
  stepPuppet,
  type Take,
} from '@/domain/studio/puppet'
import { DEFAULT_ACTOR, DEFAULT_SHOT, sceneAt, type ShotSpec } from '@/domain/studio/shot'

/**
 * Driving an animal around, and what is left of it afterwards.
 *
 * The interesting question is not whether the reduction is small - that is easy
 * and useless on its own, since deleting everything is the smallest answer of
 * all. It is whether the *reduced* timeline still puts the animal where the
 * performance put them. So the load-bearing test here replays the resulting
 * shot through `sceneAt` and compares it against the samples that went in.
 *
 * Which is the only way this can be checked at all: a take is a keyboard and a
 * frame loop, neither of which exists in a test, so what is tested is the pure
 * function between what the keyboard produced and what the timeline says.
 */

/** A straight walk along +x, sampled at 20Hz, four blocks over two seconds. */
function straight(): Sample[] {
  const samples: Sample[] = []
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 20
    samples.push({ t, x: t * 2, z: 0 })
  }
  return samples
}

function takeOf(path: Sample[], events: Action[] = []): Take {
  return {
    start: path[0]?.t ?? 0,
    end: path[path.length - 1]?.t ?? 0,
    from: { x: path[0]?.x ?? 0, z: path[0]?.z ?? 0 },
    path,
    events,
  }
}

// ---------------------------------------------------------------------------

describe('driving', () => {
  const still: Puppet = { x: 0, z: 0, heading: 0, distance: 0, speed: 0 }
  const push = (fields: Partial<Intent>): Intent => ({ ...STILL_INTENT, ...fields })

  test('does not move an animal nobody is pushing', () => {
    const next = stepPuppet({ ...still, heading: 45 }, STILL_INTENT, 1, 0)
    expect(next.x).toBe(0)
    expect(next.z).toBe(0)
    expect(next.speed).toBe(0)
    // And it keeps facing where it was walking rather than snapping to zero.
    expect(next.heading).toBe(45)
  })

  test('walks away from the camera when pushed forward', () => {
    // Azimuth 0 is a camera looking along +z, so forward is +z.
    const next = stepPuppet(still, push({ forward: 1 }), 1, 0)
    expect(next.z).toBeCloseTo(PUPPET_WALK)
    expect(next.x).toBeCloseTo(0)
  })

  test('follows the camera round rather than the world axes', () => {
    // The whole reason the azimuth is passed in: the same key, with the camera
    // turned a quarter, has to send them a quarter turn round too.
    const next = stepPuppet(still, push({ forward: 1 }), 1, 90)
    expect(next.x).toBeCloseTo(PUPPET_WALK)
    expect(next.z).toBeCloseTo(0)
  })

  test('does not let a diagonal outrun a straight line', () => {
    const straight = stepPuppet(still, push({ forward: 1 }), 1, 0)
    const diagonal = stepPuppet(still, push({ forward: 1, strafe: 1 }), 1, 0)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(
      Math.hypot(straight.x, straight.z),
    )
  })

  test('runs when asked, and records it as a run', () => {
    const next = stepPuppet(still, push({ forward: 1, run: true }), 1, 0)
    expect(next.speed).toBeCloseTo(PUPPET_RUN)
  })

  test('walks at half pace on a stick pushed half way', () => {
    // A keyboard can only ever say 1, so this is the analog case: normalising
    // outright would turn every gentle push into a full-speed walk.
    const next = stepPuppet(still, push({ forward: 0.5 }), 1, 0)
    expect(next.speed).toBeCloseTo(PUPPET_WALK * 0.5)
  })

  test('faces the way it is going', () => {
    expect(stepPuppet(still, push({ strafe: 1 }), 1, 0).heading).toBeCloseTo(90)
    expect(stepPuppet(still, push({ forward: -1 }), 1, 0).heading).toBeCloseTo(180)
  })

  test('counts the ground covered, for the walk cycle', () => {
    let state = still
    for (let i = 0; i < 10; i += 1) state = stepPuppet(state, push({ forward: 1 }), 0.1, 0)
    expect(state.distance).toBeCloseTo(PUPPET_WALK)
  })

  test('survives a frame of no time at all', () => {
    const next = stepPuppet(still, push({ forward: 1 }), 0, 0)
    expect(Number.isFinite(next.x)).toBe(true)
    expect(next.x).toBe(0)
  })
})

describe('reducing a performed path', () => {
  test('keeps the ends, whatever else it throws away', () => {
    const reduced = simplify(straight())
    expect(reduced[0]).toEqual({ t: 0, x: 0, z: 0 })
    expect(reduced[reduced.length - 1]).toEqual({ t: 2, x: 4, z: 0 })
  })

  test('throws away the middle of a straight walk', () => {
    // Forty-one samples describing one leg. Anything more than a handful back
    // is the reduction failing to do its job.
    expect(simplify(straight()).length).toBeLessThan(5)
  })

  test('keeps a corner', () => {
    const path: Sample[] = [
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 2, z: 0 },
      { t: 2, x: 2, z: 2 },
    ]
    expect(simplify(path)).toHaveLength(3)
  })

  test('keeps a pause in the middle of a straight line', () => {
    // The case plain two-dimensional RDP gets wrong: spatially this is one leg,
    // and reading it as one would turn a walk-stop-walk into a slow glide.
    const path: Sample[] = [
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 2, z: 0 },
      { t: 4, x: 2, z: 0 },
      { t: 5, x: 4, z: 0 },
    ]
    expect(simplify(path)).toHaveLength(4)
  })

  test('leaves a path of two points alone', () => {
    const path: Sample[] = [
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 1, z: 1 },
    ]
    expect(simplify(path)).toEqual(path)
  })

  test('survives two samples at the same instant instead of returning NaN', () => {
    const path: Sample[] = [
      { t: 0, x: 0, z: 0 },
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 3, z: 0 },
    ]
    for (const point of simplify(path)) {
      expect(Number.isFinite(point.x)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------

describe('a take, as actions', () => {
  test('becomes one move for one straight walk', () => {
    const actions = actionsFromTake(takeOf(straight()))
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ kind: 'move', t: 0, x: 4, z: 0 })
  })

  test('becomes a move per leg round a corner', () => {
    const path: Sample[] = [
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 3, z: 0 },
      { t: 2, x: 3, z: 3 },
    ]
    const moves = actionsFromTake(takeOf(path))
    expect(moves).toHaveLength(2)
    expect(moves[1]).toMatchObject({ kind: 'move', x: 3, z: 3 })
  })

  test('emits nothing at all for somebody who stood still', () => {
    const path: Sample[] = []
    for (let i = 0; i <= 40; i += 1) path.push({ t: i / 20, x: 1, z: -2 })
    expect(actionsFromTake(takeOf(path))).toEqual([])
  })

  test('does not emit a move for the pause between two walks', () => {
    const path: Sample[] = [
      { t: 0, x: 0, z: 0 },
      { t: 1, x: 2, z: 0 },
      { t: 4, x: 2, z: 0 },
      { t: 5, x: 4, z: 0 },
    ]
    const moves = actionsFromTake(takeOf(path))
    expect(moves).toHaveLength(2)
    // And the second one starts where the pause ended, not where the first
    // move finished - which is what makes the gap a pause rather than a crawl.
    expect(moves[1].t).toBeCloseTo(4)
  })

  test('passes the discrete things through untouched', () => {
    const events: Action[] = [
      { kind: 'jump', t: 1.2, duration: 0.6, air: false },
      { kind: 'talk', t: 2, duration: 2, text: 'Look at this' },
    ]
    const actions = actionsFromTake(takeOf(straight(), events))
    expect(actions).toEqual(expect.arrayContaining(events))
  })

  test('gives back a timeline in order', () => {
    const events: Action[] = [{ kind: 'emote', t: 0.5, duration: 3, emote: 4 }]
    const actions = actionsFromTake(takeOf(straight(), events))
    const times = actions.map((action) => action.t)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
})

// ---------------------------------------------------------------------------

describe('the reduced timeline still puts them where they were driven', () => {
  /** A performed wander: out, a corner, a pause, and back. */
  function wander(): Sample[] {
    const path: Sample[] = []
    const at = (t: number, x: number, z: number) => path.push({ t, x, z })

    for (let i = 0; i <= 30; i += 1) at(i / 20, (i / 20) * 2, 0)
    for (let i = 1; i <= 30; i += 1) at(1.5 + i / 20, 3, (i / 20) * 2)
    for (let i = 1; i <= 20; i += 1) at(3 + i / 20, 3, 3)
    for (let i = 1; i <= 30; i += 1) at(4 + i / 20, 3 - (i / 20) * 2, 3)

    return path
  }

  test('never drifts further from the performance than the tolerance allows', () => {
    const take = takeOf(wander())
    const shot: ShotSpec = {
      ...DEFAULT_SHOT,
      duration: 10,
      cast: [
        {
          ...DEFAULT_ACTOR,
          x: take.from.x,
          z: take.from.z,
          actions: actionsFromTake(take),
        },
      ],
    }

    // The reduction is allowed to cut a corner by up to the tolerance, and the
    // weighted time axis means a little more than that in the worst case. What
    // it is not allowed to do is put them somewhere else entirely.
    let worst = 0
    for (const sample of take.path) {
      const peep = sceneAt(shot, sample.t).peeps[0]
      worst = Math.max(worst, Math.hypot(peep.x - sample.x, peep.z - sample.z))
    }
    expect(worst).toBeLessThan(DEFAULT_TOLERANCE * 2)
  })

  test('leaves them exactly where the take ended', () => {
    const take = takeOf(wander())
    const last = take.path[take.path.length - 1]
    const shot: ShotSpec = {
      ...DEFAULT_SHOT,
      duration: 10,
      cast: [
        { ...DEFAULT_ACTOR, x: take.from.x, z: take.from.z, actions: actionsFromTake(take) },
      ],
    }

    const peep = sceneAt(shot, last.t + 1).peeps[0]
    expect(peep.x).toBeCloseTo(last.x, 1)
    expect(peep.z).toBeCloseTo(last.z, 1)
  })
})

// ---------------------------------------------------------------------------

describe('performing onto an actor who already has a timeline', () => {
  const existing: Action[] = [
    { kind: 'emote', t: 0.5, duration: 1, emote: 3 },
    { kind: 'move', t: 3, duration: 2, x: 9, z: 9 },
    { kind: 'jump', t: 8, duration: 0.6, air: false },
  ]

  const take: Take = {
    start: 2.5,
    end: 6,
    from: { x: 0, z: 0 },
    path: [
      { t: 2.5, x: 0, z: 0 },
      { t: 6, x: 4, z: 0 },
    ],
    events: [],
  }

  test('replaces what was inside the take', () => {
    const actor = applyTake({ ...DEFAULT_ACTOR, actions: existing }, take)
    // The move from 3 to 5 was overlapped and is gone; it must not be reachable
    // by looking for its destination.
    expect(actor.actions.some((action) => action.kind === 'move' && action.x === 9)).toBe(false)
  })

  test('keeps what was outside it, on both sides', () => {
    const actor = applyTake({ ...DEFAULT_ACTOR, actions: existing }, take)
    expect(actor.actions.some((action) => action.kind === 'emote')).toBe(true)
    expect(actor.actions.some((action) => action.kind === 'jump')).toBe(true)
  })

  test('moves the actor home when the take starts at the top of the shot', () => {
    const fromZero: Take = {
      ...take,
      start: 0,
      end: 2,
      path: [
        { t: 0, x: -5, z: 2 },
        { t: 2, x: -1, z: 2 },
      ],
    }
    const actor = applyTake({ ...DEFAULT_ACTOR, x: 0, z: 0, actions: [] }, fromZero)
    expect(actor.x).toBeCloseTo(-5)
    expect(actor.z).toBeCloseTo(2)
  })

  test('leaves home alone when the take starts partway through', () => {
    const actor = applyTake({ ...DEFAULT_ACTOR, x: 7, z: 7, actions: [] }, take)
    expect(actor.x).toBe(7)
    expect(actor.z).toBe(7)
  })
})
