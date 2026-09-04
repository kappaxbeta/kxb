import { describe, expect, test } from 'bun:test'
import {
  codeIsLive,
  compareSignupOffers,
  isSignupOffer,
  daysLeft,
  describeGrantEnd,
  grantIsLive,
  normaliseCode,
  type PromoCodeRecord,
  refusalFor,
  refusalForLocale,
  type SignupOffer,
} from '@/domain/promo/application'
import { mintPromoCode } from '@/domain/promo/mint'

const NOW = new Date('2026-08-07T12:00:00.000Z')

describe('normaliseCode', () => {
  test('uppercases, so a code read off a poster is one code', () => {
    expect(normaliseCode('cafe24')).toBe('CAFE24')
    expect(normaliseCode('CaFe24')).toBe('CAFE24')
  })

  test('strips spaces anywhere, not just at the ends', () => {
    // "CAFE 24" is how somebody repeats a code they were told out loud.
    expect(normaliseCode('  cafe 24 ')).toBe('CAFE24')
  })

  test('keeps hyphens, which is how minted codes are grouped', () => {
    expect(normaliseCode('hbf-7k4m')).toBe('HBF-7K4M')
  })

  test('refuses what cannot be a code rather than mangling it', () => {
    expect(normaliseCode('ab')).toBeNull() // under the column's minimum
    expect(normaliseCode('café24')).toBeNull()
    expect(normaliseCode("'; drop table promo_codes --")).toBeNull()
    expect(normaliseCode('-leading')).toBeNull() // must start alphanumeric
    expect(normaliseCode('X'.repeat(41))).toBeNull()
    expect(normaliseCode(null)).toBeNull()
    expect(normaliseCode(42)).toBeNull()
  })

  test('accepts exactly the boundaries the column allows', () => {
    expect(normaliseCode('abc')).toBe('ABC')
    expect(normaliseCode('X'.repeat(40))).toBe('X'.repeat(40))
  })
})

describe('mintPromoCode', () => {
  test('what it mints survives its own normaliser', () => {
    for (let i = 0; i < 50; i++) {
      const code = mintPromoCode()
      expect(normaliseCode(code)).toBe(code)
    }
  })

  test('never contains the characters people mistype', () => {
    for (let i = 0; i < 50; i++) {
      expect(mintPromoCode()).not.toMatch(/[OIL01]/)
    }
  })

  test('a prefix leads, so a campaign is readable in the code', () => {
    expect(mintPromoCode('hbf')).toStartWith('HBF-')
  })

  test('a prefix too long to store is clipped, not rejected', () => {
    const code = mintPromoCode('X'.repeat(60))
    expect(code.length).toBe(40)
    expect(normaliseCode(code)).toBe(code)
  })
})

