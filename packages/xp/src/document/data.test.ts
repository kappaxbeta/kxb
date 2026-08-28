import { describe, expect, test } from 'bun:test'
import {
  DATA_SCOPES,
  MAX_DATA_FIELDS,
  dataOf,
  defaultsOf,
  describeScope,
  readData,
  renameField,
  storeKeyOf,
  undeclared,
  withField,
  withoutField,
  type XpData,
} from './data'

/**
 * The block a level declares what it keeps in.
 *
 * Everything here is about *refusals*, because the value half is four lines and
 * the refusals are what stop a level saving something nobody can read back. The
 * one that matters most is the scope: it decides who sees a field afterwards,
 * and a guess in that direction is somebody's progress shown to their space.
 */

const problems = () => [] as { at: string; message: string }[]

describe('reading a declared model', () => {
  test('a field is a scope and a starting number', () => {
    const found = problems()
    const data = readData({ coins: { scope: 'player', value: 0 } }, 'data', found)

    expect(found).toEqual([])
    expect(data).toEqual({ coins: { scope: 'player', value: 0 } })
  })

  test('a label rides along when there is one', () => {
    const data = readData(
      { best: { scope: 'shared', value: 0, label: 'Best time' } },
      'data',
      problems(),
    )
    expect(data?.best?.label).toBe('Best time')
  })

  test('absent stays absent rather than becoming an empty block', () => {
    // The trap this format has met three times: a materialised default is a
    // field that appears in every file somebody opens and saves.
    expect(readData(undefined, 'data', problems())).toBeUndefined()
    expect(readData({}, 'data', problems())).toBeUndefined()
  })

  test('all three scopes are readable, and nothing else is', () => {
    for (const scope of DATA_SCOPES) {
      expect(readData({ f: { scope, value: 1 } }, 'data', problems())?.f?.scope).toBe(scope)
    }

    const found = problems()
    expect(readData({ f: { scope: 'global', value: 1 } }, 'data', found)).toBeUndefined()
    expect(found[0]?.at).toBe('data.f.scope')
  })

  test('a field with no scope is refused rather than given one', () => {
    // A default here would be a decision about disclosure taken on the author's
    // behalf, which is the same refusal `store.ts` makes about an unscoped key.
    const found = problems()
    expect(readData({ coins: { value: 0 } }, 'data', found)).toBeUndefined()
    expect(found[0]?.at).toBe('data.coins.scope')
  })

  test('a field with no starting value is refused', () => {
    // `store.get` answers undefined for a field nobody has written, and a rule
    // comparing against undefined behaves by accident rather than by decision.
    const found = problems()
    expect(readData({ coins: { scope: 'player' } }, 'data', found)).toBeUndefined()
    expect(found[0]?.at).toBe('data.coins.value')

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, '0', null]) {
      expect(readData({ coins: { scope: 'player', value } }, 'data', problems())).toBeUndefined()
    }
  })

  test('a name a store key could not carry is refused', () => {
    // The key is `scope:field`, so a colon is the one character that cannot
    // appear — and the alphabet is the one entity and script names already use.
    for (const name of ['Coins', 'my:coins', 'my coins', '1st', '', 'x'.repeat(33)]) {
      const found = problems()
      expect(readData({ [name]: { scope: 'player', value: 0 } }, 'data', found)).toBeUndefined()
      expect(found).toHaveLength(1)
    }
  })

  test('one bad field does not take the good ones with it', () => {
    const found = problems()
    const data = readData(
      { coins: { scope: 'player', value: 0 }, Bad: { scope: 'player', value: 0 } },
      'data',
      found,
    )

    expect(data).toEqual({ coins: { scope: 'player', value: 0 } })
    expect(found).toHaveLength(1)
  })

  test('a model too big to hold is refused whole', () => {
    const many: Record<string, unknown> = {}
    for (let i = 0; i <= MAX_DATA_FIELDS; i++) many[`f${i}`] = { scope: 'player', value: 0 }

    const found = problems()
    expect(readData(many, 'data', found)).toBeUndefined()
    expect(found[0]?.message).toContain(String(MAX_DATA_FIELDS))
  })

  test('a block that is not an object at all', () => {
    for (const raw of [[], 'coins', 3, null]) {
      const found = problems()
      expect(readData(raw, 'data', found)).toBeUndefined()
      expect(found).toHaveLength(1)
    }
  })
})

