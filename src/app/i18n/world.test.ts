/**
 * The palette, against the dictionary that names it.
 *
 * The block ids live in `src/domain/lounge/palette.ts` and their translations
 * live here, which means the two can drift: add a block and the picker quietly
 * falls back to the prettified id, so a German builder gets `Dirt with grass`
 * on a shelf headed `Gelände`. Nothing breaks — which is why it needs a test.
 */
import { describe, expect, test } from 'bun:test'
import { PALETTE_GROUPS } from '@/domain/lounge/palette'
import { WORLD_EN, worldDict } from '@/app/i18n/world'
import { DEFAULT_LOCALE, LOCALES } from '@/domain/i18n/locale'

const IDS = PALETTE_GROUPS.flatMap((group) => group.models as readonly string[])

/** Every language but the one the ids are already written in. */
const TRANSLATED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

for (const locale of TRANSLATED) {
  describe(`every block on the shelves has a ${locale} name`, () => {
    const blocks = worldDict(locale).picker.blocks
    for (const id of IDS) {
      test(id, () => {
        expect(blocks[id]).toBeString()
      })
    }
  })
}

/**
 * And the English side is the picker's own prettified id, so the dictionary
 * cannot quietly disagree with the fallback it is replacing.
 */
describe('the English is what the id already spelled', () => {
  const pretty = (id: string) => {
    const plain = id.replace(/_/g, ' ')
    return plain.charAt(0).toUpperCase() + plain.slice(1)
  }
  for (const id of IDS) {
    test(id, () => {
      expect(WORLD_EN.picker.blocks[id]).toBe(pretty(id))
    })
  }
})

for (const locale of TRANSLATED) {
  describe(`no ${locale} for a block that is not on a shelf`, () => {
    const live = new Set(IDS)
    for (const id of Object.keys(worldDict(locale).picker.blocks)) {
      test(id, () => {
        expect(live.has(id)).toBe(true)
      })
    }
  })
}

/** Every shelf heading, too — three words that are easy to forget. */
test('every shelf has a heading in every language', () => {
  for (const group of PALETTE_GROUPS) {
    expect(WORLD_EN.picker.groups[group.id]).toBe(group.name)
    for (const locale of TRANSLATED) {
      expect(worldDict(locale).picker.groups[group.id]).toBeString()
    }
  }
})
