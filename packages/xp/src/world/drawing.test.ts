/**
 * The drawing side of the line, asked without a renderer.
 *
 * Both of these are here rather than in the runtime for the same reason the
 * election is: they are the arithmetic somebody would otherwise verify by
 * playing a match with two browsers open and squinting at a ball. A handover gap
 * that eases in the wrong units and a roll that turns about the wrong axis both
 * look approximately fine for one second and wrong for the rest of the game.
 */
import { describe, expect, test } from 'bun:test'
import { EASE_SECONDS, Rolling, SNAP_BEYOND, Smoothing, type Spin } from './drawing'
import type { EntityId } from './entities'

const BALL = 1 as EntityId
const FRAME = 1 / 60

const at = (x: number, y = 0, z = 0) => ({ x, y, z })

/** What a unit vector becomes once a spin has been applied to it. */
function turned(spin: Spin, x: number, y: number, z: number) {
  // The ordinary q*v*q^-1, written out because importing three into a package
  // test would be importing a renderer to check four numbers.
  const tx = 2 * (spin.y * z - spin.z * y)
  const ty = 2 * (spin.z * x - spin.x * z)
  const tz = 2 * (spin.x * y - spin.y * x)
  return {
    x: x + spin.w * tx + (spin.y * tz - spin.z * ty),
    y: y + spin.w * ty + (spin.z * tx - spin.x * tz),
    z: z + spin.w * tz + (spin.x * ty - spin.y * tx),
  }
}

describe('the gap a handover opens', () => {
  test('the drawn thing does not move on the frame the real one jumps', () => {
    const smoothing = new Smoothing()
    // Drawn a quarter of a second behind, adopted at the freshest sample there
    // is: two and a half cells of travel, all at once. See `@kxb/xp/owning`.
    smoothing.absorb(BALL, at(0), at(2.5))

    const offset = smoothing.offsetOf(BALL)
    expect(offset).not.toBeNull()
    // Position plus offset is exactly where it was drawn, so the first frame
    // after a claim draws the same pixel the frame before it did.
    expect(2.5 + offset!.x).toBeCloseTo(0, 6)
  })

  test('and the gap is gone shortly after, whatever the framerate', () => {
    const sixty = new Smoothing()
    const oneTwenty = new Smoothing()
    sixty.absorb(BALL, at(0), at(2))
    oneTwenty.absorb(BALL, at(0), at(2))

    for (let i = 0; i < 30; i += 1) sixty.fade(FRAME)
    for (let i = 0; i < 60; i += 1) oneTwenty.fade(FRAME / 2)

    // Half a second of easing, reached in half as many steps twice as big. A
    // per-frame fraction would leave these two a factor apart.
    expect(sixty.offsetOf(BALL)?.x ?? 0).toBeCloseTo(oneTwenty.offsetOf(BALL)?.x ?? 0, 6)
  })

  test('a gap closes most of the way inside one time constant', () => {
    const smoothing = new Smoothing()
    smoothing.absorb(BALL, at(0), at(2))
    smoothing.fade(EASE_SECONDS)
    // e-folding: about 37% of it left, which is the property the constant is
    // named for and the reason it is a constant rather than a duration.
    expect(Math.abs(smoothing.offsetOf(BALL)!.x)).toBeCloseTo(2 * Math.exp(-1), 3)
  })

  test('a gap eventually closes rather than shrinking forever', () => {
    const smoothing = new Smoothing()
    smoothing.absorb(BALL, at(0), at(2))
    for (let i = 0; i < 240; i += 1) smoothing.fade(FRAME)
    expect(smoothing.offsetOf(BALL)).toBeNull()
    expect(smoothing.open).toBe(0)
  })

  test('a teleport snaps, because easing one draws ground it never crossed', () => {
    const smoothing = new Smoothing()
    smoothing.absorb(BALL, at(0), at(SNAP_BEYOND + 1))
    expect(smoothing.offsetOf(BALL)).toBeNull()
  })

  test('a gap that opens mid-ease composes with the one still in flight', () => {
    const smoothing = new Smoothing()
    smoothing.absorb(BALL, at(0), at(1))
    smoothing.fade(FRAME)
    const drawn = 1 + smoothing.offsetOf(BALL)!.x

    // Ownership changes hands again while the first gap is still closing. The
    // ball must still not move on this frame - and it must move from where it
    // was *drawn*, not from where the world says it is.
    smoothing.absorb(BALL, at(1), at(2))
    expect(2 + smoothing.offsetOf(BALL)!.x).toBeCloseTo(drawn, 6)
  })

  test('losing the ball waits for somebody to say where it now is', () => {
    const smoothing = new Smoothing()
    // Ownership is lost on the packet that says so; the delayed position it will
    // be drawn at does not exist until the new owner's first sample arrives.
    smoothing.drawnAt(BALL, at(5))
    expect(smoothing.pending).toBe(1)
    expect(smoothing.offsetOf(BALL)).toBeNull()
    expect([...smoothing.waiting()]).toEqual([BALL])

    smoothing.placedAt(BALL, at(3))
    expect(smoothing.pending).toBe(0)
    expect(3 + smoothing.offsetOf(BALL)!.x).toBeCloseTo(5, 6)
  })

  test('and gives up on a ball nobody ever mentions again', () => {
    const smoothing = new Smoothing()
    smoothing.drawnAt(BALL, at(5))
    // A body at rest is left out of the packet entirely, so a handover of a
    // still ball is answered by nothing at all. The capture must not survive
    // until the next kick and swallow it.
    for (let i = 0; i < 60; i += 1) smoothing.fade(FRAME)
    expect(smoothing.pending).toBe(0)

    smoothing.placedAt(BALL, at(9))
    expect(smoothing.offsetOf(BALL)).toBeNull()
  })

  test('a settled thing keeps no row, and a cleared one keeps nothing', () => {
    const smoothing = new Smoothing()
    smoothing.absorb(BALL, at(0), at(0.0001))
    expect(smoothing.open).toBe(0)

    smoothing.absorb(BALL, at(0), at(1))
    smoothing.clear()
    expect(smoothing.offsetOf(BALL)).toBeNull()
    expect(smoothing.pending).toBe(0)
  })
})

