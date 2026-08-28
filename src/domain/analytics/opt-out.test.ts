import { describe, expect, test } from 'bun:test'
import { isOptedOut, optOutCookie } from '@/domain/analytics/opt-out'

describe('isOptedOut', () => {
  test('recognises the cookie the switch writes', () => {
    expect(isOptedOut(optOutCookie().value)).toBe(true)
  })

  test('a browser without the cookie is counted', () => {
    expect(isOptedOut(undefined)).toBe(false)
    expect(isOptedOut(null)).toBe(false)
  })

  test('an emptied cookie counts again, rather than reading as unknown', () => {
    // Some clients "delete" a cookie by writing it empty. That has to mean
    // counted, not "a value we do not recognise, better keep suppressing".
    expect(isOptedOut('')).toBe(false)
  })

  test('nothing else opts out', () => {
    expect(isOptedOut('0')).toBe(false)
    expect(isOptedOut('true')).toBe(false)
  })
})

describe('optOutCookie', () => {
  test('is not readable by page scripts and outlives the machine it is set on', () => {
    const { options } = optOutCookie()
    expect(options.httpOnly).toBe(true)
    expect(options.path).toBe('/')
    expect(options.sameSite).toBe('lax')
    expect(options.maxAge as number).toBeGreaterThan(365 * 24 * 60 * 60)
  })
})
