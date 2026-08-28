import { describe, expect, test } from 'bun:test'
import {
  applyDamage,
  canDash,
  canKick,
  DASH_COOLDOWN,
  DASH_DAMAGE_MAX,
  DASH_DAMAGE_MIN,
  DASH_DURATION,
  DASH_HIT_HEIGHT,
  DASH_HIT_RADIUS,
  dashConnects,
  isDown,
  KICK_COOLDOWN,
  KICK_HIT_HEIGHT,
  KICK_IMPULSE,
  KICK_LUNGE_DURATION,
  KICK_LUNGE_REACH,
  KICK_RANGE,
  kickConnects,
  kickLunge,
  knockbackFalloff,
  LAVA_DAMAGE,
  LAVA_INTERVAL,
  MAX_HEALTH,
  type Point3,
  rollDamage,
  sanitiseDamage,
  sanitiseImpulse,
  startDash,
  tickDash,
  tickKick,
  tickLava,
} from '@/app/world/lounge/_sim/combat'

const ORIGIN: Point3 = { x: 0, y: 0, z: 0 }

function at(x: number, y: number, z: number): Point3 {
  return { x, y, z }
}

describe('rollDamage', () => {
  test('never leaves the advertised 10-30 band', () => {
    for (let i = 0; i < 500; i++) {
      const damage = rollDamage()
      expect(damage).toBeGreaterThanOrEqual(DASH_DAMAGE_MIN)
      expect(damage).toBeLessThanOrEqual(DASH_DAMAGE_MAX)
    }
  })

  test('reaches both ends of the band', () => {
    // The classic off-by-one is an unreachable maximum, so both extremes are
    // asserted rather than just the range.
    expect(rollDamage(() => 0)).toBe(DASH_DAMAGE_MIN)
    expect(rollDamage(() => 0.9999999)).toBe(DASH_DAMAGE_MAX)
  })

  test('is whole numbers, so the HUD never shows 17.4%', () => {
    for (let i = 0; i < 100; i++) {
      expect(Number.isInteger(rollDamage())).toBe(true)
    }
  })
})

describe('sanitiseDamage', () => {
  test('clamps a hostile or broken packet into the band', () => {
    expect(sanitiseDamage(9999)).toBe(DASH_DAMAGE_MAX)
    expect(sanitiseDamage(-5)).toBe(DASH_DAMAGE_MIN)
    expect(sanitiseDamage(Number.NaN)).toBe(DASH_DAMAGE_MIN)
  })

  test('leaves an honest roll alone', () => {
    expect(sanitiseDamage(23)).toBe(23)
  })
})

describe('applyDamage', () => {
  test('takes the damage off', () => {
    expect(applyDamage(MAX_HEALTH, 30)).toBe(70)
  })

  test('floors at zero rather than going negative', () => {
    expect(applyDamage(12, 30)).toBe(0)
    expect(isDown(applyDamage(12, 30))).toBe(true)
  })

  test('three maximum hits are not enough to finish a full-health player', () => {
    // 30% a hit means four connections minimum, which is what makes the fight
    // last long enough for the other player to do something about it.
    let health = MAX_HEALTH
    for (let i = 0; i < 3; i++) health = applyDamage(health, DASH_DAMAGE_MAX)
    expect(isDown(health)).toBe(false)
    expect(health).toBe(10)
  })
})

