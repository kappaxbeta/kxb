import { describe, expect, test } from 'bun:test'
import { PAINT, tokenise, type Token, type TokenKind } from '@/app/xp/_editor/code/highlight'
import { VOCABULARY } from '@/app/xp/_editor/code/completions'

/**
 * The highlighter, and the one property that has to hold.
 *
 * Most of this is ordinary: is a comment a comment. The test that earns its
 * place is `every case puts the source back together` - the tokens are painted
 * *underneath* a textarea holding the same characters, so a scanner that drops
 * or duplicates one slides the two layers apart and draws the rest of the file
 * against the wrong text. Nothing about that failure looks like a highlighting
 * bug on screen; it looks like the editor corrupting your script.
 *
 * So the lossless check runs over every sample in this file rather than as one
 * case of its own, and the awkward inputs - a quote nobody closed, a lone
 * backslash at the end, a `/` with nothing after it - are here for that check
 * rather than for their colours.
 */

/** Every sample this file tokenises, for the property at the bottom. */
const SAMPLES: string[] = []

function scan(source: string): Token[] {
  SAMPLES.push(source)
  return tokenise(source)
}

/** The kinds, in the order they appear, with the text of each. */
function kinds(source: string): [TokenKind, string][] {
  return scan(source).map((token) => [token.kind, token.text])
}

describe('what is lit', () => {
  test('the four names a script is given', () => {
    expect(kinds('log(self)')).toEqual([
      ['api', 'log'],
      ['plain', '('],
      ['api', 'self'],
      ['plain', ')'],
    ])
  })

  test('a hook is one of them, because a script without one does nothing', () => {
    const painted = scan('function onTick(dt) {}')
    expect(painted[0]).toEqual({ kind: 'keyword', text: 'function' })
    expect(painted[2]).toEqual({ kind: 'api', text: 'onTick' })
  })

  test('a name the author invented is left alone', () => {
    expect(scan('const turret = 1')).toEqual([
      { kind: 'keyword', text: 'const' },
      { kind: 'plain', text: ' ' },
      { kind: 'plain', text: 'turret' },
      { kind: 'plain', text: ' = ' },
      { kind: 'number', text: '1' },
    ])
  })

  test('a misspelling of a given name loses its colour, which is the point', () => {
    expect(kinds('wolrd.time')).toEqual([
      ['plain', 'wolrd'],
      ['plain', '.'],
      ['member', 'time'],
    ])
  })

  test('anything after a dot is a member, keyword or not', () => {
    // `set` and `in` are both real entity-side names; neither is the language's.
    expect(kinds('self.set("in", 1)')).toEqual([
      ['api', 'self'],
      ['plain', '.'],
      ['member', 'set'],
      ['plain', '('],
      ['string', '"in"'],
      ['plain', ', '],
      ['number', '1'],
      ['plain', ')'],
    ])
  })

  test('a dot on the next line still reads as a lookup', () => {
    expect(kinds('world\n  .time')).toEqual([
      ['api', 'world'],
      ['plain', '\n  .'],
      ['member', 'time'],
    ])
  })

  test('a spread is not a lookup', () => {
    expect(kinds('f(...rest)')).toEqual([
      ['plain', 'f'],
      ['plain', '(...'],
      ['plain', 'rest'],
      ['plain', ')'],
    ])
  })

  test('numbers hold together', () => {
    expect(kinds('0x1f 1e-3 1.5 .5')).toEqual([
      ['number', '0x1f'],
      ['plain', ' '],
      ['number', '1e-3'],
      ['plain', ' '],
      ['number', '1.5'],
      ['plain', ' '],
      ['number', '.5'],
    ])
  })

  test('a line comment runs to the newline and no further', () => {
    expect(kinds('// self.x\nself.x')).toEqual([
      ['comment', '// self.x'],
      ['plain', '\n'],
      ['api', 'self'],
      ['plain', '.'],
      ['member', 'x'],
    ])
  })

  test('a block comment spans lines', () => {
    expect(kinds('/* a\nb */ 1')).toEqual([
      ['comment', '/* a\nb */'],
      ['plain', ' '],
      ['number', '1'],
    ])
  })

  test('an escaped quote does not end the string', () => {
    expect(kinds("'it\\'s' 1")).toEqual([
      ['string', "'it\\'s'"],
      ['plain', ' '],
      ['number', '1'],
    ])
  })

  test('a template literal spans lines and an ordinary quote does not', () => {
    expect(kinds('`a\nb`')).toEqual([['string', '`a\nb`']])
    // The whole reason strings get a colour: the runaway stops at the line
    // rather than washing everything below it, so the *next* line still reads.
    expect(kinds("'a\nb")).toEqual([
      ['string', "'a"],
      ['plain', '\n'],
      ['plain', 'b'],
    ])
  })
})

describe('the awkward ones', () => {
  test('an unclosed block comment takes the rest of the file', () => {
    expect(kinds('/* a\nb')).toEqual([['comment', '/* a\nb']])
  })

  test('a backslash at the very end does not run off the string', () => {
    expect(kinds("'a\\")).toEqual([['string', "'a\\"]])
  })

  test('a lone slash is punctuation', () => {
    expect(kinds('a / b')).toEqual([
      ['plain', 'a'],
      ['plain', ' / '],
      ['plain', 'b'],
    ])
    expect(kinds('/')).toEqual([['plain', '/']])
  })

  test('nothing at all', () => {
    expect(tokenise('')).toEqual([])
  })
})

/**
 * The contract, over everything above.
 *
 * See the note at the top: this is the one that would be a corrupted-looking
 * editor rather than a wrong colour.
 */
describe('the tokens are the source', () => {
  test('every sample puts itself back together', () => {
    for (const sample of SAMPLES) {
      expect(
        tokenise(sample)
          .map((token) => token.text)
          .join(''),
      ).toBe(sample)
    }
  })

  test('a real script, with all of it at once', () => {
    const source = [
      '// a turret that fires at the nearest thing',
      'let last = 0',
      'function onTick(dt) {',
      "  const target = getEntityByName('player')",
      '  if (!target || world.time - last < 1.5) return',
      '  last = world.time',
      "  self.emit('fired')",
      '  log(`fired at ${self.distanceTo(target)}`)',
      '}',
      '',
    ].join('\n')

    expect(
      tokenise(source)
        .map((token) => token.text)
        .join(''),
    ).toBe(source)
  })
})

describe('the palette', () => {
  test('every kind has a colour', () => {
    const kind = new Set(tokenise("// a\n'b' 1 const self.x d").map((token) => token.kind))
    for (const seen of kind) expect(PAINT[seen]).toBeTruthy()
    expect(Object.keys(PAINT).length).toBe(7)
  })

  /**
   * The list that keeps this honest is `completions.ts`'s, and the test that
   * keeps *that* honest is the prelude check next door. This one only proves
   * the import is doing the work - that nobody has quietly retyped the four
   * names here and left them to drift.
   */
  test('what is lit is what the suggestion menu offers', () => {
    for (const item of VOCABULARY.GLOBALS) {
      const [token] = tokenise(item.text)
      expect(token).toEqual({ kind: 'api', text: item.text })
    }
  })
})
