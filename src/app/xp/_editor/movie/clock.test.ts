import { describe, expect, test } from 'bun:test'
import { movieClock } from './clock'

/**
 * The playhead's own rules, which are the ones nothing on screen can show you.
 *
 * A loop that drifts a frame slower every pass is invisible for the first ten
 * and obvious after a minute, and by then it looks like the animation is wrong
 * rather than the clock.
 */
describe('the playhead', () => {
  test('runs to the end and stops there', () => {
    const clock = movieClock()
    clock.play()
    expect(clock.advance(0.05, 0.08)).toBe('running')
    expect(clock.advance(0.05, 0.08)).toBe('ended')
    expect(clock.at()).toBe(0.08)
    expect(clock.running()).toBe(false)
  })

  test('a paused clock does not move', () => {
    const clock = movieClock()
    expect(clock.advance(0.05, 10)).toBe('still')
    expect(clock.at()).toBe(0)
  })

  test('a long delta is clamped, so a backgrounded tab does not fast-forward', () => {
    const clock = movieClock()
    clock.play()
    clock.advance(5, 100)
    expect(clock.at()).toBeCloseTo(0.1, 5)
  })

  test('scrubbing always pauses', () => {
    const clock = movieClock()
    clock.play()
    clock.seek(3)
    expect(clock.running()).toBe(false)
    expect(clock.at()).toBe(3)
  })
})

describe('cycling a stretch', () => {
  const looping = (from: number, to: number) => {
    const clock = movieClock()
    clock.seek(from)
    clock.play()
    return { clock, loop: { from, to } }
  }

  test('never ends, however long it runs', () => {
    const { clock, loop } = looping(1, 2)
    for (let i = 0; i < 200; i += 1) {
      expect(clock.advance(0.05, 8, loop)).toBe('running')
    }
    expect(clock.running()).toBe(true)
  })

  test('stays inside the stretch', () => {
    const { clock, loop } = looping(1, 2)
    for (let i = 0; i < 200; i += 1) {
      clock.advance(0.05, 8, loop)
      expect(clock.at()).toBeGreaterThanOrEqual(1)
      expect(clock.at()).toBeLessThan(2)
    }
  })

  test('wraps by the overshoot, so the cycle keeps its timing', () => {
    /*
     * 1.95 plus a tick of 0.1 is 2.05, which is 0.05 past the end of a
     * one-second stretch - so it lands 0.05 past the start, not *at* it. A lap
     * that snapped back to `from` would throw that 0.05 away every time and
     * the cycle would run slower and slower.
     *
     * A tick of 0.1 rather than anything larger because `advance` clamps it -
     * a backgrounded tab hands the loop several seconds and the film must not
     * fast-forward. The first version of this test asked for 0.3 in one tick
     * and was measuring the clamp.
     */
    const clock = movieClock()
    clock.seek(1.95)
    clock.play()
    clock.advance(0.1, 8, { from: 1, to: 2 })
    expect(clock.at()).toBeCloseTo(1.05, 5)
  })

  test('an empty or backwards stretch is ignored rather than freezing the shot', () => {
    const clock = movieClock()
    clock.play()
    expect(clock.advance(0.05, 8, { from: 3, to: 3 })).toBe('running')
    expect(clock.advance(0.05, 8, { from: 5, to: 2 })).toBe('running')
    expect(clock.at()).toBeCloseTo(0.1, 5)
  })

  test('behind the stretch it runs into it rather than jumping', () => {
    const clock = movieClock()
    clock.seek(0.5)
    clock.play()
    clock.advance(0.05, 8, { from: 2, to: 3 })
    expect(clock.at()).toBeCloseTo(0.55, 5)
  })
})