describe('dashConnects', () => {
  test('hits somebody standing in the path', () => {
    expect(dashConnects(ORIGIN, at(0, 0, 6), at(0, 0, 3))).toBe(true)
  })

  test('misses somebody standing well to the side', () => {
    expect(dashConnects(ORIGIN, at(0, 0, 6), at(4, 0, 3))).toBe(false)
  })

  test('misses somebody behind you', () => {
    // Clamped to the segment: a body behind the start is not on an extension
    // of the line, so charging away from someone must not hit them.
    expect(dashConnects(ORIGIN, at(0, 0, 6), at(0, 0, -3))).toBe(false)
  })

  test('respects the radius at its edge', () => {
    expect(dashConnects(ORIGIN, at(0, 0, 6), at(DASH_HIT_RADIUS - 0.01, 0, 3))).toBe(true)
    expect(dashConnects(ORIGIN, at(0, 0, 6), at(DASH_HIT_RADIUS + 0.01, 0, 3))).toBe(false)
  })

  test('goes under somebody standing on a tower', () => {
    expect(dashConnects(ORIGIN, at(0, 0, 6), at(0, DASH_HIT_HEIGHT + 0.5, 3))).toBe(false)
  })

  test('connects across a long frame that skipped over the target', () => {
    // The reason the test is swept and not a point check: at 26 blocks/second a
    // 20fps frame covers 1.3 blocks, and a point test at each end of that step
    // would report a clean miss on somebody standing in the middle of it.
    const from = at(0, 0, 0)
    const to = at(0, 0, 1.3)
    const victim = at(0, 0, 0.65)

    expect(dashConnects(from, to, victim)).toBe(true)
    // Sanity: neither endpoint alone is within reach on the *sweep axis*, which
    // is what a naive implementation would have compared.
    expect(Math.abs(victim.z - from.z)).toBeLessThan(DASH_HIT_RADIUS)
  })

  test('a stationary dash still hits what it is standing in', () => {
    // lengthSq of zero must not divide by zero and must not miss.
    expect(dashConnects(ORIGIN, ORIGIN, at(0.5, 0, 0.5))).toBe(true)
  })
})

describe('dash timers', () => {
  test('a fresh dash is lunging and on cooldown at once', () => {
    const timers = startDash()
    expect(timers.remaining).toBe(DASH_DURATION)
    expect(timers.cooldown).toBe(DASH_COOLDOWN)
  })

  test('the cooldown outlasts the lunge', () => {
    // Otherwise the next dash is available before the current one has finished
    // and the two overlap.
    expect(DASH_COOLDOWN).toBeGreaterThan(DASH_DURATION)
  })

  test('ticks down and stops at zero rather than going negative', () => {
    let timers = startDash()
    for (let i = 0; i < 200; i++) timers = tickDash(timers, 1 / 60)
    expect(timers.remaining).toBe(0)
    expect(timers.cooldown).toBe(0)
  })

  test('refuses a second dash while cooling down', () => {
    const timers = startDash()
    expect(canDash(timers, MAX_HEALTH)).toBe(false)
    expect(canDash(tickDash(timers, DASH_COOLDOWN), MAX_HEALTH)).toBe(true)
  })

  test('the dead do not dash', () => {
    expect(canDash({ remaining: 0, cooldown: 0 }, 0)).toBe(false)
  })
})

describe('kickConnects', () => {
  /** Facing +z, which is what `at(0, 0, positive)` is in front of. */
  const AHEAD = { x: 0, z: 1 }

  test('somebody standing in front, in range, is kicked', () => {
    expect(kickConnects(ORIGIN, AHEAD, at(0, 0, 1.5))).toBe(true)
  })

  test('somebody behind is not', () => {
    expect(kickConnects(ORIGIN, AHEAD, at(0, 0, -1.5))).toBe(false)
  })

  test('somebody beyond the range is not', () => {
    expect(kickConnects(ORIGIN, AHEAD, at(0, 0, KICK_RANGE + 0.1))).toBe(false)
  })

  test('somebody at right angles is outside the arc', () => {
    expect(kickConnects(ORIGIN, AHEAD, at(1.5, 0, 0))).toBe(false)
  })

  test('somebody off to one side but still in front is caught', () => {
    // About 30 degrees off the heading, comfortably inside the cone.
    expect(kickConnects(ORIGIN, AHEAD, at(0.8, 0, 1.4))).toBe(true)
  })

  test('somebody on a roof overhead is out of reach', () => {
    expect(kickConnects(ORIGIN, AHEAD, at(0, KICK_HIT_HEIGHT + 0.1, 1))).toBe(false)
  })

  test('standing inside somebody counts, with no division by zero', () => {
    expect(kickConnects(ORIGIN, AHEAD, at(0, 0, 0))).toBe(true)
  })
})

