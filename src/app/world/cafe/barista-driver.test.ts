import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { createBarista } from '@/app/world/cafe/barista-driver'
import type { Drift } from '@/app/world/_sim/autopilot'
import {
  type CafeState,
  type Customer,
  initialState,
  interact,
  isWalkable,
  tick,
} from '@kxb/dream-restaurant/game'
import { tileKey, worldToTile } from '@kxb/peepz-world/grid'

/**
 * The driver, run frame by frame against the real kitchen.
 *
 * `barista.test.ts` proves the *decisions* are right by teleporting between
 * squares; this proves the body can actually carry them out - that it paths
 * around the counters, stops close enough to reach, and does not press E sixty
 * times a second. Between them there is no untested gap: the scene adds only a
 * camera.
 */

function seated(order: string, patience = 40, id = 1): Customer {
  return {
    id,
    avatar: 'cat',
    state: 'seated',
    seat: tileKey(0, 3),
    path: [],
    x: 0,
    z: 6,
    rotY: 0,
    order,
    patience,
    eatTimer: 0,
    angry: false,
  }
}

interface Run {
  state: CafeState
  player: THREE.Vector3
  acts: string[]
  /** Frames in which the barista said it had nothing to do. */
  idleFrames: number
  frames: number
}

/**
 * Simulate the scene's frame loop.
 *
 * The one thing the scene does that this does not is call `drift` on the frames
 * where `step` returns false - so `idleFrames` standing in for "would have
 * wandered" is exactly the handover being tested.
 */
function run(
  state: CafeState,
  options: { frames?: number; until?: (state: CafeState) => boolean } = {},
): Run {
  const { frames = 4000, until } = options
  const dt = 1 / 60

  const barista = createBarista()
  const player = new THREE.Vector3(4, EYE_HEIGHT, 4)
  const out: Drift = { yaw: 0, lean: 0 }
  const acts: string[] = []

  let current = state
  let idleFrames = 0
  let i = 0

  for (; i < frames; i++) {
    if (until?.(current)) break

    const working = barista.step(current, player, dt, out, (target) => {
      acts.push(target)
      current = interact(current, target)
    })

    if (!working) idleFrames++
    current = tick(current, dt, () => 0.99)
  }

  return { state: current, player, acts, idleFrames, frames: i }
}

describe('the barista on its feet', () => {
  test('walks the kitchen and serves a burger', () => {
    const start = { ...initialState(), customers: [seated('burger')] }

    const done = run(start, { until: (state) => state.served > 0 })

    expect(done.state.served).toBe(1)
    expect(done.state.coins).toBeGreaterThan(start.coins)

    // It visited the meat crate, the stove, the counter and the customer.
    expect(done.acts).toContain(tileKey(1, 0))
    expect(done.acts).toContain(tileKey(2, 0))
    expect(done.acts).toContain(tileKey(3, 0))
    expect(done.acts).toContain(tileKey(0, 2))
  })

  test('never walks through the furniture', () => {
    const start = { ...initialState(), customers: [seated('burger')] }
    const dt = 1 / 60

    const barista = createBarista()
    const player = new THREE.Vector3(4, EYE_HEIGHT, 4)
    const out: Drift = { yaw: 0, lean: 0 }
    let current = start

    for (let i = 0; i < 3000 && current.served === 0; i++) {
      barista.step(current, player, dt, out, (target) => {
        current = interact(current, target)
      })
      current = tick(current, dt, () => 0.99)

      // The square the body is standing on must always be one a body may
      // stand on. Walking a straight line to the counter would fail this.
      const here = worldToTile(player.x, player.z)
      expect(isWalkable(current, here)).toBe(true)
    }

    expect(current.served).toBe(1)
  })

  test('does not press the button every frame', () => {
    const start = { ...initialState(), customers: [seated('burger')] }
    const done = run(start, { until: (state) => state.served > 0 })

    // Eight interactions get a burger served. Anything close to the frame
    // count means the cooldown is not holding and the kitchen is a blur.
    expect(done.acts.length).toBeLessThan(20)
    expect(done.acts.length).toBeGreaterThan(4)
  })

  test('hands the body back when there is nothing to do', () => {
    // An empty café. Every frame should decline, which is what makes the chef
    // wander instead of standing to attention.
    const quiet = run(initialState(), { frames: 120 })

    expect(quiet.idleFrames).toBe(120)
  })

  test('takes the body back the moment an order lands', () => {
    const busy = run(
      { ...initialState(), customers: [seated('burger')] },
      { frames: 120 },
    )

    // Not a single frame spent idle: there was work from the first one.
    expect(busy.idleFrames).toBe(0)
  })

  test('stands up from wherever the wandering schedule left it', () => {
    const start = { ...initialState(), customers: [seated('burger')] }
    const barista = createBarista()
    // Slumped: the eye is where a sleeping body's would be.
    const player = new THREE.Vector3(4, EYE_HEIGHT - 0.42, 4)
    const out: Drift = { yaw: 0, lean: 0 }

    for (let i = 0; i < 120; i++) {
      barista.step(start, player, 1 / 60, out, () => {})
    }

    expect(player.y).toBeCloseTo(EYE_HEIGHT, 2)
    expect(out.lean).toBe(0)
  })

  test('clears and bins the plate after the customer has gone', () => {
    const start = { ...initialState(), customers: [seated('burger')] }

    const served = run(start, { until: (state) => state.served > 0 })
    const tidied = run(served.state, {
      frames: 6000,
      // `carried` is part of the condition on purpose: without it this stops the
      // moment the plate leaves the table, which is halfway through the chore -
      // the plate is then in the chef's hands and the bin trip never runs.
      until: (state) =>
        state.customers.length === 0 &&
        state.carried === null &&
        [...state.stations.values()].every(
          (station) => !station.items.includes('plate_dirty'),
        ),
    })

    // The table is clear and the chef is not still holding it. There is no sink
    // in the starting café, so the bin is where it ends up.
    expect(tidied.state.carried).toBeNull()
    for (const station of tidied.state.stations.values()) {
      expect(station.items).not.toContain('plate_dirty')
    }
  })
})

