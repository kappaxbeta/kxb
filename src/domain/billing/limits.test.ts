import { describe, expect, test } from 'bun:test'
import {
  LIMIT_FLAGS,
  maxLimit,
  minLimit,
  overLimit,
  remaining,
  resolveLimit,
  UNLIMITED,
  withinLimit,
} from '@/domain/billing/limits'
import { FEATURES, isFeatureKey } from '@/domain/flags/keys'
import { LIMIT_KEYS, mergeLimits, TIER_LIMITS, TIERS, tierLimit } from '@/domain/billing/tiers'

/**
 * What a space may have, tested without a database, a tier lookup or a flag.
 *
 * The whole point of `limits.ts` being pure is that the decisions worth getting
 * right - which rung beats which, which way `null` goes, whether zero is a cap
 * or an absence - are a function of four arguments. Everything else about
 * limits is fetching numbers.
 */

describe('unlimited is not a missing value', () => {
  test('unlimited beats every number, in both directions', () => {
    expect(maxLimit(UNLIMITED, 5)).toBe(UNLIMITED)
    expect(maxLimit(5, UNLIMITED)).toBe(UNLIMITED)
    expect(minLimit(UNLIMITED, 5)).toBe(5)
    expect(minLimit(5, UNLIMITED)).toBe(5)
  })

  test('zero is a real limit and does not read as unlimited', () => {
    // The case a `-1` sentinel or a falsy check gets wrong. Free holds no
    // pictures; that is not the same as holding as many as it likes.
    expect(tierLimit('free', 'pictures')).toBe(0)
    expect(withinLimit(0, 0)).toBe(false)
    expect(maxLimit(0, 3)).toBe(3)
    expect(minLimit(0, 3)).toBe(0)
  })

  test('unlimited on both sides stays unlimited', () => {
    expect(maxLimit(UNLIMITED, UNLIMITED)).toBe(UNLIMITED)
    expect(minLimit(UNLIMITED, UNLIMITED)).toBe(UNLIMITED)
  })
})

describe('the tier is the default', () => {
  test('with no override and no ceiling, you get what you bought', () => {
    expect(resolveLimit({ tier: 'xo', key: 'seats' })).toBe(6)
    expect(resolveLimit({ tier: 'xp', key: 'seats' })).toBe(12)
    expect(resolveLimit({ tier: 'free', key: 'seats' })).toBe(2)
  })

  test('a tier that says unlimited says unlimited', () => {
    expect(resolveLimit({ tier: 'xp', key: 'projects' })).toBe(UNLIMITED)
  })
})

describe('an override raises, never lowers', () => {
  test('a generous override wins', () => {
    expect(resolveLimit({ tier: 'xo', key: 'seats', override: 50 })).toBe(50)
  })

  test('a stingy override is ignored', () => {
    // Selling somebody €5 and handing them 2 seats is a refund, so the rule is
    // max() rather than "the override wins".
    expect(resolveLimit({ tier: 'xo', key: 'seats', override: 2 })).toBe(6)
  })

  test('an override cannot claw back an unlimited tier', () => {
    expect(resolveLimit({ tier: 'xp', key: 'projects', override: 3 })).toBe(UNLIMITED)
  })

  test('an override of unlimited takes the cap off this one space', () => {
    expect(resolveLimit({ tier: 'free', key: 'seats', override: UNLIMITED })).toBe(
      UNLIMITED,
    )
  })

  test('no override at all is not the same as an override of unlimited', () => {
    expect(resolveLimit({ tier: 'free', key: 'seats' })).toBe(2)
    expect(resolveLimit({ tier: 'free', key: 'seats', override: undefined })).toBe(2)
  })
})

describe('the ceiling clamps everybody', () => {
  test('it applies after the override, so a comped space is clamped too', () => {
    // The ordering that makes the ceiling a capacity valve rather than a
    // commercial one: being generous to a customer does not make the box
    // bigger.
    expect(
      resolveLimit({ tier: 'xo', key: 'seats', override: 500, ceiling: 100 }),
    ).toBe(100)
  })

  test('it clamps an unlimited tier', () => {
    expect(resolveLimit({ tier: 'xp', key: 'projects', ceiling: 40 })).toBe(40)
  })

  test('a ceiling above what anyone bought changes nothing', () => {
    expect(resolveLimit({ tier: 'xo', key: 'seats', ceiling: 10_000 })).toBe(6)
  })

  test('no ceiling leaves the grant alone', () => {
    expect(resolveLimit({ tier: 'xo', key: 'seats', override: 50 })).toBe(50)
  })
})

