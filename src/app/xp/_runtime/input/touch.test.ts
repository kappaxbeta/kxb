import { describe, expect, test } from 'bun:test'
import {
  DEAD_ZONE,
  NO_PUSH,
  pushFrom,
  SPRINT_AT,
  SPRINT_KEEP,
  SPRINT_REACH,
  stickAt,
} from '@/app/xp/_runtime/input/touch'
import { movementBasis } from '@/app/xp/_runtime/camera'

/**
 * A thumb on glass, checked without one.
 *
 * The layout needs a phone. The *arithmetic* does not, and it is where the bugs
 * are: a dead zone that eats top speed, an axis flipped so forward walks
 * backwards, a sprint threshold nobody can reach. All four are invisible in a
 * screenshot and all four make a course unfinishable.
 */

const RADIUS = 34

describe('the dead zone', () => {
  test('a thumb resting near the centre asks for nothing', () => {
    // Without it the player drifts slowly in whatever direction they happened
    // to put their thumb down, forever, and it reads as the game being drunk.
    expect(pushFrom(stickAt(2, 2, RADIUS))).toEqual(NO_PUSH)
    expect(pushFrom(stickAt(0, 0, RADIUS))).toEqual(NO_PUSH)
  })

  test('and it costs no top speed', () => {
    /**
     * The half that is easy to get wrong: clamping instead of rescaling would
     * mean the stick's outer edge reported 0.86 rather than 1, so a phone could
     * never quite reach a run - and `ladder-run`'s gaps are laid out against a
     * *sprint* span. The course would simply be unfinishable, with nothing
     * pointing at why.
     */
    const rim = stickAt(RADIUS, 0, RADIUS)
    expect(rim.x).toBeCloseTo(1, 6)
  })

  test('the ramp starts where the dead zone ends, and is continuous', () => {
    // Just outside the zone should be *nearly* nothing, not a jump to a third of
    // the travel - a stick that snaps to a walk the moment it moves is a stick
    // you cannot aim with.
    const justOut = stickAt(RADIUS * (DEAD_ZONE + 0.01), 0, RADIUS)
    expect(justOut.x).toBeGreaterThan(0)
    expect(justOut.x).toBeLessThan(0.05)
  })

  test('a stick pushed past its ring does not report more than full', () => {
    // A thumb slides outside the ring constantly; the zone is deliberately
    // bigger than the ring it draws.
    const past = stickAt(RADIUS * 3, 0, RADIUS)
    expect(past.x).toBeCloseTo(1, 6)
    // But how far past is kept, unclamped - it is the whole of what a thumb has
    // left to say with once the walk has run out of travel.
    expect(past.reach).toBeCloseTo(3, 6)
  })

  test('a stick with no size reports nothing rather than dividing by zero', () => {
    // Happens for a frame during layout, and a NaN here is a player walking to
    // NaN, which the controller cannot recover from.
    expect(stickAt(10, 10, 0)).toEqual({ x: 0, y: 0, reach: 0 })
  })
})

describe('what the stick asks for', () => {
  test('up is forward, which is the one axis that flips', () => {
    /**
     * Screen down is positive Y and forward is up. Getting this backwards is a
     * game where the stick walks you away from where you pushed it - the single
     * most immediately broken thing a control can do, and a one-character bug.
     */
    const up = pushFrom(stickAt(0, -RADIUS, RADIUS))
    expect(up.inputZ).toBeCloseTo(1, 6)

    const down = pushFrom(stickAt(0, RADIUS, RADIUS))
    expect(down.inputZ).toBeCloseTo(-1, 6)
  })

  test('right is right', () => {
    expect(pushFrom(stickAt(RADIUS, 0, RADIUS)).inputX).toBeCloseTo(1, 6)
    expect(pushFrom(stickAt(-RADIUS, 0, RADIUS)).inputX).toBeCloseTo(-1, 6)
  })

  test('a physical stick sprints at its own rim, because it has nothing past one', () => {
    // The gamepad's threshold, which is the default: a VR thumbstick's axes
    // stop at 1, so sprint has to live inside the travel or be unreachable.
    const walk = pushFrom(stickAt(0.5, 0, 1))
    expect(walk.sprint).toBe(false)

    const run = pushFrom(stickAt(1, 0, 1))
    expect(run.sprint).toBe(true)

    expect(SPRINT_AT).toBeGreaterThan(0.7)
  })

  test('a released stick asks for nothing at all', () => {
    expect(pushFrom({ x: 0, y: 0, reach: 0 })).toEqual(NO_PUSH)
  })
})

