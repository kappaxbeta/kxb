import { describe, expect, test } from 'bun:test'
import { parseXp, rulesOf, TEMPLATES, templateById } from '@kxb/xp'
import { forOnePlayer, playableAlone, readAudience } from '@/app/xp/new/audience'

/**
 * The question in front of the template picker.
 *
 * Worth testing rather than eyeballing because the answer *changes the
 * document*, and the failure mode is the one docs/xp/backlog.md §1b warns
 * about: a wizard whose answers all produce the same level, which teaches
 * somebody the choice did not matter.
 */
describe('who the level is for', () => {
  test('the two answers are read, and nothing else is', () => {
    expect(readAudience('one')).toBe('one')
    expect(readAudience('together')).toBe('together')
    // Unanswered rather than refused: this is a URL somebody may have trimmed,
    // and the cost of being wrong is the question asked a second time.
    expect(readAudience(undefined)).toBeNull()
    expect(readAudience('movie')).toBeNull()
    expect(readAudience(['one', 'together'])).toBeNull()
  })

  test('a level for one says so, in the field a door reads', () => {
    const document = forOnePlayer(templateById('room')!.build('mine', 'Mine'))
    expect(rulesOf(document).players).toEqual({ min: 1, max: 1 })
  })

  test('and what it says still parses', () => {
    // The cap is written into a document the editor will hand straight back to
    // `parseXp` on the next save, so a pair this function could cross would be
    // a level somebody cannot reopen.
    for (const template of TEMPLATES) {
      const document = forOnePlayer(template.build('mine', 'Mine'))
      expect(parseXp(JSON.parse(JSON.stringify(document))).ok).toBe(true)
    }
  })

  test('the rest of the document is left alone', () => {
    const before = templateById('race')!.build('mine', 'Mine')
    const after = forOnePlayer(before)
    expect(after.world).toEqual(before.world)
    expect(rulesOf(after).preset).toBe(rulesOf(before).preset)
    // A copy, because the caller is about to hand this to an editor that writes
    // documents back out.
    expect(before.rules?.players).toBeUndefined()
  })

  test('a level with two sides is not offered as a level for one', () => {
    /**
     * Derived from the capability rather than from a flag beside the template,
     * because `match` is checked against the marks at parse time - so a
     * document claiming it really does have two sides to put people on, and a
     * flag would be a second answer nobody verifies.
     */
    expect(playableAlone(templateById('match')!.build('a', 'A'))).toBe(false)
    expect(playableAlone(templateById('capture')!.build('a', 'A'))).toBe(false)
    // A race alone is a time trial and a room alone is a room.
    expect(playableAlone(templateById('race')!.build('a', 'A'))).toBe(true)
    expect(playableAlone(templateById('room')!.build('a', 'A'))).toBe(true)
  })

  test('and there is something to build under either answer', () => {
    // A question whose answer empties the list is a dead end with a heading on
    // it. Asserted rather than assumed, because the templates are edited often.
    const alone = TEMPLATES.filter((t) => playableAlone(t.build('a', 'A')))
    expect(alone.length).toBeGreaterThan(0)
    expect(alone.length).toBeLessThan(TEMPLATES.length)
  })
})
