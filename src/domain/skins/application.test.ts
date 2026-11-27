import { describe, expect, test } from 'bun:test'
import {
  claimOutcomeCopy,
  coloursOf,
  ownsSkin,
  redeemOutcomeCopy,
  skinThumbUrl,
  spendOutcomeCopy,
  type SkinView,
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

/**
 * Colourways: one purchase, more than one paint job.
 *
 * The rules under test are the client-side halves of two database rules - the
 * shelf query's filter and the `profile_skins` write policy - and the reason
 * they are worth pinning here is that the database is the one that adjudicates.
 * These only decide what the page *offers*, so when they drift the symptom is a
 * button that fails rather than a page that refuses, which is the harder bug to
 * read.
 */
describe('a skin that comes in colours', () => {
  const skin = (id: string, variantOf: string | null = null): SkinView => ({
    id,
    name: id,
    tier: 'skin',
    priceCents: 300,
    voucherCost: 1,
    backstory: '',
    active: true,
    variantOf,
  })

  const mech = skin('spacenina/CombatMech')
  const olive = skin('spacenina/CombatMech_Olive', 'spacenina/CombatMech')
  const knight = skin('adventurers/Knight')
  const all = [mech, olive, knight]

  test('the parent leads its own colours, because it is the one that was bought', () => {
    expect(coloursOf(mech, all).map((entry) => entry.id)).toEqual([mech.id, olive.id])
  })

  test('a skin with no colours is a list of one, so the caller needs no branch', () => {
    expect(coloursOf(knight, all).map((entry) => entry.id)).toEqual([knight.id])
  })

  test('owning the mech is owning its paint', () => {
    const owned = { 'spacenina/CombatMech': 'purchase' }
    expect(ownsSkin(mech, owned)).toBe(true)
    expect(ownsSkin(olive, owned)).toBe(true)
  })

  test('and owning nothing is owning neither', () => {
    // The half that matters: a colour priced at zero is *not* a free skin, and
    // a page that read it as one would offer `Take it` on somebody else's mech.
    expect(ownsSkin(olive, {})).toBe(false)
    expect(ownsSkin(olive, { 'adventurers/Knight': 'purchase' })).toBe(false)
  })
})
