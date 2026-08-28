import { afterEach, describe, expect, test } from 'bun:test'
import { park, parked } from '@/app/ovaloffice/studio/draft'

/**
 * The rule this file is really testing is the one in the middle: a draft is
 * offered back only over the address it continues.
 *
 * That is what separates "the page was rebuilt under me, give me my last edit"
 * from "I opened a different link and got somebody else's shot". Both go
 * through the same two functions, and only the key tells them apart.
 */

/** A `sessionStorage` for a runtime that has none. Bun does not ship one. */
function storage(): Record<string, string> {
  const cells: Record<string, string> = {}
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => cells[key] ?? null,
      setItem: (key: string, value: string) => {
        cells[key] = value
      },
    },
  })
  return cells
}

/** One that refuses everything, the way an embedded browser with storage off does. */
function denied() {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('The operation is insecure.')
    },
  })
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sessionStorage')
})

describe('parking an editor draft', () => {
  test('comes back over the address it was parked against', () => {
    storage()
    park('studio:shot', 'AAAA', { duration: 16 })

    expect(parked('studio:shot', 'AAAA')).toEqual({ duration: 16 })
  })

  test('is refused over any other address', () => {
    storage()
    park('studio:shot', 'AAAA', { duration: 16 })

    // Opening a link to a different document. The link wins - it is what was
    // asked for - and the draft stays parked for the page it belongs to.
    expect(parked('studio:shot', 'BBBB')).toBeNull()
  })

  test('the two studios do not hand each other their documents', () => {
    storage()
    park('studio:shot', 'AAAA', { duration: 16 })

    expect(parked('studio:scene', 'AAAA')).toBeNull()
  })

  test('nothing parked is null, not a throw', () => {
    storage()
    expect(parked('studio:shot', 'AAAA')).toBeNull()
  })

  test('garbage in the cell is null, not a throw', () => {
    const cells = storage()
    cells['studio:shot'] = 'not json'

    expect(parked('studio:shot', 'AAAA')).toBeNull()
  })

  test('storage being denied costs the draft and nothing else', () => {
    denied()

    expect(() => park('studio:shot', 'AAAA', { duration: 16 })).not.toThrow()
    expect(parked('studio:shot', 'AAAA')).toBeNull()
  })
})
