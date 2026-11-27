import { describe, expect, test } from 'bun:test'

import { handFor, SPACE } from './alphabet'
import { FIST } from './fingers'
import { createSigner, FORGET, HOLD } from './signing'
import { spellSigned } from './spells'

/** Hold a hand from `at` until it has been still long enough to count. */
const sign = (signer: ReturnType<typeof createSigner>, letter: Parameters<typeof handFor>[0], at: number) => {
  signer.hold(handFor(letter), at)
  return signer.hold(handFor(letter), at + HOLD)
}

describe('a letter', () => {
  test('is a hand held still', () => {
    const signer = createSigner()
    expect(sign(signer, 'e', 0)).toBeNull()
    expect(signer.run()).toEqual(['e'])
  })

  test('is not a hand passed through', () => {
    const signer = createSigner()
    signer.hold(handFor('e'), 0)
    signer.hold(handFor('a'), HOLD - 1)
    signer.hold(handFor('a'), HOLD + 10)
    // The `e` never settled, and the `a` has only just arrived.
    expect(signer.run()).toEqual([])
  })

  test('happens once however long you lean on it', () => {
    const signer = createSigner()
    sign(signer, 'e', 0)
    signer.hold(handFor('e'), HOLD * 9)
    expect(signer.run()).toEqual(['e'])
  })

  test('needs the hand to change before the same one counts again', () => {
    const signer = createSigner()
    sign(signer, 'e', 0)
    signer.hold(FIST, 1000)
    sign(signer, 'e', 1100)
    expect(signer.run()).toEqual(['e', 'e'])
  })
})

describe('the open hand', () => {
  test('sends the run, and names the phrase', () => {
    const signer = createSigner()
    sign(signer, 'h', 0)
    sign(signer, 'e', 1000)

    signer.hold(SPACE, 2000)
    const said = signer.hold(SPACE, 2000 + HOLD)
    expect(said).toEqual({ letters: ['h', 'e'], phrase: 'hello' })
    expect(signer.run()).toEqual([])
  })

  test('sends a run nobody has a wording for as the letters themselves', () => {
    const signer = createSigner()
    sign(signer, 'k', 0)
    sign(signer, 'o', 1000)

    signer.hold(SPACE, 2000)
    expect(signer.hold(SPACE, 2000 + HOLD)).toEqual({ letters: ['k', 'o'], phrase: null })
  })

  test('says nothing when there is nothing to say', () => {
    const signer = createSigner()
    signer.hold(SPACE, 0)
    expect(signer.hold(SPACE, HOLD)).toBeNull()
  })
})

describe('a resting hand', () => {
  test('keeps a half-word for a while', () => {
    const signer = createSigner()
    sign(signer, 'h', 0)
    signer.hold(FIST, 1000)
    signer.hold(FIST, 1000 + FORGET - 1)
    expect(signer.run()).toEqual(['h'])
  })

  test('and then forgets it', () => {
    const signer = createSigner()
    sign(signer, 'h', 0)
    signer.hold(FIST, 1000)
    signer.hold(FIST, 1000 + FORGET)
    expect(signer.run()).toEqual([])
  })
})

describe('casting with a hand', () => {
  test('the horns and the ring are magic, exactly as drawing them is', () => {
    expect(spellSigned(['x', 'o'])).toBe('magic')
  })

  test('the three letters the pen cannot tell apart all dance', () => {
    for (const letter of ['d', 'b', 'p'] as const) expect(spellSigned([letter])).toBe('dance')
  })

  test('a run with a letter the pen has no shape for is not a spell', () => {
    expect(spellSigned(['x', 'n', 'o'])).toBeNull()
  })

  test('a room that does not offer a word does not cast it', () => {
    expect(spellSigned(['o', 'i'], ['magic', 'dance'])).toBeNull()
  })
})