describe('asking whether there is room', () => {
  test('a space at exactly its cap may not add', () => {
    expect(withinLimit(5, 6)).toBe(true)
    expect(withinLimit(6, 6)).toBe(false)
  })

  test('unlimited always has room', () => {
    expect(withinLimit(10_000, UNLIMITED)).toBe(true)
  })

  test('remaining never goes negative', () => {
    // A downgrade leaves a space over its cap on purpose - nobody is removed -
    // so "-3 remaining" is a state the interface would otherwise have to render.
    expect(remaining(9, 6)).toBe(0)
    expect(remaining(4, 6)).toBe(2)
    expect(remaining(4, UNLIMITED)).toBe(null)
  })

  test('over the cap and at the cap are different questions', () => {
    // The create path asks the first, the shelving rule asks the second, and
    // conflating them is how a downgrade starts removing things.
    expect(withinLimit(6, 6)).toBe(false)
    expect(overLimit(6, 6)).toBe(false)
    expect(overLimit(9, 6)).toBe(true)
    expect(overLimit(9, UNLIMITED)).toBe(false)
  })
})

describe('the table itself', () => {
  test('every tier answers every limit', () => {
    for (const tier of TIERS) {
      for (const key of LIMIT_KEYS) {
        const value = TIER_LIMITS[tier][key]
        expect(value === null || Number.isInteger(value)).toBe(true)
        expect(value === null || value >= 0).toBe(true)
      }
    }
  })

  test('no rung of the ladder is stingier than the one below it', () => {
    // The property that makes an upgrade always an upgrade. Worth a test rather
    // than a careful read: it is the invariant a hurried edit to one number
    // breaks, and nothing else in the app would notice.
    for (const key of LIMIT_KEYS) {
      expect(maxLimit(tierLimit('free', key), tierLimit('xo', key))).toEqual(
        tierLimit('xo', key),
      )
      expect(maxLimit(tierLimit('xo', key), tierLimit('xp', key))).toEqual(
        tierLimit('xp', key),
      )
    }
  })

  test('free can collect any number of XPs and hold one of each', () => {
    // The want-list, and the whole shape of the free funnel. Collecting is free
    // and unlimited; playing and making are one apiece, so somebody on free can
    // find out whether they want the thing before the wall - and the wall lands
    // on the *second* of either, which is somebody who has already used the
    // first and liked it.
    expect(tierLimit('free', 'magazine')).toBe(UNLIMITED)
    expect(tierLimit('free', 'xpPlaces')).toBe(1)
    expect(tierLimit('free', 'projects')).toBe(1)
  })

  test('every tier holds at least one XP place, so no tier is a rung', () => {
    // The invariant `xpOpen()` now reads instead of `hasTier(context, 'xp')`.
    // It is asserted rather than assumed because the failure it replaces was
    // silent: a plan written down as holding XP places could not open one, and
    // a match summoned inside a level dropped everybody into the lounge.
    for (const tier of TIERS) {
      expect(tierLimit(tier, 'xpPlaces')).not.toBe(0)
      expect(tierLimit(tier, 'projects')).not.toBe(0)
    }
  })

  test('pages are metered only on free', () => {
    // A page is text in a row. Metering it on a paying space is not worth the
    // sentence it takes to explain, so free gets exactly enough to say what the
    // space is and both paid tiers stop counting.
    expect(tierLimit('free', 'pages')).toBe(1)
    expect(tierLimit('xo', 'pages')).toBe(UNLIMITED)
    expect(tierLimit('xp', 'pages')).toBe(UNLIMITED)
  })

  test('uploaded images are capped on every tier, including the top one', () => {
    // The only limit counting bytes somebody sent us rather than rows, and the
    // only one with no `null` anywhere in its column. uploads.ts caps one file
    // at 10 MB and nothing caps how many, so an unlimited tier here would be a
    // space holding a hundred gigabytes for EUR 12.
    expect(tierLimit('free', 'pictures')).toBe(0)
    expect(tierLimit('xo', 'pictures')).toBe(10)
    expect(tierLimit('xp', 'pictures')).toBe(100)

    for (const tier of TIERS) {
      expect(tierLimit(tier, 'pictures')).not.toBe(UNLIMITED)
    }
  })

  test('the images kill switch fails closed, unlike the other surfaces', () => {
    // Deliberately not the `fallback: true` that surface flags take to avoid a
    // blip looking like a deletion. This follows `billing`: the safe failure is
    // to enforce, because a kill switch that reopens on a hiccup is not one.
    expect(FEATURES.pictures.fallback).toBe(false)
    expect(FEATURES.lounge.fallback).toBe(true)
  })

  test('every tier holds an unlimited magazine, free included', () => {
    // The cap that makes the others defensible: a shelved XP costs storage, a
    // loaded one costs frames and a Realtime topic. Nothing is metered here on
    // any tier, which is why `magazine` is the one limit with no flag behind it.
    for (const tier of TIERS) {
      expect(tierLimit(tier, 'magazine')).toBe(UNLIMITED)
    }
  })
})