describe('a ball that rolls the way it is going', () => {
  test('nothing on the first frame, because there is nowhere to measure from', () => {
    const rolling = new Rolling()
    expect(rolling.rolled(BALL, 0, 0, 115)).toBeNull()
    expect(rolling.rolled(BALL, 0.1, 0, 115)).not.toBeNull()
  })

  test('travelling in x turns the top of it forwards, not backwards', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 90)
    // A quarter turn: one cell at ninety degrees a cell.
    const spin = rolling.rolled(BALL, 1, 0, 90)!
    const top = turned(spin, 0, 1, 0)
    // The top has gone over the front. Uphill is the sign error this exists to
    // catch, and it would put the top at -1.
    expect(top.x).toBeCloseTo(1, 6)
    expect(top.y).toBeCloseTo(0, 6)
  })

  test('and travelling in z turns about the other axis', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 90)
    const spin = rolling.rolled(BALL, 0, 1, 90)!
    const top = turned(spin, 0, 1, 0)
    expect(top.z).toBeCloseTo(1, 6)
    expect(top.y).toBeCloseTo(0, 6)
  })

  test('a full turn comes back to where it started', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 360)
    const spin = rolling.rolled(BALL, 1, 0, 360)!
    const top = turned(spin, 0, 1, 0)
    expect(top.x).toBeCloseTo(0, 6)
    expect(top.y).toBeCloseTo(1, 6)
  })

  test('rolling out and back does not undo itself, because rolling is not a yaw', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 90)
    rolling.rolled(BALL, 1, 0, 90)
    // Out along x, then off along z. Two turns about two different axes, which
    // is precisely the composition a rotation triple cannot hold.
    const spin = rolling.rolled(BALL, 1, 1, 90)!
    const top = turned(spin, 0, 1, 0)
    expect(top.y).not.toBeCloseTo(1, 3)
  })

  test('a stationary ball holds the turn it already had', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 90)
    const moved = rolling.rolled(BALL, 1, 0, 90)!
    const still = rolling.rolled(BALL, 1, 0, 90)!
    expect(still).toEqual(moved)
  })

  test('a crate does not spin, and says nothing rather than an identity', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 0)
    expect(rolling.rolled(BALL, 1, 0, 0)).toBeNull()
    expect(rolling.count).toBe(0)
  })

  test('a ball put back on the centre spot has not rolled its way there', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 115)
    const spin = rolling.rolled(BALL, SNAP_BEYOND + 1, 0, 115)
    expect(spin).toBeNull()
    // And it carries on from the new place rather than snapping back.
    expect(rolling.rolled(BALL, SNAP_BEYOND + 1.1, 0, 115)).not.toBeNull()
  })

  test('a long roll stays a unit rotation, so the ball does not inflate', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 220)
    let spin: Spin | null = null
    for (let i = 1; i <= 4000; i += 1) spin = rolling.rolled(BALL, i * 0.13, i * 0.07, 220)
    const length = Math.sqrt(spin!.x ** 2 + spin!.y ** 2 + spin!.z ** 2 + spin!.w ** 2)
    expect(length).toBeCloseTo(1, 9)
  })

  test('a body that stopped existing stops being rolled', () => {
    const rolling = new Rolling()
    rolling.rolled(BALL, 0, 0, 115)
    rolling.rolled(BALL, 1, 0, 115)
    expect(rolling.spinOf(BALL)).not.toBeNull()

    rolling.sweep(new Set())
    expect(rolling.spinOf(BALL)).toBeNull()
    // And the point it was measured from went with it, or the next ball to
    // reuse the id would roll the whole way back from here on its first frame.
    expect(rolling.rolled(BALL, 1, 0, 115)).toBeNull()
  })
})