describe('getting unstuck', () => {
  /**
   * A café arranged so the planner's first choice is one the rules refuse.
   *
   * A counter already holding a cooked patty looks part-way to a burger, so a
   * second cooked patty gets sent to it - and `canAccept` says no, because two
   * patties and no bun is not on the way to anything. Before the driver could
   * notice, this was a chef pressing E at that counter until the tab was closed.
   * It is the exact shape of the stall in the screenshot.
   */
  function jammed(): CafeState {
    const base = {
      ...initialState(),
      carried: 'patty_cooked',
      customers: [seated('burger')],
    }
    const stations = new Map(base.stations)
    stations.set(tileKey(3, 0), {
      items: ['patty_cooked'],
      progress: 0,
      ready: true,
    })
    return { ...base, stations }
  }

  test('stops working a square that does nothing, and moves on', () => {
    const done = run(jammed(), {
      frames: 2000,
      until: (state) => state.carried === null,
    })

    // Hands free again, which is the thing the stall was preventing - a chef
    // holding something cannot pick anything else up, so one jam froze the
    // whole kitchen.
    expect(done.state.carried).toBeNull()

    // And it gave up on that counter rather than hammering it. A few attempts
    // before the strikes land is expected; hundreds is the bug.
    const atCounter = done.acts.filter((tile) => tile === tileKey(3, 0))
    expect(atCounter.length).toBeLessThanOrEqual(3)
  })

  test('the kitchen keeps running afterwards', () => {
    // Unstick, then carry on and actually serve the customer.
    const done = run(jammed(), { frames: 8000, until: (state) => state.served > 0 })
    expect(done.state.served).toBe(1)
  })

  test('a square that starts working again is forgiven', () => {
    // The bin never refuses, so a burnt patty is binned first time and nothing
    // is ever blocked. Guards against the strike counter leaking across chores.
    const done = run(
      { ...initialState(), carried: 'patty_burnt', customers: [seated('burger')] },
      { frames: 600, until: (state) => state.carried === null },
    )

    expect(done.state.carried).toBeNull()
    expect(done.acts.filter((tile) => tile === tileKey(4, 0)).length).toBe(1)
  })
})

describe('the body is not fought over', () => {
  test('an idle barista leaves the eye alone for the wandering schedule', () => {
    const barista = createBarista()
    // Sitting: the eye is lower than standing height.
    const player = new THREE.Vector3(4, EYE_HEIGHT - 0.3, 4)
    const out: Drift = { yaw: 0, lean: 0 }
    const quiet = initialState()

    for (let i = 0; i < 300; i++) {
      const working = barista.step(quiet, player, 1 / 60, out, () => {})
      expect(working).toBe(false)
    }

    /**
     * Unmoved. `rise` used to run before the "nothing to do" check, so on every
     * idle frame it hauled the eye up to standing height while `drift` pushed it
     * back down - and the body bobbed at sixty frames a second.
     */
    expect(player.y).toBe(EYE_HEIGHT - 0.3)
  })
})
