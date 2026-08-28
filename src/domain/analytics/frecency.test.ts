import { describe, expect, test } from 'bun:test'
import { byFrecency, frecency, frecencyShare, WEIGHTS } from '@/domain/analytics/frecency'

/** A section with `views` views, all of them in the given bucket. */
const inBucket = (views: number, bucket: 'today' | 'week' | 'month' | 'older') => ({
  views,
  today: bucket === 'today' ? views : 0,
  thisWeek: bucket === 'today' || bucket === 'week' ? views : 0,
  thisMonth: bucket !== 'older' ? views : 0,
})

describe('frecency', () => {
  test('a view is worth more the more recently it happened', () => {
    const today = frecency(inBucket(1, 'today'))
    const week = frecency(inBucket(1, 'week'))
    const month = frecency(inBucket(1, 'month'))
    const older = frecency(inBucket(1, 'older'))

    expect(today).toBeGreaterThan(week)
    expect(week).toBeGreaterThan(month)
    expect(month).toBeGreaterThan(older)
  })

  test('the buckets are nested, so the weights stack', () => {
    const { base, month, week, today } = WEIGHTS
    expect(frecency(inBucket(1, 'today'))).toBe(base + month + week + today)
    expect(frecency(inBucket(1, 'week'))).toBe(base + month + week)
    expect(frecency(inBucket(1, 'month'))).toBe(base + month)
    expect(frecency(inBucket(1, 'older'))).toBe(base)
  })

  test('nothing scores nothing', () => {
    expect(frecency(inBucket(0, 'older'))).toBe(0)
  })

  test('frequency still counts - one recent click is not a habit', () => {
    // The point of frecency rather than plain recency: 20 views last month
    // still beat a single view today.
    expect(frecency(inBucket(20, 'month'))).toBeGreaterThan(frecency(inBucket(1, 'today')))
  })
})

describe('byFrecency', () => {
  test('this morning outranks three weeks ago at equal counts', () => {
    const stale = { ...inBucket(10, 'month'), section: 'stale' }
    const fresh = { ...inBucket(10, 'today'), section: 'fresh' }

    expect(byFrecency([stale, fresh]).map((r) => r.section)).toEqual(['fresh', 'stale'])
  })

  test('ties break on how much it was actually used', () => {
    const small = { ...inBucket(2, 'today'), section: 'small' }
    const big = { ...inBucket(2, 'today'), views: 2, section: 'big' }

    // Same buckets, so the scores match and only `views` separates them.
    expect(byFrecency([small, { ...big, views: 5 }])[0]?.section).toBe('big')
  })

  test('leaves the caller\'s array alone', () => {
    const rows = [inBucket(1, 'older'), inBucket(1, 'today')]
    const before = [...rows]
    byFrecency(rows)
    expect(rows).toEqual(before)
  })
})

describe('frecencyShare', () => {
  test('the strongest row is the full bar', () => {
    const rows = [inBucket(1, 'older'), inBucket(10, 'today')]
    expect(frecencyShare(rows[1]!, rows)).toBe(1)
  })

  test('everything else is a fraction of it', () => {
    const rows = [inBucket(1, 'older'), inBucket(10, 'today')]
    const share = frecencyShare(rows[0]!, rows)
    expect(share).toBeGreaterThan(0)
    expect(share).toBeLessThan(1)
  })

  test('an empty account does not divide by zero', () => {
    expect(frecencyShare(inBucket(0, 'older'), [])).toBe(0)
  })
})
