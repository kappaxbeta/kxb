import { describe, expect, test } from 'bun:test'
import { streak, STREAK_LENGTH, STREAK_SPEED } from '@/app/xp/_runtime/world/streak'

/**
 * A bullet you can see, checked without looking at it.
 *
 * The runtime cannot be watched - the Browser pane is always `document.hidden`,
 * so `requestAnimationFrame` never fires and the canvas stays black - which
 * means "does the tracer stop at the wall" is a question a screenshot cannot
 * answer and this can.
 */
describe('a tracer', () => {
  test('leaves the muzzle rather than from behind it', () => {
    // In the first couple of milliseconds the head has not travelled a whole
    // streak length, so an unclamped tail would be behind the gun - a bullet
    // leaving from inside the person firing it.
    const first = streak(0.002, 30)
    expect(first.tail).toBe(0)
    expect(first.head).toBeGreaterThan(0)
    expect(first.head).toBeLessThan(STREAK_LENGTH)
  })

  test('stops at what the shot hit, and does not go through it', () => {
    const distance = 12
    // Long after it would have arrived, if nothing clamped it.
    const late = streak(distance / STREAK_SPEED + 0.02, distance)
    expect(late.head).toBe(distance)
    expect(late.head).toBeLessThanOrEqual(distance)
  })

  test('is one streak long once it is properly under way', () => {
    const at = streak(4 / STREAK_SPEED, 30)
    expect(at.head - at.tail).toBeCloseTo(STREAK_LENGTH, 5)
  })

  test('a shot across the arena is on screen for a fifth of a second', () => {
    // Not a tautology: it is the number that decides whether this reads as a
    // bullet or as a flash, and 24 cells is the width of the shooter's arena.
    expect(24 / STREAK_SPEED).toBeGreaterThan(0.15)
    expect(24 / STREAK_SPEED).toBeLessThan(0.3)
  })

  test('it lives until the whole streak has arrived, not until its head has', () => {
    const distance = 20
    const arrived = distance / STREAK_SPEED
    const tailArrives = (distance + STREAK_LENGTH) / STREAK_SPEED

    expect(streak(arrived, distance).alive).toBe(true)
    // Ending at the head would cut every shot off a length short of what it hit,
    // which reads as a bullet stopping in mid-air just before the target.
    expect(streak((arrived + tailArrives) / 2, distance).alive).toBe(true)
    expect(streak(tailArrives + 0.01, distance).alive).toBe(false)
  })

  test('it is swallowed by what it hits rather than parking against it', () => {
    const distance = 20
    const arrived = distance / STREAK_SPEED
    const half = streak(arrived + STREAK_LENGTH / 2 / STREAK_SPEED, distance)

    // The head has stopped and the tail has not, so the streak is shrinking into
    // the impact. Taking the tail from the *clamped* head instead would freeze
    // it at full length until it blinked out.
    expect(half.head).toBe(distance)
    expect(half.head - half.tail).toBeLessThan(STREAK_LENGTH)
    expect(half.head - half.tail).toBeGreaterThan(0)

    const done = streak((distance + STREAK_LENGTH) / STREAK_SPEED, distance)
    expect(done.head - done.tail).toBeCloseTo(0, 6)
  })

  test('a shot at point-blank range still gets a frame', () => {
    expect(streak(0, 0.4).alive).toBe(true)
    expect(streak(0, 0.4).head).toBe(0)
  })
})
