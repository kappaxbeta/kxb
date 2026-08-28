import { describe, expect, test } from 'bun:test'
import { nameProblem } from '@/app/xp/_editor/panels/data-panel'
import { XP_EDITOR_EN } from '@/app/i18n/xp-editor'

/**
 * The words, handed in rather than baked in.
 *
 * `nameProblem` takes them now, the same way the mode picker's `whyNot` does -
 * a refusal a person reads is a refusal in their own language. English here,
 * because these tests are about *which* refusal comes back and not about how it
 * is worded.
 */
const t = XP_EDITOR_EN.data

/**
 * The one decision in the Data panel.
 *
 * Everything else there is a select and a number input. This is the part that
 * refuses, and a refusal that is wrong is either a name the format will reject
 * at Save — ten minutes after somebody typed it — or a rename that silently
 * takes another field's scope and default with it.
 */

describe('what is wrong with a field name', () => {
  test('a good name has nothing wrong with it', () => {
    expect(nameProblem('coins', null, [], t)).toBeNull()
    expect(nameProblem('best-time', null, ['coins'], t)).toBeNull()
    expect(nameProblem('x9', null, [], t)).toBeNull()
  })

  test('a name already in use is named, rather than merely refused', () => {
    expect(nameProblem('coins', null, ['coins'], t)).toContain('coins')
  })

  test('keeping your own name is not a collision', () => {
    // The rename input starts holding the field's current name, so the common
    // case is a field that has not been renamed at all.
    expect(nameProblem('coins', 'coins', ['coins'], t)).toBeNull()
  })

  test('renaming onto somebody else is still refused', () => {
    expect(nameProblem('town', 'coins', ['coins', 'town'], t)).not.toBeNull()
  })

  test('the alphabet is the format s, not a second opinion about it', () => {
    // A panel that accepted a name `parseXp` refuses is a panel that lets
    // somebody build for ten minutes and find out at Save.
    for (const bad of ['Coins', 'my coins', 'my:coins', '1st', '-leading', 'x'.repeat(33)]) {
      expect(nameProblem(bad, null, [], t)).not.toBeNull()
    }
  })

  test('an empty name is refused by the alphabet rather than by a special case', () => {
    expect(nameProblem('', null, [], t)).not.toBeNull()
  })
})
