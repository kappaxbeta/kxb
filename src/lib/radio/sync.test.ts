import { describe, expect, test } from 'bun:test'
import {
  DRIFT_TOLERANCE_MS,
  hasFinished,
  playheadAt,
  shouldReseek,
} from '@/lib/radio/sync'

const ANCHOR = '2026-08-04T20:00:00.000Z'
const AT = (seconds: number) => Date.parse(ANCHOR) + seconds * 1000

describe('playheadAt', () => {
  test('somebody arriving with the track is at the start', () => {
    expect(playheadAt({ startedAt: ANCHOR, positionMs: 0 }, AT(0))).toBe(0)
  })

  /**
   * The whole feature in one assertion: two people who loaded the page at
   * different times compute the same point in the song, because both measure
   * from the same anchor rather than from when they happened to arrive.
   */
  test('somebody arriving forty seconds late joins forty seconds in', () => {
    expect(playheadAt({ startedAt: ANCHOR, positionMs: 0 }, AT(40))).toBe(40_000)
  })

  test('a resumed track counts on from where it was paused', () => {
    expect(playheadAt({ startedAt: ANCHOR, positionMs: 90_000 }, AT(10))).toBe(100_000)
  })

  /**
   * A clock behind the server's puts the anchor in the future. Without the
   * clamp this asks the player to seek to a negative offset, which it refuses -
   * leaving that one listener stuck at a position they can never reach while
   * the room plays on.
   */
  test('a clock behind the server does not produce a negative seek', () => {
    expect(playheadAt({ startedAt: ANCHOR, positionMs: 0 }, AT(-30))).toBe(0)
  })

  test('an unparseable anchor falls back to the stored offset rather than NaN', () => {
    expect(playheadAt({ startedAt: 'not a date', positionMs: 5_000 }, AT(10))).toBe(5_000)
  })
})

describe('shouldReseek', () => {
  test('a small error is left alone, because the seek would be worse than the drift', () => {
    expect(shouldReseek(10_200, 10_000)).toBe(false)
  })

  test('exactly at the tolerance is still left alone', () => {
    expect(shouldReseek(10_000 + DRIFT_TOLERANCE_MS, 10_000)).toBe(false)
  })

  test('a player that has fallen behind is pulled back', () => {
    expect(shouldReseek(6_000, 10_000)).toBe(true)
  })

  test('a player that is ahead is corrected on the same terms', () => {
    expect(shouldReseek(14_000, 10_000)).toBe(true)
  })
})

describe('hasFinished', () => {
  test('a duration of zero means not loaded yet, not a zero-length track', () => {
    expect(hasFinished(60_000, 0)).toBe(false)
  })

  test('a latecomer past the end of the song is not sent back to the top', () => {
    expect(hasFinished(400_000, 180_000)).toBe(true)
  })

  test('mid-track is not finished', () => {
    expect(hasFinished(60_000, 180_000)).toBe(false)
  })
})
