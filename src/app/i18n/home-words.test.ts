import { describe, expect, test } from 'bun:test'
import { HOME_EN, homeDict } from '@/app/i18n/home'
import { HOME_PROPS } from '@/domain/home/catalog'
import { DEFAULT_LOCALE, LOCALES } from '@/domain/i18n/locale'

/**
 * The check a `Record<HomeItemId, …>` would have given us for free.
 *
 * The catalogue's `id` is a plain string - deliberately, because it is what a
 * saved house has written in it - so nothing at compile time notices when a
 * sofa is added to the shop and not to a translated list. A German reader would
 * find out by seeing one English word in a column of fifty.
 *
 * Both directions matter. A missing entry is a half-translated shop; a stale
 * one is a name for something that no longer exists, which is worse, because it
 * looks translated and is dead weight nobody will think to remove.
 *
 * Driven off `LOCALES` rather than naming the dictionaries, so a language added
 * to the app is a language this file starts demanding a full catalogue for on
 * the same commit. English is skipped because English is the catalogue.
 */
const TRANSLATED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

for (const locale of TRANSLATED) {
  describe(`the ${locale} catalogue`, () => {
    const items = homeDict(locale).items
    const ids = new Set(HOME_PROPS.map((prop) => prop.id))

    test('names every item the shop sells', () => {
      const missing = HOME_PROPS.filter((prop) => !items[prop.id]?.name)
      expect(missing.map((prop) => prop.id)).toEqual([])
    })

    test('names nothing the shop no longer sells', () => {
      const stale = Object.keys(items).filter((id) => !ids.has(id))
      expect(stale).toEqual([])
    })

    test('translates the use label wherever the catalogue has one', () => {
      const missing = HOME_PROPS.filter(
        (prop) => prop.use?.label && !items[prop.id]?.use,
      )
      expect(missing.map((prop) => prop.id)).toEqual([])
    })

    test('translates the blurb wherever the catalogue has one', () => {
      const missing = HOME_PROPS.filter(
        (prop) => prop.blurb && !items[prop.id]?.blurb,
      )
      expect(missing.map((prop) => prop.id)).toEqual([])
    })
  })
}

/**
 * English is the catalogue's own, which is the whole reason the hand-written
 * lists above can be the only ones there are.
 */
test('English is not written out a second time', () => {
  expect(Object.keys(HOME_EN.items)).toEqual([])
})
