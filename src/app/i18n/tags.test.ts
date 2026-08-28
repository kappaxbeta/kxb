import { describe, expect, test } from 'bun:test'
import { WORKSPACE_DE, WORKSPACE_EN } from '@/app/i18n/workspace'
import { WORLD_TAGS } from '@/domain/worlds/tags'

/**
 * The tag vocabulary is a closed list on purpose - see the note at the top of
 * `tags.ts` - and adding to it is "a pull request, which is the right amount of
 * friction for a vocabulary the whole platform sorts by". This is the other
 * half of that friction: the pull request has to bring both languages.
 *
 * `WorldTag.id` is a plain string, so nothing at compile time notices a
 * thirteenth tag with no German label. It would show up as one English chip in
 * a row of twelve.
 */
describe('the world tags', () => {
  const ids = WORLD_TAGS.map((tag) => tag.id)

  for (const [name, dict] of [
    ['English', WORKSPACE_EN],
    ['German', WORKSPACE_DE],
  ] as const) {
    test(`${name} labels every tag the vocabulary has`, () => {
      const missing = ids.filter((id) => !dict.worlds.tags[id]?.label)
      expect(missing).toEqual([])
    })

    test(`${name} explains every tag the vocabulary has`, () => {
      const missing = ids.filter((id) => !dict.worlds.tags[id]?.hint)
      expect(missing).toEqual([])
    })

    test(`${name} names nothing the vocabulary dropped`, () => {
      const stale = Object.keys(dict.worlds.tags).filter((id) => !ids.includes(id))
      expect(stale).toEqual([])
    })
  }
})
