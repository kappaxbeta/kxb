import { describe, expect, test } from 'bun:test'
import { parseNumber, showsDraft } from '@/app/xp/_editor/number-field'

/**
 * The field somebody could not delete a digit out of.
 *
 * Reported as: *"it's 43, you want to remove all and write it - fine. But when
 * it's 1 and you want 4 you can't delete, because a number is required."* The
 * cause is in `number-field.tsx`; what is checked here is the rule that fixes
 * it, which is the half that can be checked without a DOM.
 *
 * Both directions are bugs. Always showing the typed text means an undo does not
 * appear in a focused field; never showing it is the original report.
 */
describe('what the field shows', () => {
  test('an emptied field stays empty, which is the whole report', () => {
    // The document still says 1 - nothing has been written, and nothing should
    // be. What changed is that the input is allowed to be blank while somebody
    // types the number that replaces it.
    expect(showsDraft('', 1)).toBe(true)
  })

  test('and half-typed text nobody could show a number for', () => {
    expect(showsDraft('-', 1)).toBe(true)
    expect(showsDraft('.', 1)).toBe(true)
    expect(showsDraft('1e', 1)).toBe(true)
  })

  test('text that parses to what the document already says is kept', () => {
    // The subtle half. Replacing `1.` with `1` deletes the character just typed,
    // so a decimal point could never be entered - and `007` would collapse under
    // the cursor.
    expect(showsDraft('1.', 1)).toBe(true)
    expect(showsDraft('007', 7)).toBe(true)
  })

  test('but the document wins when the two disagree', () => {
    // An undo, or another control moving the same value, while this field has
    // focus. Disagreement is resolved in the document's favour, which is what
    // keeps the field from lying about what was saved.
    expect(showsDraft('12', 8)).toBe(false)
    expect(showsDraft(null, 8)).toBe(false)
  })
})

describe('what counts as a number', () => {
  test('an empty field is not zero, which is the same bug in a hat', () => {
    // `Number('')` is 0. Using it would write a zero into the document the
    // instant the last digit went - worse than refusing to delete it, because
    // the value is gone rather than merely stubborn.
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('   ')).toBeNull()
  })

  test('a trailing point is the number so far, so decimals can be typed', () => {
    expect(parseNumber('1.')).toBe(1)
    expect(parseNumber('1.5')).toBe(1.5)
    expect(parseNumber('-0.25')).toBe(-0.25)
  })

  test('and nothing that is not finite gets through', () => {
    expect(parseNumber('-')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('Infinity')).toBeNull()
    expect(parseNumber('NaN')).toBeNull()
  })
})
