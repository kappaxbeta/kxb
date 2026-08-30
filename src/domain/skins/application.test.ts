import { describe, expect, test } from 'bun:test'
import {
  claimOutcomeCopy,
  redeemOutcomeCopy,
  skinThumbUrl,
  spendOutcomeCopy,
} from '@/domain/skins/application'
import { mintPromoCode } from '@/domain/promo/mint'

describe('skinThumbUrl', () => {
  test('the id is the path, because the thumbs tree mirrors the packs', () => {
    expect(skinThumbUrl('adventurers/Knight')).toBe('/xp/thumbs/adventurers/Knight.webp')
  })
})

describe('the refusals have sentences', () => {
  /**
   * Every outcome the SQL can return, written here so a code added to the
   * migration without a sentence fails a test instead of rendering the
   * default in a customer's toast. The default itself is also pinned: it must
   * exist, because the SQL will grow refusals before this file hears of it.
   */
  test('every redeem outcome the migration returns is covered', () => {
    const outcomes = ['ok', 'unknown', 'taken', 'spent']
    const sentences = new Set(outcomes.map(redeemOutcomeCopy))
    expect(sentences.size).toBe(outcomes.length)
    expect(redeemOutcomeCopy('something_new')).toBeTruthy()
  })

  test('every spend outcome the migration returns is covered', () => {
    const outcomes = ['ok', 'unknown_skin', 'inactive', 'owned', 'short']
    const sentences = new Set(outcomes.map(spendOutcomeCopy))
    expect(sentences.size).toBe(outcomes.length)
    expect(spendOutcomeCopy('something_new')).toBeTruthy()
  })

  test('every claim outcome the migration returns is covered', () => {
    // `not_free` is the one worth naming: it is what a free door says when it
    // is pointed at the paid shelf, and the sentence has to be about price
    // rather than about the skin being missing.
    const outcomes = ['ok', 'unknown_skin', 'inactive', 'owned', 'not_free']
    const sentences = new Set(outcomes.map(claimOutcomeCopy))
    expect(sentences.size).toBe(outcomes.length)
    expect(claimOutcomeCopy('something_new')).toBeTruthy()
  })
})

describe('voucher codes ride the promo mint', () => {
  test('a skin voucher code reads aloud like every other code here', () => {
    // Same alphabet, same shape - one minting discipline for the platform, so
    // support never has to ask which kind of code somebody is reading out.
    const code = mintPromoCode('SKIN')
    expect(code.startsWith('SKIN-')).toBe(true)
    // The *body* avoids the characters people misread; the prefix is a word
    // and may spell what it likes (this one has an I in it).
    expect(code.slice('SKIN-'.length)).not.toMatch(/[OIL01]/)
  })
})
