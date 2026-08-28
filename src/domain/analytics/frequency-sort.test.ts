import { describe, expect, test } from 'bun:test'
import { asSort, SORTS, sortFrequency } from '@/domain/analytics/frequency-sort'

const row = (
  path: string,
  counts: { day?: number; week?: number; month?: number; year: number },
  lastSeen = '2026-08-01T00:00:00Z',
  visitors = 1,
) => ({
  path,
  section: path,
  day: counts.day ?? 0,
  week: counts.week ?? 0,
  month: counts.month ?? 0,
  year: counts.year,
  visitors,
  lastSeen,
})

describe('asSort', () => {
  test('takes a column it knows', () => {
    expect(asSort('week')).toBe('week')
    expect(asSort('lastSeen')).toBe('lastSeen')
  })

  test('falls back to the total for anything else', () => {
    expect(asSort(undefined)).toBe('year')
    expect(asSort('')).toBe('year')
    expect(asSort('; drop table')).toBe('year')
  })
})

describe('sortFrequency', () => {
  const busyOnce = row('/old', { year: 500 })
  const busyNow = row('/new', { day: 40, week: 60, month: 60, year: 60 })

  test('a count column ranks by that column, not by the total', () => {
    // The whole point of the table: /old wins the year and loses today.
    expect(sortFrequency([busyOnce, busyNow], 'year').map((r) => r.path)).toEqual([
      '/old',
      '/new',
    ])
    expect(sortFrequency([busyOnce, busyNow], 'day').map((r) => r.path)).toEqual([
      '/new',
      '/old',
    ])
  })

  test('ties on a narrow column fall back to the total', () => {
    const a = row('/a', { day: 5, year: 10 })
    const b = row('/b', { day: 5, year: 900 })
    expect(sortFrequency([a, b], 'day').map((r) => r.path)).toEqual(['/b', '/a'])
  })

  test('last seen is most recent first', () => {
    const older = row('/older', { year: 1 }, '2026-01-01T00:00:00Z')
    const newer = row('/newer', { year: 1 }, '2026-07-31T00:00:00Z')
    expect(sortFrequency([older, newer], 'lastSeen').map((r) => r.path)).toEqual([
      '/newer',
      '/older',
    ])
  })

  test('the path column is alphabetical, where that is the point', () => {
    const rows = [row('/zebra', { year: 900 }), row('/apple', { year: 1 })]
    expect(sortFrequency(rows, 'path').map((r) => r.path)).toEqual(['/apple', '/zebra'])
  })

  test('falls back to the section when there is no path', () => {
    // The folded view has no `path` - the same comparator has to order it.
    const rows = [
      { ...row('/b', { year: 1 }), path: undefined },
      { ...row('/a', { year: 1 }), path: undefined },
    ]
    expect(sortFrequency(rows, 'path').map((r) => r.section)).toEqual(['/a', '/b'])
  })

  test('leaves the caller\'s array alone', () => {
    const rows = [busyOnce, busyNow]
    const before = [...rows]
    sortFrequency(rows, 'day')
    expect(rows).toEqual(before)
  })

  test('every advertised column actually sorts', () => {
    // Guards the header row, which is rendered straight from SORTS.
    for (const sort of SORTS) {
      expect(sortFrequency([busyOnce, busyNow], sort)).toHaveLength(2)
    }
  })
})
