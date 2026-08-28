import { describe, expect, test } from 'bun:test'
import { BILLING_EN, billingDict } from '@/app/i18n/billing'
import { DEFAULT_LOCALE, LOCALES } from '@/domain/i18n/locale'
import { TIER_DETAILS, TIERS } from '@/domain/billing/tiers'

/**
 * The plan copy is in two places on purpose, and this is the seam.
 *
 * `TIER_DETAILS` is where a tier's *shape* lives - its price in cents, its
 * label, and the English sentences that were written beside them. The
 * dictionary is where the sentences are read from, in whichever language.
 *
 * They must line up item for item, because the billing card renders the
 * dictionary's list and the pricing band renders it too: a tier that grew a
 * seventh line in the domain and kept six in the dictionary would quietly stop
 * mentioning it, in both languages, with nothing failing.
 *
 * The English list is asserted equal rather than merely the same length. That
 * is the stronger check and it costs nothing - if somebody edits a line in
 * `TIER_DETAILS`, the dictionary has to follow or this fails and says which.
 * The other languages are checked by shape and by not being the English again,
 * which is all a test can say about a translation - and the loop is over
 * `LOCALES`, so a language added to the app is one this file starts asking for
 * three taglines from.
 *
 * Prices are deliberately not checked here, because they are deliberately not
 * in the dictionary at all. See the note at the top of `billing.ts`.
 */
const TRANSLATED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

describe('the tier copy', () => {
  for (const tier of TIERS) {
    test(`${tier}: English matches the domain's own words`, () => {
      expect(BILLING_EN.tiers[tier].tagline).toBe(TIER_DETAILS[tier].tagline)
      expect(BILLING_EN.tiers[tier].includes).toEqual(TIER_DETAILS[tier].includes)
    })

    for (const locale of TRANSLATED) {
      const dict = billingDict(locale)

      test(`${tier}: ${locale} says as many things as English`, () => {
        expect(dict.tiers[tier].includes).toHaveLength(
          TIER_DETAILS[tier].includes.length,
        )
        expect(dict.tiers[tier].tagline.length).toBeGreaterThan(0)
      })

      test(`${tier}: ${locale} is not just the English again`, () => {
        expect(dict.tiers[tier].tagline).not.toBe(TIER_DETAILS[tier].tagline)
      })
    }
  }
})