describe('knockback', () => {
  test('decays toward nothing rather than reversing', () => {
    let speed = KICK_IMPULSE
    for (let i = 0; i < 200; i++) speed *= knockbackFalloff(1 / 60)
    expect(speed).toBeGreaterThan(0)
    expect(speed).toBeLessThan(0.01)
  })

  test('is mostly spent within half a second', () => {
    expect(KICK_IMPULSE * knockbackFalloff(0.5)).toBeLessThan(KICK_IMPULSE * 0.1)
  })

  test('the same elapsed time costs the same however it is split', () => {
    const whole = knockbackFalloff(0.2)
    const halves = knockbackFalloff(0.1) * knockbackFalloff(0.1)
    expect(halves).toBeCloseTo(whole, 10)
  })
})

describe('sanitiseImpulse', () => {
  test('passes an honest shove through', () => {
    expect(sanitiseImpulse(4.2, KICK_IMPULSE)).toBe(4.2)
  })

  test('clamps a launch to the limit, both ways', () => {
    expect(sanitiseImpulse(9999, KICK_IMPULSE)).toBe(KICK_IMPULSE)
    expect(sanitiseImpulse(-9999, KICK_IMPULSE)).toBe(-KICK_IMPULSE)
  })

  /**
   * The one that matters. A NaN in a position is not a bad frame, it is a
   * character controller that never works again - every comparison against it
   * is false, so nothing ever collides and nothing ever lands.
   */
  test('anything that is not a number becomes no push at all', () => {
    expect(sanitiseImpulse(NaN, KICK_IMPULSE)).toBe(0)
    expect(sanitiseImpulse(Infinity, KICK_IMPULSE)).toBe(0)
    expect(sanitiseImpulse(-Infinity, KICK_IMPULSE)).toBe(0)
  })
})

describe('kick timing', () => {
  test('one kick, then a wait', () => {
    expect(canKick(0, MAX_HEALTH)).toBe(true)
    expect(canKick(KICK_COOLDOWN, MAX_HEALTH)).toBe(false)
    expect(canKick(tickKick(KICK_COOLDOWN, KICK_COOLDOWN), MAX_HEALTH)).toBe(true)
  })

  test('the cooldown stops at zero rather than going negative', () => {
    let cooldown = KICK_COOLDOWN
    for (let i = 0; i < 300; i++) cooldown = tickKick(cooldown, 1 / 60)
    expect(cooldown).toBe(0)
  })

  test('the dead do not kick', () => {
    expect(canKick(0, 0)).toBe(false)
  })
})

