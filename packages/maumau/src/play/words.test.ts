/**
 * The two dictionaries, checked against the rules that produce the sentences.
 *
 * ---------------------------------------------------------------------------
 * The test that matters is the last one
 * ---------------------------------------------------------------------------
 * Everything above `every refusal the rules can produce` is bookkeeping - same
 * keys both sides, no empty strings, no English left in the German. The one
 * that earns its place reads `../rules/table.ts` and `../net/arbiter.ts` and
 * pulls out every sentence they can refuse with, then asserts that both
 * dictionaries have it.
 *
 * Reading the source is unusual and it is the right tool here. The alternative
 * is a hand-kept list of refusals, which is a third place to forget - and the
 * failure it guards against is *silent by construction*: `say` falls through to
 * the English on a missing key, exactly so a player is never shown a blank. A
 * missing German line therefore looks like nothing at all until a German
 * speaker hits that rule, which is the worst possible time to find out.
 */

import { describe, expect, test } from 'bun:test'

import { SUITS } from '../rules/cards'
import { DE, EN, TONGUES, WORDS, say, suitList, type Words } from './words'

/** Every leaf string in a dictionary, with the path that reached it. */
function leaves(words: unknown, path: string[] = []): [string, string][] {
  if (typeof words === 'string') return [[path.join('.'), words]]
  if (typeof words !== 'object' || words === null) return []
  return Object.entries(words).flatMap(([key, value]) => leaves(value, [...path, key]))
}

describe('the two dictionaries', () => {
  test('have exactly the same shape', () => {
    const en = leaves(EN).map(([path]) => path).sort()
    const de = leaves(DE).map(([path]) => path).sort()
    expect(de).toEqual(en)
  })

  test('say something everywhere', () => {
    for (const tongue of TONGUES) {
      for (const [path, text] of leaves(WORDS[tongue])) {
        expect(text.trim(), `${tongue}.${path}`).not.toBe('')
      }
    }
  })

  test('are not the same dictionary twice', () => {
    // Every visible string differs between the two, except the ones that are
    // genuinely the same word: the game's name, and Mau itself.
    const same = leaves(EN)
      .filter(([path, text]) => leaves(DE).some(([other, german]) => other === path && german === text))
      .map(([path]) => path)
    expect(same).toEqual(['title'])
  })

  test('name the suits the way each language names them', () => {
    expect(EN.suits).toEqual({
      hearts: 'Hearts',
      diamonds: 'Diamonds',
      clubs: 'Clubs',
      spades: 'Spades',
    })
    // Not a translation of the English: `Kreuz` is "cross" and `Pik` is "pike".
    expect(DE.suits).toEqual({ hearts: 'Herz', diamonds: 'Karo', clubs: 'Kreuz', spades: 'Pik' })
    for (const tongue of TONGUES) {
      expect(suitList(WORDS[tongue]).map((entry) => entry.suit)).toEqual([...SUITS])
    }
  })

  test('use the English sentence as its own English translation', () => {
    for (const [key, value] of Object.entries(EN.refusals)) {
      expect(value, key).toBe(key)
    }
  })
})

describe('saying a refusal', () => {
  test('gives the language asked for', () => {
    expect(say(DE, 'not your turn')).toBe('Du bist nicht dran')
    expect(say(EN, 'not your turn')).toBe('not your turn')
  })

  test('falls through to what arrived rather than to a blank', () => {
    expect(say(DE, 'something no rule has ever said')).toBe('something no rule has ever said')
  })
})

describe('every refusal the rules can produce', () => {
  /**
   * Pulled out of the source, because a hand-kept list is a third place to
   * forget. Matches the two shapes a refusal is written in:
   *
   *   return 'sentence'          - `../rules/table.ts`
   *   throw new Refused('…')     - `../net/arbiter.ts`
   *
   * A ternary counts too, which is why the `return` pattern is not anchored to
   * the start of a line. The literal must contain a space, which is what
   * separates a refusal from the single-word strings in the same files - a
   * `phase` of `'playing'`, a `why` of `'refused'` - without needing a list of
   * exceptions that would go stale on its own.
   */
  async function refusals(): Promise<Set<string>> {
    const found = new Set<string>()
    for (const path of ['../rules/table.ts', '../net/arbiter.ts']) {
      const source = await Bun.file(new URL(path, import.meta.url)).text()
      for (const [, text] of source.matchAll(/(?:return|:|\?)\s*'([a-z][^']*\s[^']{2,})'/g)) {
        found.add(text)
      }
      for (const [, text] of source.matchAll(/new Refused\('([^']+)'\)/g)) found.add(text)
    }
    return found
  }

  test('is in both dictionaries', async () => {
    const found = await refusals()
    // A sanity floor: if the patterns stop matching, this test would pass by
    // finding nothing, which is the one way it could quietly stop working.
    expect(found.size).toBeGreaterThan(15)

    const missing: Record<string, string[]> = {}
    for (const tongue of TONGUES) {
      const gaps = [...found].filter((refusal) => !(refusal in WORDS[tongue].refusals))
      if (gaps.length > 0) missing[tongue] = gaps
    }
    expect(missing).toEqual({})
  })

  test('has no dictionary entry that no rule produces', async () => {
    const found = await refusals()
    const stale = Object.keys(EN.refusals).filter((key) => !found.has(key))
    expect(stale).toEqual([])
  })
})

/** A compile-time check that both dictionaries really are the same type. */
const _shape: Record<'en' | 'de', Words> = WORDS
void _shape