describe('what the rest of the engine asks of it', () => {
  const data: XpData = {
    coins: { scope: 'player', value: 0 },
    town: { scope: 'space', value: 3 },
    best: { scope: 'shared', value: 0 },
  }

  test('a field knows the store key it lives under', () => {
    expect(storeKeyOf('coins', data.coins!)).toBe('player:coins')
    expect(storeKeyOf('town', data.town!)).toBe('space:town')
    expect(storeKeyOf('best', data.best!)).toBe('shared:best')
  })

  test('a session that has read nothing starts where the author said', () => {
    expect(defaultsOf(data)).toEqual(new Map([['coins', 0], ['town', 3], ['best', 0]]))
  })

  test('a document with no block reads as no fields', () => {
    expect(dataOf({})).toEqual({})
    expect(defaultsOf(dataOf({}))).toEqual(new Map())
  })

  test('a rule naming a field nobody declared is nameable', () => {
    // The check that makes declaring a model worth doing: a rule states its key
    // statically, so a typo is something the parser can see.
    expect(undeclared(['coins', 'coin', 'gold'], data)).toEqual(['coin', 'gold'])
    expect(undeclared(['coins', 'town'], data)).toEqual([])
  })

  test('a field inherited from Object is not declared', () => {
    // `data.toString` is not a field, and a check written with `in` would have
    // said it was.
    expect(undeclared(['toString', 'constructor'], data)).toEqual(['constructor', 'toString'])
  })
})

describe('editing a declared model', () => {
  const data: XpData = {
    coins: { scope: 'player', value: 0 },
    town: { scope: 'space', value: 3 },
  }

  test('a field is written by name, whether it was there or not', () => {
    expect(withField(data, 'keys', { scope: 'player', value: 1 })).toEqual({
      coins: { scope: 'player', value: 0 },
      town: { scope: 'space', value: 3 },
      keys: { scope: 'player', value: 1 },
    })
    expect(withField(data, 'coins', { scope: 'shared', value: 9 }).coins).toEqual({
      scope: 'shared',
      value: 9,
    })
  })

  test('removing one leaves the rest alone', () => {
    expect(withoutField(data, 'coins')).toEqual({ town: { scope: 'space', value: 3 } })
    expect(withoutField(data, 'nothing')).toEqual(data)
  })

  test('the block it came from is not changed', () => {
    // The editor holds the previous document for undo, so a mutation in place
    // would rewrite history as well as the present.
    withField(data, 'keys', { scope: 'player', value: 1 })
    withoutField(data, 'coins')
    expect(Object.keys(data)).toEqual(['coins', 'town'])
  })

  test('a rename keeps the field where it was in the list', () => {
    // `{ ...rest, [to]: field }` would move it to the end, and the panel lists
    // fields in document order — so renaming would silently reorder the model.
    const renamed = renameField(data, 'coins', 'gold')
    expect(Object.keys(renamed)).toEqual(['gold', 'town'])
    expect(renamed.gold).toEqual({ scope: 'player', value: 0 })
  })

  test('a rename onto a name already taken changes nothing', () => {
    // Otherwise the rename would take the other field's scope and default with
    // it, which is a deletion wearing a rename's clothes.
    expect(renameField(data, 'coins', 'town')).toEqual(data)
    expect(renameField(data, 'nothing', 'gold')).toEqual(data)
    expect(renameField(data, 'coins', 'coins')).toEqual(data)
  })
})

describe('saying a scope out loud', () => {
  test('every scope has a sentence about people rather than tables', () => {
    for (const scope of DATA_SCOPES) {
      const said = describeScope(scope)
      expect(said.length).toBeGreaterThan(20)
      // The word we use internally is not the word an author reads.
      expect(said.toLowerCase()).not.toContain('scope')
    }
  })
})