describe('the kick lunge', () => {
  test('starts and ends where the body already was', () => {
    expect(kickLunge(0)).toBe(0)
    expect(kickLunge(KICK_LUNGE_DURATION)).toBe(0)
    // Parked past the end, which is how a scene with no live kick asks.
    expect(kickLunge(KICK_LUNGE_DURATION * 4)).toBe(0)
    // And before one was ever thrown.
    expect(kickLunge(-1)).toBe(0)
  })

  test('goes out fast and comes back slower', () => {
    const step = KICK_LUNGE_DURATION / 2000

    // When it first passes half its reach on the way out, and when it drops
    // back under half on the way home.
    let rose = 0
    let fell = 0
    for (let t = 0; t < KICK_LUNGE_DURATION; t += step) {
      const push = kickLunge(t)
      if (!rose && push >= KICK_LUNGE_REACH / 2) rose = t
      if (rose && !fell && push < KICK_LUNGE_REACH / 2) fell = t
    }

    const peak = kickLunge(KICK_LUNGE_DURATION * 0.35)
    expect(peak).toBeCloseTo(KICK_LUNGE_REACH, 5)

    // The way out is the short half of the move - the push has to land before
    // it lets go, or it reads as a lean rather than as a kick.
    expect(rose).toBeGreaterThan(0)
    expect(fell - KICK_LUNGE_DURATION * 0.35).toBeGreaterThan(rose * 2)
  })

  test('never reaches further than the lunge is allowed to', () => {
    for (let t = 0; t <= KICK_LUNGE_DURATION; t += 1 / 240) {
      const push = kickLunge(t)
      expect(push).toBeGreaterThanOrEqual(0)
      expect(push).toBeLessThanOrEqual(KICK_LUNGE_REACH)
    }
  })

  test('the return is monotonic - no wobble on the way back', () => {
    let previous = KICK_LUNGE_REACH
    for (let t = KICK_LUNGE_DURATION * 0.35; t < KICK_LUNGE_DURATION; t += 1 / 240) {
      const push = kickLunge(t)
      expect(push).toBeLessThanOrEqual(previous + 1e-9)
      previous = push
    }
  })
})

describe('standing in lava', () => {
  test('the first frame in the fire bills immediately', () => {
    const burn = tickLava(LAVA_INTERVAL, 1 / 60, true)
    expect(burn.damage).toBe(LAVA_DAMAGE)
  })

  test('billed once an interval, not once a frame', () => {
    let elapsed = LAVA_INTERVAL
    let total = 0
    // One second at 60fps.
    for (let i = 0; i < 60; i++) {
      const burn = tickLava(elapsed, 1 / 60, true)
      elapsed = burn.elapsed
      total += burn.damage
    }
    /**
     * Around one per interval, plus the tick on entry - and nowhere near the
     * sixty a per-frame burn would have charged. Bounded rather than exact
     * because where the last tick falls depends on the frame boundary.
     */
    expect(total).toBeGreaterThanOrEqual(2 * LAVA_DAMAGE)
    expect(total).toBeLessThanOrEqual(3 * LAVA_DAMAGE)
  })

  test('the burn rate does not depend on the framerate', () => {
    function burnOver(seconds: number, fps: number): number {
      let elapsed = LAVA_INTERVAL
      let total = 0
      for (let i = 0; i < seconds * fps; i++) {
        const burn = tickLava(elapsed, 1 / fps, true)
        elapsed = burn.elapsed
        total += burn.damage
      }
      return total
    }
    expect(burnOver(4, 144)).toBe(burnOver(4, 30))
  })

  test('a long frame is billed for every interval it covers', () => {
    const burn = tickLava(0, 2, true)
    expect(burn.damage).toBe(LAVA_DAMAGE * (2 / LAVA_INTERVAL))
  })

  test('stepping out stops the clock, and stepping back in starts it again', () => {
    const out = tickLava(0.4, 1 / 60, false)
    expect(out.damage).toBe(0)
    expect(tickLava(out.elapsed, 1 / 60, true).damage).toBe(LAVA_DAMAGE)
  })

  /**
   * The window, from both sides.
   *
   * A lower bound because a hazard that kills before anybody can react is a
   * hazard people file as a bug, and an upper one because fifty seconds of
   * grace - which is what one point a tick bought - meant lava was something to
   * walk through rather than around. Both numbers are the design, so both are
   * asserted: this fails if somebody makes it instant *or* makes it toothless.
   */
  test('is survivable if you move, and fatal if you do not', () => {
    const seconds = (MAX_HEALTH / LAVA_DAMAGE) * LAVA_INTERVAL
    expect(seconds).toBeGreaterThan(1)
    expect(seconds).toBeLessThan(6)
  })

  test('one hop through costs a fifth of a bar, not a life', () => {
    expect(LAVA_DAMAGE).toBeLessThan(MAX_HEALTH / 4)
  })
})
