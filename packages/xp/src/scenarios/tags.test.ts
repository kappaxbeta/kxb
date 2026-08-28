import { describe, expect, test } from 'bun:test'
import { SUGGESTED_TAGS, tagsInUse } from '../document/blueprints'

/**
 * The words the editor offers, and the reason it offers any.
 *
 * A tag is free text and stays free text - the engine never reads one, only the
 * rules in the document do. What is not free is the *agreement*: a rule matching
 * `pickups` against a blueprint tagged `pickup` matches nothing, forever, with
 * no error anywhere. Two places have to spell the same word and neither used to
 * say what the other had typed.
 */
describe('the tags a level already knows about', () => {
  test('ours come first, in a fixed order, so the list can be learned', () => {
    // A suggestion list that reordered itself as you typed into it is a list
    // nobody builds muscle memory for.
    const found = tagsInUse({ a: { tags: ['zebra'] }, b: { tags: ['aardvark'] } })
    expect(found.slice(0, SUGGESTED_TAGS.length)).toEqual([...SUGGESTED_TAGS])
  })

  test("and the level's own follow, sorted", () => {
    const found = tagsInUse({ a: { tags: ['zebra'] }, b: { tags: ['aardvark'] } })
    expect(found.slice(SUGGESTED_TAGS.length)).toEqual(['aardvark', 'zebra'])
  })

  test('a word that is both is listed once, in our place', () => {
    // Otherwise `player` appears twice the moment anything is tagged with it,
    // which is every level.
    const found = tagsInUse({ a: { tags: ['player', 'player', 'custom'] } })
    expect(found.filter((tag) => tag === 'player')).toHaveLength(1)
    expect(found).toEqual([...SUGGESTED_TAGS, 'custom'])
  })

  test('an empty document still offers the six we ship', () => {
    // The case that matters most: a level with nothing in it is where somebody
    // is deciding what to call things, and it is the one moment there is
    // nothing of theirs to copy.
    expect(tagsInUse({})).toEqual([...SUGGESTED_TAGS])
  })

  test('the list is short, and short on purpose', () => {
    /**
     * A tripwire rather than an assertion about taste. Every word here should be
     * one the presets, templates or starters actually use - the moment it
     * becomes a list of words somebody thought might be handy, it is the enum
     * `Blueprint.tags` is emphatic about not being.
     */
    expect(SUGGESTED_TAGS.length).toBeLessThanOrEqual(8)
  })
})
