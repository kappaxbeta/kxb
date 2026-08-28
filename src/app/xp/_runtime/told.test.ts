import { describe, expect, test } from 'bun:test'
import { isNews } from '@/app/xp/_runtime/told'

/**
 * Whether the outside needs telling, written once instead of four times.
 *
 * Every one of the four sites sits between a sixty-times-a-second loop and
 * React: reporting unconditionally re-renders a HUD, or a whole scene of
 * instanced meshes, to draw what it was already drawing.
 */

const told = <T,>(first: T) => ({ current: first })

describe('the first time', () => {
  test('a different value is news', () => {
    expect(isNews(3, told(0))).toBe(true)
  })

  test('and the same value is not', () => {
    expect(isNews(0, told(0))).toBe(false)
  })
})

describe('remembering', () => {
  /**
   * The two must not drift. A site that reports without remembering repeats
   * itself forever; one that remembers without reporting goes quiet for good.
   */
  test('news is remembered, so it is only news once', () => {
    const last = told(0)
    expect(isNews(3, last)).toBe(true)
    expect(isNews(3, last)).toBe(false)
    expect(isNews(3, last)).toBe(false)
  })

  test('and going back is news again', () => {
    const last = told(0)
    isNews(3, last)
    expect(isNews(0, last)).toBe(true)
  })

  test('nothing is remembered when there was nothing to say', () => {
    const last = told(7)
    isNews(7, last)
    expect(last.current).toBe(7)
  })
})

describe('the values these actually carry', () => {
  test('null is a value, not an absence', () => {
    const left = told<number | null>(null)
    expect(isNews(3, left)).toBe(true)
    expect(isNews(null, left)).toBe(true)
    expect(isNews(null, left)).toBe(false)
  })

  test('a countdown reports each whole second once', () => {
    const left = told<number | null>(null)
    const said: (number | null)[] = []
    for (const n of [3, 3, 3, 2, 2, 1, 1, 1, null, null]) {
      if (isNews(n, left)) said.push(n)
    }
    expect(said).toEqual([3, 2, 1, null])
  })

  /** Which is why the vitals site builds a string rather than an object. */
  test('a fresh object is never equal to the last one', () => {
    const last = told({ hp: 100 })
    expect(isNews({ hp: 100 }, last)).toBe(true)
    expect(isNews({ hp: 100 }, last)).toBe(true)
  })

  test('a string built from the same numbers is', () => {
    const last = told('100/5')
    expect(isNews(`${100}/${5}`, last)).toBe(false)
  })
})

describe('a comparison of its own', () => {
  const sameList = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((x, i) => x === b[i])

  test('is used instead of identity when given', () => {
    const last = told<readonly number[]>([1, 2])
    expect(isNews([1, 2], last, sameList)).toBe(false)
    expect(isNews([1, 3], last, sameList)).toBe(true)
  })

  test('and still remembers the new one', () => {
    const last = told<readonly number[]>([1, 2])
    isNews([1, 3], last, sameList)
    expect(isNews([1, 3], last, sameList)).toBe(false)
  })
})

/**
 * `NaN !== NaN`, so the four `!==` call sites would have reported a NaN
 * countdown as news on every frame, forever. Not reachable today, but a silent
 * sixty-times-a-second `setState` is a poor way to find out it became so.
 */
describe('a value that is not equal to itself', () => {
  test('is news once rather than always', () => {
    const last = told<number>(0)
    expect(isNews(NaN, last)).toBe(true)
    expect(isNews(NaN, last)).toBe(false)
  })
})
