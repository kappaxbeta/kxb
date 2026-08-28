import { describe, expect, test } from 'bun:test'
import { battleNameSchema } from '@/domain/battle/commands'
import { funnyMatchName, NAME_PARTS } from '@/domain/battle/match-names'

/**
 * The generated name has to be a name the decider would accept.
 *
 * Not a hypothetical: the wizard prefills the field with one of these and the
 * step's Continue is gated on the field being non-empty, so a pair that
 * overran `BATTLE_NAME_MAX` would sail past the gate and be refused by the
 * command at the end of the wizard - four steps after the mistake, with nothing
 * on screen pointing at the field that caused it.
 */
describe('a name nobody had to think of', () => {
  test('every pair is one the command would take', () => {
    for (const shape of NAME_PARTS.shapes) {
      for (const occasion of NAME_PARTS.occasions) {
        expect(battleNameSchema.safeParse(`${shape} ${occasion}`).success).toBe(true)
      }
    }
  })

  test('what it actually produces is one of those pairs', () => {
    for (let i = 0; i < 200; i++) {
      const name = funnyMatchName()
      expect(NAME_PARTS.shapes.some((shape) => name.startsWith(shape))).toBe(true)
      expect(NAME_PARTS.occasions.some((occasion) => name.endsWith(occasion))).toBe(true)
    }
  })

  /**
   * It is a joke rather than a placeholder, and a placeholder is what one
   * repeated name would become - so the pool has to be big enough that two
   * matches in one lobby rarely share a name.
   */
  test('there are enough of them to be worth re-rolling', () => {
    expect(NAME_PARTS.shapes.length * NAME_PARTS.occasions.length).toBeGreaterThan(200)
  })
})
