import { describe, expect, test } from 'bun:test'

import { SAMPLES } from './samples'
import { createReader } from './spell'

describe('SAMPLES', () => {
  /*
    The spellbook's promise, kept in a test.

    Somebody copying what an animation shows them has to get the thing the
    label beside it says they will get - so every sample is played into a fresh
    reader at a human speed, and the word only counts if it comes out on the
    last stroke.

    Only the last stroke is checked. A shout passes *through* a magic on its
    way - the ring finishes an `xo` and the second cross turns it into an
    `xox` - and that is the design rather than a leak: see `spellOf`.
  */
  for (const sample of SAMPLES) {
    test(`the ${sample.word} demo spells ${sample.word}`, () => {
      const reader = createReader()
      const said = sample.strokes.map((stroke, index) => reader.add(stroke, index * 400))
      expect(said[said.length - 1]).toBe(sample.word)
    })
  }

  test('every word is demonstrated exactly once', () => {
    const words = SAMPLES.map((sample) => sample.word)
    expect(new Set(words).size).toBe(words.length)
  })
})
