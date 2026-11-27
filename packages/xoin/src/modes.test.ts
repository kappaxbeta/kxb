import { describe, expect, test } from 'bun:test'

import { DEFAULT_MODE, MODES, MODE_LABELS, readMode, rulesOf } from './modes'

describe('the modes a space can install', () => {
  test('doing nothing is the mode where nothing can be lost', () => {
    expect(DEFAULT_MODE).toBe('demo')
    expect(rulesOf('demo')).toEqual({
      spendsPurse: false,
      banksFees: false,
      isCurrency: false,
      needsEconomy: false,
    })
  })

  test('anything that moves a coin needs the economy switched on too', () => {
    for (const mode of MODES) {
      const rules = rulesOf(mode)
      expect(rules.needsEconomy).toBe(rules.spendsPurse)
    }
  })

  test('only one mode overturns "there is one coin", and it says so', () => {
    expect(MODES.filter((mode) => rulesOf(mode).isCurrency)).toEqual(['currency'])
  })

  test('a value nobody recognises is read as the harmless one', () => {
    /*
     * The direction matters more than the branch. A row written by a version
     * that knew a fourth mode, or a column holding rubbish, must not be read as
     * permission to take coins off somebody - so an unknown mode is a space
     * that briefly plays for fun.
     */
    for (const rubbish of [undefined, null, '', 'crypto', 'CURRENCY', 4, {}]) {
      expect(readMode(rubbish)).toBe('demo')
      expect(rulesOf(readMode(rubbish)).spendsPurse).toBe(false)
    }
  })

  test('every mode is labelled, so a settings card cannot show a blank', () => {
    for (const mode of MODES) expect(MODE_LABELS[mode]).toBeTruthy()
  })
})
