import { describe, expect, it } from 'bun:test'
import {
  EXPECTED_REALTIME_LIMITS,
  LIMIT_KEYS,
  looksLikeSeedRevert,
  realtimeLimitDrift,
  type RealtimeLimits,
} from '@/domain/health/realtime-limits'

/** The schema defaults Realtime's seed recreates the row with. */
const STOCK: RealtimeLimits = {
  maxEventsPerSecond: 100,
  maxConcurrentUsers: 200,
  maxBytesPerSecond: 100_000,
  maxJoinsPerSecond: 100,
  maxChannelsPerClient: 100,
}

describe('realtimeLimitDrift', () => {
  it('is empty when the box matches', () => {
    expect(realtimeLimitDrift({ ...EXPECTED_REALTIME_LIMITS })).toEqual([])
  })

  it('reports every field that differs, with the direction', () => {
    const drift = realtimeLimitDrift({
      ...EXPECTED_REALTIME_LIMITS,
      maxEventsPerSecond: 100,
      maxChannelsPerClient: 900,
    })

    expect(drift).toHaveLength(2)

    const events = drift.find((d) => d.key === 'maxEventsPerSecond')
    expect(events?.actual).toBe(100)
    expect(events?.expected).toBe(EXPECTED_REALTIME_LIMITS.maxEventsPerSecond)
    // Below is the dangerous direction and the one the seed produces.
    expect(events?.lower).toBe(true)

    // Above is somebody tuning on the box. Worth surfacing, not an incident.
    expect(drift.find((d) => d.key === 'maxChannelsPerClient')?.lower).toBe(false)
  })

  it('covers every limit, so adding one to the type cannot silently go unchecked', () => {
    // If a sixth limit is added to RealtimeLimits and not to LIMIT_LABELS, the
    // page would stop checking it with no test failing anywhere. This is that
    // test.
    const allWrong = { ...EXPECTED_REALTIME_LIMITS }
    for (const key of LIMIT_KEYS) allWrong[key] = 1

    expect(realtimeLimitDrift(allWrong)).toHaveLength(
      Object.keys(EXPECTED_REALTIME_LIMITS).length,
    )
  })
})

describe('looksLikeSeedRevert', () => {
  it('recognises the stock defaults', () => {
    // The case the whole feature exists for: SEED_SELF_HOST came back true, the
    // row was deleted and recreated, and every ceiling is at schema default.
    // The remedy is a compose file, not an UPDATE - an UPDATE holds only until
    // the next restart - so the page has to tell the two apart.
    expect(looksLikeSeedRevert(realtimeLimitDrift(STOCK))).toBe(true)
  })

  it('does not fire when one value was tuned by hand', () => {
    const drift = realtimeLimitDrift({
      ...EXPECTED_REALTIME_LIMITS,
      maxEventsPerSecond: 40_000,
    })

    expect(drift).toHaveLength(1)
    expect(looksLikeSeedRevert(drift)).toBe(false)
  })

  it('does not fire when everything is off but some are higher', () => {
    // All five differ, so a naive "all of them" check would call this a seed
    // revert and send somebody to edit docker-compose.yml for nothing.
    const mixed = { ...EXPECTED_REALTIME_LIMITS }
    LIMIT_KEYS.forEach((key, i) => {
      mixed[key] = EXPECTED_REALTIME_LIMITS[key] + (i === 0 ? 1 : -1)
    })

    const drift = realtimeLimitDrift(mixed)

    expect(drift).toHaveLength(LIMIT_KEYS.length)
    expect(looksLikeSeedRevert(drift)).toBe(false)
  })

  it('is false for no drift at all', () => {
    expect(looksLikeSeedRevert([])).toBe(false)
  })
})
