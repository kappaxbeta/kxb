import { describe, expect, test } from 'bun:test'
import { accept, completionsFor, VOCABULARY } from '@/app/xp/_editor/code/completions'
import { PRELUDE } from '@kxb/xp/script-api'
import type { XpDocument } from '@kxb/xp'

/**
 * The suggestions, and the one thing that keeps them true.
 *
 * Most of this is ordinary: what is offered where. The test that earns its
 * place is `the vocabulary is the prelude's` - the lists are written by hand,
 * so the only way they stay right is a check that every name in them is
 * actually defined in `script-api.ts`. A suggestion for a method that does not
 * exist is worse than no suggestion at all: it is the editor telling somebody
 * to write a `TypeError`.
 */

const document = {
  entities: [
    { name: 'door', blueprint: 'door', x: 0, y: 0, z: 0, rotation: 0, scale: 1, props: {} },
    { name: 'doorbell', blueprint: 'bell', x: 0, y: 0, z: 0, rotation: 0, scale: 1, props: {} },
    { blueprint: 'crate', x: 0, y: 0, z: 0, rotation: 0, scale: 1, props: {} },
  ],
  blueprints: {},
} as unknown as Pick<XpDocument, 'entities' | 'blueprints'>

const at = (source: string) => completionsFor(source, source.length, document)
const texts = (source: string) => at(source).items.map((item) => item.text)

describe('the vocabulary is the prelude\'s', () => {
  test('every entity member is defined on the handle', () => {
    for (const { text } of VOCABULARY.ENTITY_MEMBERS) {
      const defined =
        PRELUDE.includes(`Entity.prototype.${text} =`) ||
        // The five numbers and `alive` are accessors rather than assignments.
        new RegExp(`\\b${text}:\\s*\\{\\s*get:`).test(PRELUDE)
      expect(defined).toBe(true)
    }
  })

  test('every world member is defined on world', () => {
    for (const { text } of VOCABULARY.WORLD_MEMBERS) {
      const defined =
        PRELUDE.includes(`world.${text} = function`) ||
        new RegExp(`\\b${text}:\\s*\\{\\s*get:`).test(PRELUDE)
      expect(defined).toBe(true)
    }
  })

  test('the globals are the four a script is handed, and its hooks', () => {
    const globals = VOCABULARY.GLOBALS.filter((item) => item.kind === 'global').map((i) => i.text)
    expect(globals).toEqual(['self', 'world', 'log', 'getEntityByName'])
    // The same four `wrap` passes in, in the same order. If that signature
    // changes, this is the line that says so.
    const hooks = VOCABULARY.GLOBALS.filter((item) => item.kind === 'hook').map((i) => i.text)
    expect(hooks.sort()).toEqual(['onSpawn', 'onTick', 'onTrigger'])
  })
})

describe('what is offered where', () => {
  test('after a dot on an entity, its members', () => {
    expect(texts('self.mo')).toEqual(['moveTo', 'moveBy'])
    // With nothing typed it is the head of the list, in the order the file
    // writes them: the five numbers first, because those are what a script
    // reaches for before anything else.
    expect(texts('self.').slice(0, 3)).toEqual(['x', 'y', 'z'])
  })

  test('an unknown receiver is an entity, because those are the only handles', () => {
    expect(texts('target.dist')).toEqual(['distanceTo'])
  })

  test('after a dot on world, its own members', () => {
    expect(texts('world.ran')).toEqual(['random', 'randomInt'])
    expect(texts('world.ran')).not.toContain('rotation')
  })

  test('a bare word offers what a script is given', () => {
    expect(texts('getE')).toEqual(['getEntityByName'])
    expect(texts('onT')).toEqual(['onTick', 'onTrigger'])
  })

  test('one letter is not a request for the whole vocabulary', () => {
    expect(texts('s')).toEqual([])
    expect(texts('se')).toEqual(['self'])
  })

  test('entity names, inside the call that looks one up', () => {
    expect(texts("getEntityByName('do")).toEqual(['door', 'doorbell'])
    expect(texts('getEntityByName("doorb')).toEqual(['doorbell'])
    // The nameless one cannot be looked up, so it is not offered.
    expect(texts("getEntityByName('")).not.toContain('')
  })

  test('nothing inside a comment', () => {
    expect(texts('// self.')).toEqual([])
    expect(texts('const a = 1 // world.ti')).toEqual([])
  })

  test('nothing inside an ordinary string', () => {
    expect(texts("log('self.")).toEqual([])
  })

  test('a comment on an earlier line does not silence the one being typed', () => {
    expect(texts('// a note\nself.mov')).toEqual(['moveTo', 'moveBy'])
  })

  test('nothing at all in the ordinary case', () => {
    expect(texts('const speed = 3 * ')).toEqual([])
    expect(texts('')).toEqual([])
  })

  test('at most eight, so it is a menu rather than a manual', () => {
    expect(at('self.').items.length).toBeLessThanOrEqual(8)
  })
})

describe('accepting one', () => {
  test('replaces the typed prefix and leaves the caret after it', () => {
    const source = 'self.mov'
    const completions = completionsFor(source, source.length, document)
    const item = completions.items[0]
    expect(accept(source, completions, item, source.length)).toEqual({
      source: 'self.moveTo',
      caret: 'self.moveTo'.length,
    })
  })

  test('keeps whatever follows the caret', () => {
    const source = 'self.mov)'
    const caret = source.length - 1
    const completions = completionsFor(source, caret, document)
    expect(accept(source, completions, completions.items[0], caret).source).toBe('self.moveTo)')
  })
})
