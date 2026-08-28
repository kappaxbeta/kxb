import { describe, expect, test } from 'bun:test'
import { dayNumber, daysBetween, liveStreak, streakAlive, utcDay } from '@/domain/streaks/days'

describe('utcDay', () => {
  test('is the UTC calendar day, not the local one', () => {
    // 23:30 UTC on the 5th is still the 5th, whatever zone reads it.
    expect(utcDay(new Date('2026-08-05T23:30:00Z'))).toBe('2026-08-05')
    // One minute later, past midnight UTC, is the 6th.
    expect(utcDay(new Date('2026-08-06T00:01:00Z'))).toBe('2026-08-06')
  })
})

describe('daysBetween', () => {
  test('counts whole days forward', () => {
    expect(daysBetween('2026-08-05', '2026-08-06')).toBe(1)
    expect(daysBetween('2026-08-05', '2026-08-05')).toBe(0)
    expect(daysBetween('2026-08-05', '2026-08-12')).toBe(7)
  })

  test('crosses month and year boundaries', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  test('is a pure count, unbothered by daylight saving', () => {
    // Europe springs forward on 2026-03-29. As UTC midnights these are still
    // exactly one day apart - the arithmetic never sees the missing hour.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1)
    expect(dayNumber('2026-03-29') - dayNumber('2026-03-28')).toBe(1)
  })
})

describe('streakAlive', () => {
  test('alive when seen today or yesterday', () => {
    expect(streakAlive('2026-08-06', '2026-08-06')).toBe(true)
    expect(streakAlive('2026-08-05', '2026-08-06')).toBe(true)
  })

  test('cold once two or more days have passed', () => {
    expect(streakAlive('2026-08-04', '2026-08-06')).toBe(false)
    expect(streakAlive('2026-07-30', '2026-08-06')).toBe(false)
  })
})

describe('liveStreak', () => {
  test('keeps its height while alive', () => {
    expect(liveStreak(9, '2026-08-05', '2026-08-06')).toBe(9)
  })

  test('collapses to zero once cold, however tall it was', () => {
    expect(liveStreak(9, '2026-08-01', '2026-08-06')).toBe(0)
  })
})
