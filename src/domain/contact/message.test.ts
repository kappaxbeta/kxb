import { describe, expect, test } from 'bun:test'
import {
  parseContactMessage,
  throttleWindowStart,
  THROTTLE_WINDOW_MINUTES,
} from '@/domain/contact/message'

const valid = {
  username: 'Ada',
  email: 'ada@example.com',
  phone: '+49 123 44 55 66',
  subject: 'The lounge will not load',
  message: 'It hangs on the loading screen every time I open it.',
}

describe('parseContactMessage', () => {
  test('accepts a filled-in form and trims what it keeps', () => {
    const result = parseContactMessage({ ...valid, username: '  Ada  ' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.username).toBe('Ada')
    expect(result.value.phone).toBe('+49 123 44 55 66')
  })

  test('a blank phone is absent, not empty', () => {
    for (const phone of ['', '   ', undefined, null]) {
      const result = parseContactMessage({ ...valid, phone })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.phone).toBeNull()
    }
  })

  test('names the field that was wrong, so the form can point at it', () => {
    const result = parseContactMessage({ ...valid, email: 'ada@' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.field).toBe('email')
  })

  test('rejects a message too short to act on', () => {
    const result = parseContactMessage({ ...valid, message: 'help' })
    expect(result.ok).toBe(false)
  })

  test('rejects prose in the phone field but keeps unusual numbers', () => {
    expect(parseContactMessage({ ...valid, phone: 'call me maybe' }).ok).toBe(false)
    expect(parseContactMessage({ ...valid, phone: '(030) 12/34-56' }).ok).toBe(true)
  })

  test('a File where a string belongs is a missing field, not a crash', () => {
    const result = parseContactMessage({ ...valid, subject: new File([], 'x.txt') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.field).toBe('subject')
  })
})

describe('throttleWindowStart', () => {
  test('opens the window exactly one interval back', () => {
    const now = new Date('2026-08-04T12:00:00.000Z')
    expect(throttleWindowStart(now)).toBe(
      new Date(now.getTime() - THROTTLE_WINDOW_MINUTES * 60_000).toISOString(),
    )
  })
})