describe('codeIsLive', () => {
  const live: PromoCodeRecord = {
    maxUses: 100,
    uses: 3,
    startsAt: null,
    expiresAt: null,
    revokedAt: null,
  }

  test('a fresh code with room left is live', () => {
    expect(codeIsLive(live, NOW)).toBe(true)
  })

  test('no ceiling means it never runs out of uses', () => {
    expect(codeIsLive({ ...live, maxUses: null, uses: 9_000 }, NOW)).toBe(true)
  })

  test('spent, revoked, expired and not-yet-started all read as not live', () => {
    expect(codeIsLive({ ...live, uses: 100 }, NOW)).toBe(false)
    expect(codeIsLive({ ...live, revokedAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(false)
    expect(codeIsLive({ ...live, expiresAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(false)
    expect(codeIsLive({ ...live, startsAt: '2026-09-01T00:00:00Z' }, NOW)).toBe(false)
  })

  test('expiry is exclusive, matching the SQL `expires_at <= now()`', () => {
    expect(codeIsLive({ ...live, expiresAt: NOW.toISOString() }, NOW)).toBe(false)
  })

  test('a start exactly now has started, matching `starts_at > now()`', () => {
    expect(codeIsLive({ ...live, startsAt: NOW.toISOString() }, NOW)).toBe(true)
  })
})

describe('grantIsLive', () => {
  test('a month in the future is live, the past is not', () => {
    expect(grantIsLive('2026-09-06T12:00:00Z', NOW)).toBe(true)
    expect(grantIsLive('2026-07-06T12:00:00Z', NOW)).toBe(false)
  })

  test('the instant it ends, it has ended - same as the SQL', () => {
    expect(grantIsLive(NOW.toISOString(), NOW)).toBe(false)
  })

  test('an account with no grant is not live, and does not throw', () => {
    // `undefined` is the absence of a row. `null` is a column - see below.
    expect(grantIsLive(undefined, NOW)).toBe(false)
    expect(grantIsLive('not a date', NOW)).toBe(false)
  })

  /**
   * The distinction the nullable column introduced, and the one worth a test of
   * its own: a grant with no end reads as NULL, and the falsy check this used to
   * do read every one of them as lapsed.
   */
  test('no end date is a grant that never ends, not a missing one', () => {
    expect(grantIsLive(null, NOW)).toBe(true)
  })
})

describe('describeGrantEnd', () => {
  test('a grant with no end says so, rather than counting down to nothing', () => {
    expect(describeGrantEnd(null, NOW)).toBe('Forever')
  })

  test('a running grant counts the days the same way daysLeft does', () => {
    expect(describeGrantEnd('2026-08-08T00:00:00Z', NOW)).toBe('1 days left')
  })

  test('and a lapsed one says when it ended', () => {
    expect(describeGrantEnd('2026-07-06T12:00:00Z', NOW)).toStartWith('Ended')
  })
})

describe('daysLeft', () => {
  test('rounds up, so the last day is "1 day" and never "0"', () => {
    expect(daysLeft('2026-08-08T00:00:00Z', NOW)).toBe(1)
    expect(daysLeft('2026-08-07T12:00:01Z', NOW)).toBe(1)
  })

  test('a whole month reads as a whole month', () => {
    expect(daysLeft('2026-09-06T12:00:00Z', NOW)).toBe(30)
  })

  test('an ended grant has nothing left, not a negative number', () => {
    expect(daysLeft('2026-08-01T12:00:00Z', NOW)).toBe(0)
  })
})

describe('refusals', () => {
  test('every outcome has a sentence in both languages', () => {
    for (const outcome of ['unknown', 'inactive', 'already', 'not_new'] as const) {
      expect(refusalFor(outcome).length).toBeGreaterThan(0)
      expect(refusalForLocale(outcome, 'de').length).toBeGreaterThan(0)
      expect(refusalForLocale(outcome, 'en')).toBe(refusalFor(outcome))
    }
  })

  test('a bad code and a spent code do not give different information away', () => {
    // Both are reachable without an account, so neither may confirm that a
    // guessed string is a real code. They may differ in wording, not in what
    // they reveal - so the check is that neither names the code's state.
    expect(refusalFor('unknown')).not.toMatch(/expired|used|claimed/i)
    expect(refusalFor('inactive')).not.toMatch(/expired|used|claimed/i)
  })
})


describe('the sign-up offers', () => {
  /** A code with only the fields the ordering cares about filled in. */
  function offer(code: string, tier: SignupOffer['tier'], freeDays: number | null): SignupOffer {
    return {
      code,
      label: null,
      tier,
      freeDays,
      spaces: null,
      closesAt: null,
      remaining: null,
      // None of the three take part in the ordering, which is what these tests
      // are about. Zero is also the common case on a real offer.
      bucks: 0,
      vouchers: 0,
      coins: 0,
    }
  }

  test('the prefix is what publishes a code', () => {
    expect(isSignupOffer('SIGNUP50')).toBe(true)
    expect(isSignupOffer('SIGNUP-K3M9PQRS')).toBe(true)
    expect(isSignupOffer('CAFE24')).toBe(false)
    expect(isSignupOffer('GRANT-K3M9PQRS')).toBe(false)
  })

  test('it is asked of the normalised code, so how it was typed cannot matter', () => {
    expect(isSignupOffer('signup50')).toBe(true)
    expect(isSignupOffer('signup 50')).toBe(true)
  })

  test('a string that could not be a code is not an offer either', () => {
    expect(isSignupOffer('')).toBe(false)
    expect(isSignupOffer(null)).toBe(false)
    // Underscores fail the column's own pattern, so this never reaches the
    // prefix test at all - which is the point of normalising first.
    expect(isSignupOffer('SIGNUP_50')).toBe(false)
  })

  test('the better plan leads, whatever the run lengths are', () => {
    const sorted = [offer('A', 'xo', 90), offer('B', 'xp', 7)].sort(compareSignupOffers)
    expect(sorted.map((row) => row.code)).toEqual(['B', 'A'])
  })

  test('and within one plan, the longer run', () => {
    const sorted = [offer('A', 'xo', 14), offer('B', 'xo', 30)].sort(compareSignupOffers)
    expect(sorted.map((row) => row.code)).toEqual(['B', 'A'])
  })

  test('a grant with no end beats every finite one', () => {
    const sorted = [offer('A', 'xo', 365), offer('B', 'xo', null)].sort(compareSignupOffers)
    expect(sorted.map((row) => row.code)).toEqual(['B', 'A'])
  })

  test('two identical offers keep a stable order rather than wandering', () => {
    const rows = [offer('SIGNUPB', 'xo', 30), offer('SIGNUPA', 'xo', 30)]
    expect([...rows].sort(compareSignupOffers).map((row) => row.code)).toEqual([
      'SIGNUPA',
      'SIGNUPB',
    ])
  })
})
