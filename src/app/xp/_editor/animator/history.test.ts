import { describe, expect, test } from 'bun:test'
import type { ClipLibrary } from '@/app/xp/_editor/animator/clip'
import {
  COALESCE_MS,
  coalesces,
  fresh,
  MAX_UNDO,
  pushed,
  redone,
  undone,
} from '@/app/xp/_editor/animator/history'

/**
 * The undo stack, which was four `useCallback`s and a ref inside a 1,377-line
 * component.
 *
 * Every transition already had to be pure — React invokes a state updater twice
 * in development, and an earlier version that pushed onto a separate history
 * from inside the setter recorded every edit twice. Only the comments said so.
 * Now the rules are checkable, and three of them are ones you would only find
 * by noticing a missing step some minutes after causing it.
 */

/** Libraries are compared by reference here, so a label is enough of one. */
const lib = (name: string) => ({ name }) as unknown as ClipLibrary

const A = lib('a')
const B = lib('b')
const C = lib('c')

const names = (libs: readonly ClipLibrary[]) =>
  libs.map((l) => (l as unknown as { name: string }).name)

describe('coalescing', () => {
  const last = { tag: 'bone:hand', at: 1_000 }

  test('an untagged edit never continues the last one', () => {
    expect(coalesces(last, undefined, 1_000)).toBe(false)
  })

  test('nor does the first edit of a session', () => {
    expect(coalesces(null, 'bone:hand', 1_000)).toBe(false)
  })

  test('the same handle within the window is one gesture', () => {
    expect(coalesces(last, 'bone:hand', 1_000)).toBe(true)
    expect(coalesces(last, 'bone:hand', 1_000 + COALESCE_MS - 1)).toBe(true)
  })

  test('and past the window it is a new one', () => {
    expect(coalesces(last, 'bone:hand', 1_000 + COALESCE_MS)).toBe(false)
    expect(coalesces(last, 'bone:hand', 9_999)).toBe(false)
  })

  /** Letting go of one bone and grabbing another is two undos, window or not. */
  test('a different handle is never the same gesture', () => {
    expect(coalesces(last, 'bone:foot', 1_000)).toBe(false)
  })
})

describe('an edit', () => {
  test('records the step back to what was there', () => {
    const after = pushed(fresh(A), B, false)
    expect(after.library).toBe(B)
    expect(names(after.past)).toEqual(['a'])
    expect(after.future).toEqual([])
  })

  /**
   * The helpers cooperate by reference: deleting the only key, removing the
   * last clip or moving a key that is not there all hand the same object back.
   * A refusal is not an edit and must not cost a step.
   */
  test('that declined costs nothing', () => {
    const before = pushed(fresh(A), B, false)
    const after = pushed(before, before.library, false)
    expect(after).toBe(before)
  })

  test('throws away the road forward', () => {
    const stepped = undone(pushed(fresh(A), B, false))
    expect(stepped.future.length).toBe(1)
    expect(pushed(stepped, C, false).future).toEqual([])
  })

  test('never remembers more than the cap', () => {
    let history = fresh(lib('0'))
    for (let i = 1; i <= MAX_UNDO + 4; i++) history = pushed(history, lib(String(i)), false)
    expect(history.past.length).toBe(MAX_UNDO)
    // The oldest are the ones dropped, so the most recent five remain.
    expect(names(history.past)).toEqual(['4', '5', '6', '7', '8'])
  })
})

describe('a coalescing edit', () => {
  test('folds into the step the gesture started with', () => {
    const started = pushed(fresh(A), B, false)
    const dragged = pushed(started, C, true)
    expect(dragged.library).toBe(C)
    // Still one step back, and it goes all the way to before the gesture.
    expect(names(dragged.past)).toEqual(['a'])
    expect(undone(dragged).library).toBe(A)
  })

  test('a whole drag of many moves is still one undo', () => {
    let history = pushed(fresh(A), lib('m0'), false)
    for (let i = 1; i < 40; i++) history = pushed(history, lib(`m${i}`), true)
    expect(history.past.length).toBe(1)
    expect(undone(history).library).toBe(A)
  })

  /**
   * The first edit of a session has to record something or there is no way back
   * at all, so an empty past ignores the request to fold.
   */
  test('but the very first edit still records a step', () => {
    const after = pushed(fresh(A), B, true)
    expect(names(after.past)).toEqual(['a'])
  })

  test('and it still clears the road forward', () => {
    const stepped = undone(pushed(pushed(fresh(A), B, false), C, false))
    expect(stepped.future.length).toBeGreaterThan(0)
    expect(pushed(stepped, lib('d'), true).future).toEqual([])
  })
})

describe('stepping back and forward', () => {
  const walked = pushed(pushed(fresh(A), B, false), C, false)

  test('undo moves the document and lengthens the future', () => {
    const back = undone(walked)
    expect(back.library).toBe(B)
    expect(names(back.past)).toEqual(['a'])
    expect(names(back.future)).toEqual(['c'])
  })

  test('redo puts it back exactly', () => {
    expect(redone(undone(walked)).library).toBe(C)
    expect(names(redone(undone(walked)).past)).toEqual(names(walked.past))
  })

  test('undo at the beginning is not a change', () => {
    const start = fresh(A)
    expect(undone(start)).toBe(start)
  })

  test('redo at the end is not a change', () => {
    expect(redone(walked)).toBe(walked)
  })

  test('a whole walk back and forward returns the same document', () => {
    let history = walked
    history = undone(undone(history))
    expect(history.library).toBe(A)
    history = redone(redone(history))
    expect(history.library).toBe(C)
  })

  test('the future is capped as well, so a long walk back cannot grow it forever', () => {
    let history = fresh(lib('0'))
    for (let i = 1; i <= MAX_UNDO + 4; i++) history = pushed(history, lib(String(i)), false)
    for (let i = 0; i < MAX_UNDO + 4; i++) history = undone(history)
    expect(history.future.length).toBeLessThanOrEqual(MAX_UNDO)
  })
})

describe('opening a different library', () => {
  test('is not an edit of the last one', () => {
    const walked = pushed(pushed(fresh(A), B, false), C, false)
    const opened = fresh(lib('other'))
    expect(opened.past).toEqual([])
    expect(opened.future).toEqual([])
    // And nothing of the old road survives to be stepped back into.
    expect(undone(opened)).toBe(opened)
    expect(walked.past.length).toBeGreaterThan(0)
  })
})
