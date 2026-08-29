import { describe, expect, test } from 'bun:test'
import { CAFE_EN, cafeDict } from '@/app/i18n/cafe'
import { PROPS } from '@kxb/dream-restaurant/catalog'
import { ITEMS } from '@kxb/dream-restaurant/recipes'
import { DEFAULT_LOCALE, LOCALES } from '@/domain/i18n/locale'

/**
 * The same check the house's catalogue gets, for the same reason: both id types
 * are plain strings, so nothing at compile time notices a new prop that never
 * got a translated name.
 *
 * The café has two lists rather than one. `PROPS` is the shop - what you buy
 * and stand in the room - and `ITEMS` is everything that can exist as a loose
 * object, which is the buns and the burnt patties as well as the dishes. Both
 * are read out loud somewhere: the shop on the build sheet, the items on the
 * menu, in the order bubble over a customer's head, and in the chef's hands.
 *
 * Driven off `LOCALES`, so adding a language to the app is what makes this file
 * start asking that language for a café.
 */
const TRANSLATED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

for (const locale of TRANSLATED) {
  describe(`the ${locale} café`, () => {
    const dict = cafeDict(locale)

    test('names every prop the shop sells', () => {
      const missing = PROPS.filter((prop) => !dict.props[prop.id]?.name)
      expect(missing.map((prop) => prop.id)).toEqual([])
    })

    test('names nothing the shop no longer sells', () => {
      const ids = new Set(PROPS.map((prop) => prop.id))
      expect(Object.keys(dict.props).filter((id) => !ids.has(id))).toEqual([])
    })

    test('translates the blurb wherever the catalogue has one', () => {
      const missing = PROPS.filter((prop) => prop.blurb && !dict.props[prop.id]?.blurb)
      expect(missing.map((prop) => prop.id)).toEqual([])
    })

    test('names everything that can be held, cooked or served', () => {
      const missing = Object.keys(ITEMS).filter((id) => !dict.items[id])
      expect(missing).toEqual([])
    })

    test('names nothing that is no longer an item', () => {
      expect(Object.keys(dict.items).filter((id) => !(id in ITEMS))).toEqual([])
    })
  })
}

test('English is not written out a second time', () => {
  expect(Object.keys(CAFE_EN.props)).toEqual([])
  expect(Object.keys(CAFE_EN.items)).toEqual([])
})
