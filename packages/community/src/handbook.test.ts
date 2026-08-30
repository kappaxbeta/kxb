import { describe, expect, test } from 'bun:test'
import { CHAPTERS } from './chapters/index'
import { CONTINENTS, COUNTRIES, countriesByContinent } from './countries/index'
import type { Guide } from './guide'
import { STARTER } from './starter'
import { langsOf, pick, type Text } from './text'

/**
 * The handbook's structural promises - the ones a renderer leans on and a
 * contributor could quietly break by editing prose.
 */

const everyText = (): [string, Text<Guide>][] => [
  ...CHAPTERS.map((c) => [`chapter ${c.slug}`, c.guide] as [string, Text<Guide>]),
  ...COUNTRIES.filter((c) => c.guide).map((c) => [`country ${c.slug}`, c.guide!] as [string, Text<Guide>]),
]

describe('the roster', () => {
  test('slugs are unique across chapters and countries together, because they share a URL segment', () => {
    const slugs = [...CHAPTERS.map((c) => c.slug), ...COUNTRIES.map((c) => c.slug)]
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test('country slugs are two-letter codes, so they can never collide with a chapter name', () => {
    for (const country of COUNTRIES) expect(country.slug).toMatch(/^[a-z]{2}$/)
    for (const chapter of CHAPTERS) expect(chapter.slug.length).toBeGreaterThan(2)
  })

  test('the shelves cover the roster exactly once, written first on each', () => {
    const shelved = countriesByContinent().flatMap((shelf) => shelf.countries)
    expect(shelved.length).toBe(COUNTRIES.length)
    expect(new Set(shelved.map((c) => c.slug)).size).toBe(COUNTRIES.length)
    for (const shelf of countriesByContinent()) {
      expect(shelf.countries.length).toBeGreaterThan(0)
      expect(CONTINENTS).toContain(shelf.continent)
      // No written country after a planned one - the shelf is sorted.
      const readiness = shelf.countries.map((c) => (c.guide ? 1 : 0))
      expect([...readiness].sort((a, b) => b - a)).toEqual(readiness)
    }
  })
})

describe('every document', () => {
  for (const [name, text] of everyText()) {
    test(`${name}: section ids are unique, because they are anchor targets`, () => {
      for (const lang of langsOf(text)) {
        const ids = pick(text, lang).doc.sections.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    })

    test(`${name}: carries a real checked date`, () => {
      for (const lang of langsOf(text)) {
        const checked = pick(text, lang).doc.checked
        expect(checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Number.isNaN(Date.parse(checked))).toBe(false)
      }
    })

    test(`${name}: no empty prose anywhere a renderer would print a blank`, () => {
      for (const lang of langsOf(text)) {
        for (const section of pick(text, lang).doc.sections) {
          expect(section.heading.length).toBeGreaterThan(0)
          if (section.kind === 'prose') for (const p of section.body) expect(p.length).toBeGreaterThan(0)
          if (section.kind === 'steps')
            for (const step of section.steps) expect(step.body.length).toBeGreaterThan(0)
        }
      }
    })
  }

  test('a German page never silently gets German-shaped English: pick says what it answered', () => {
    const [, text] = everyText()[0]!
    const asked = pick(text, 'de')
    // Whichever way it answered, the flag and the language agree.
    expect(asked.translated).toBe(asked.lang === 'de')
  })
})

describe('bilingual documents', () => {
  test('Germany, the chapters and the starter guide are written in both languages', () => {
    const germany = COUNTRIES.find((c) => c.slug === 'de')!.guide!
    expect(langsOf(germany)).toEqual(['en', 'de'])
    for (const chapter of CHAPTERS) expect(langsOf(chapter.guide)).toEqual(['en', 'de'])
    expect(langsOf(STARTER)).toEqual(['en', 'de'])
  })

  test('every bilingual document keeps the same section skeleton in both halves', () => {
    // Same ids in the same order: the anchors a shared link carries must land
    // in both languages. Prose may differ; the skeleton may not.
    const all: [string, Text<import('./guide').Guide>][] = [...everyText(), ['starter', STARTER]]
    for (const [name, text] of all) {
      if (langsOf(text).length < 2) continue
      const en = pick(text, 'en').doc.sections.map((s) => `${s.kind}:${s.id}`)
      const de = pick(text, 'de').doc.sections.map((s) => `${s.kind}:${s.id}`)
      expect(de, name).toEqual(en)
    }
  })
})