describe('the flags behind the overrides', () => {
  test('every mapped flag exists and carries a number', () => {
    for (const key of Object.values(LIMIT_FLAGS)) {
      expect(isFeatureKey(key)).toBe(true)
      expect(FEATURES[key].valued).toBeTruthy()
    }
  })

  test('every flag fails open, so a broken lookup lifts a cap', () => {
    // Argued at `seat_limit`: a flag lookup that broke must not be the thing
    // that turns somebody away at a door they were sent a link to.
    for (const key of Object.values(LIMIT_FLAGS)) {
      expect(FEATURES[key].fallback).toBe(false)
    }
  })

  test('every limit but the magazine has a flag to raise it from', () => {
    const flagged = new Set<string>(Object.keys(LIMIT_FLAGS))
    const unflagged = LIMIT_KEYS.filter((key) => !flagged.has(key))
    expect(unflagged).toEqual(['magazine'])
  })
})

describe('reading a sparse tier row', () => {
  test('an absent key inherits the base, and null means unlimited', () => {
    // The whole encoding of the `tiers` table. xp's `{"projects": null}` is "as
    // many as you like"; omitting the key would have meant "three, like xo".
    const base = TIER_LIMITS.free
    const merged = mergeLimits(base, { seats: 12, projects: null })

    expect(merged.seats).toBe(12)
    expect(merged.projects).toBe(UNLIMITED)
    // Untouched, so free's own numbers show through.
    expect(merged.pages).toBe(base.pages)
    expect(merged.pictures).toBe(base.pictures)
  })

  test('a value that is not a whole non-negative number is dropped, not coerced', () => {
    // This parses whatever somebody typed into the backoffice. Coercing would
    // let a string in a form quietly become a cap - the one failure mode the
    // table adds that the constants never had.
    const base = TIER_LIMITS.xo
    const merged = mergeLimits(base, {
      seats: '12',
      guests: 2.5,
      matches: -1,
      pages: {},
    })

    expect(merged.seats).toBe(base.seats)
    expect(merged.guests).toBe(base.guests)
    expect(merged.matches).toBe(base.matches)
    expect(merged.pages).toBe(base.pages)
  })

  test('zero is a real value and survives', () => {
    expect(mergeLimits(TIER_LIMITS.xo, { xpPlaces: 0 }).xpPlaces).toBe(0)
  })

  test('junk in the column leaves the base alone rather than throwing', () => {
    // A projection or a page that threw on a malformed row would take the
    // product down for a bad edit in a text field.
    for (const junk of [null, undefined, 'nope', 42, ['seats']]) {
      expect(mergeLimits(TIER_LIMITS.xo, junk)).toEqual(TIER_LIMITS.xo)
    }
  })

  test('unknown keys are ignored', () => {
    expect(mergeLimits(TIER_LIMITS.xo, { seats: 9, nonsense: 5 })).toEqual({
      ...TIER_LIMITS.xo,
      seats: 9,
    })
  })
})