describe('the stick goes through the same basis the keys do', () => {
  test('a side-on level moves along its axis, not into the screen', () => {
    /**
     * The reason this file produces `inputX`/`inputZ` rather than a direction.
     *
     * `_runtime/camera.ts` exists because a side-on level's forward is a world
     * axis rather than a look direction. A touch path that computed its own
     * movement would reintroduce that exact bug on the devices least able to
     * work around it - and it would be found last, because nobody develops on a
     * phone.
     *
     * Pushing the stick *right* on a side-on course has to walk along the
     * course, and pushing it *up* has to do nothing at all, exactly as `D` and
     * `W` do.
     */
    const side = { kind: 'side', axis: 'x' } as const
    const basis = movementBasis(side, { x: 0, z: -1 })

    const right = pushFrom(stickAt(RADIUS, 0, RADIUS))
    const moveX = basis.forwardX * right.inputZ + basis.rightX * right.inputX
    const moveZ = basis.forwardZ * right.inputZ + basis.rightZ * right.inputX
    expect(moveX).toBeCloseTo(1, 6)
    expect(moveZ).toBeCloseTo(0, 6)

    const up = pushFrom(stickAt(0, -RADIUS, RADIUS))
    const intoScreenX = basis.forwardX * up.inputZ + basis.rightX * up.inputX
    const intoScreenZ = basis.forwardZ * up.inputZ + basis.rightZ * up.inputX
    expect(Math.hypot(intoScreenX, intoScreenZ)).toBeCloseTo(0, 6)
  })

  test('and a follow camera walks where you are looking, as it always did', () => {
    // The other half of the pair, so the test above cannot pass for a basis
    // that ignores the stick entirely.
    const basis = movementBasis({ kind: 'follow' }, { x: 0, z: -1 })
    const up = pushFrom(stickAt(0, -RADIUS, RADIUS))
    const moveZ = basis.forwardZ * up.inputZ + basis.rightZ * up.inputX
    expect(moveZ).toBeCloseTo(-1, 6)
  })
})

describe('and the throw is a curve, not a ramp', () => {
  /**
   * *"The mobile control is a bit sensitive."* Linear meant a quarter of the way
   * out was a quarter of full speed, so the smallest deliberate nudge walked you
   * off the square you were lining up. The complaint is about the first few
   * millimetres, never the top speed.
   */
  test('full deflection is still full speed', () => {
    const stick = stickAt(0, 40, 40)
    expect(Math.hypot(stick.x, stick.y)).toBeCloseTo(1, 5)
  })

  test('and half a throw is a quarter of it, which is where a thumb lives', () => {
    // Half the *usable* travel, measured past the dead zone so the number is
    // about the curve rather than about where the curve starts.
    const half = DEAD_ZONE + (1 - DEAD_ZONE) / 2
    const stick = stickAt(0, half * 40, 40)
    expect(Math.hypot(stick.x, stick.y)).toBeCloseTo(0.25, 5)
  })

  test('and the direction is untouched, because only the magnitude was eased', () => {
    const stick = stickAt(30, 30, 60)
    expect(stick.x).toBeCloseTo(stick.y, 9)
  })
})

/**
 * Running, on a phone.
 *
 * *"Moving too fast on mobile"*, and *"fine on desktop"* - which is exactly the
 * shape of a sprint you fall into rather than choose. Sprint used to read the
 * same clamped 0..1 the walk does, so an ordinary firm push was already full
 * deflection and therefore already a run, and any thumb that slid past the rim
 * was pinned there. On a desk you have to decide to hold Shift.
 *
 * So the walk owns the whole ring and running lives past it. These are the four
 * things that has to mean.
 */
describe('and running is a reach past the ring, not the end of the walk', () => {
  test('full deflection is a walk, exactly as W is', () => {
    // The number the report is about: a thumb at the edge of the stick's travel
    // asks for walking pace, which is what the keyboard asks for.
    const rim = pushFrom(stickAt(RADIUS, 0, RADIUS), SPRINT_REACH)
    expect(Math.abs(rim.inputX)).toBeCloseTo(1, 6)
    expect(rim.sprint).toBe(false)
  })

  test('and a thumb that slips a little past it is still a walk', () => {
    // The common case, and the one that made every phone player sprint: the
    // touch zone is deliberately wider than the ring, so a thumb sits outside
    // the radius most of the time it is being used at all.
    const over = pushFrom(stickAt(RADIUS * 1.2, 0, RADIUS), SPRINT_REACH)
    expect(over.sprint).toBe(false)
  })

  test('a deliberate stretch past the drawn rim runs', () => {
    const run = pushFrom(stickAt(RADIUS * SPRINT_REACH, 0, RADIUS), SPRINT_REACH)
    expect(run.sprint).toBe(true)
    // And it is still only walking pace's worth of *direction* - the extra
    // speed is the controller's to apply, not a longer vector.
    expect(Math.abs(run.inputX)).toBeCloseTo(1, 6)
  })

  test('and it holds on through the wobble that would otherwise flicker it', () => {
    /**
     * The latch. A thumb held at the threshold crosses it back and forth with
     * every tremor, and without the lower release the player alternates between
     * 7 and 13 cells a second - which reads as the frame rate stuttering rather
     * than as a control obeying a finger.
     */
    expect(SPRINT_KEEP).toBeLessThan(SPRINT_REACH)

    const wobble = stickAt(RADIUS * (SPRINT_REACH - 0.1), 0, RADIUS)
    // Already running, so the lower threshold applies and it stays running.
    expect(pushFrom(wobble, SPRINT_KEEP).sprint).toBe(true)
    // Not running yet, so the same position does not start one.
    expect(pushFrom(wobble, SPRINT_REACH).sprint).toBe(false)

    // Letting go properly does stop it, even on the lower threshold.
    const back = stickAt(RADIUS * 0.9, 0, RADIUS)
    expect(pushFrom(back, SPRINT_KEEP).sprint).toBe(false)
  })

  test('and a thumb resting far out but inside the dead zone is not running on the spot', () => {
    // `radius` can be tiny for a frame during layout, which makes an ordinary
    // resting thumb's reach enormous while the stick still asks for nothing.
    // Sprinting while asking to go nowhere is a state the walk cycle sticks in.
    const resting = { x: 0, y: 0, reach: 12 }
    expect(pushFrom(resting, SPRINT_REACH).sprint).toBe(false)
  })
})
