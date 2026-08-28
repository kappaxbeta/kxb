import { describe, expect, test } from 'bun:test'
import {
  MAX_SESSION_SECONDS,
  MIN_SESSION_SECONDS,
  elapsedSeconds,
  sessionFrom,
  type PlayedSession,
} from '@/domain/xps/sessions'

/**
 * The check constraints from 20261027000000_xp_sessions.sql, restated.
 *
 * Copied rather than imported for the reason `ref.test.ts` gives about the same
 * kind of copy: there is nothing to import, and the failure worth catching is
 * "we shaped a row the database will reject", which is otherwise found by the
 * first person who finishes a level.
 */
const COLUMN_REF = /^[a-z0-9][a-z0-9-]{0,63}$/
const COLUMN_OUTCOMES = ['finished', 'left', 'disconnected']

const UUID = '550e8400-e29b-41d4-a716-446655440000'
const ACCOUNT = '11111111-2222-3333-4444-555555555555'

const played = (over: Partial<PlayedSession> = {}): PlayedSession => ({
  ref: 'sidestep',
  startedAt: '2026-08-12T20:00:00.000Z',
  seconds: 300,
  outcome: 'finished',
  ...over,
})

describe('a session that ended', () => {
  test('becomes a row the table would take', () => {
    const row = sessionFrom(played({ instance: 'room-7' }), ACCOUNT)

    expect(row).toEqual({
      xp_ref: 'sidestep',
      account_id: ACCOUNT,
      instance: 'room-7',
      started_at: '2026-08-12T20:00:00.000Z',
      seconds: 300,
      outcome: 'finished',
    })
    expect(COLUMN_REF.test(row!.xp_ref)).toBe(true)
    expect(COLUMN_OUTCOMES).toContain(row!.outcome)
  })

  test('a project carries the version it was played at', () => {
    // §11.5's pinned version, arriving here for free: a world's takings are per
    // version because the reference is, and nothing had to add a column.
    const row = sessionFrom(played({ ref: `p-${UUID}-v3` }), ACCOUNT)
    expect(row?.xp_ref).toBe(`p-${UUID}-v3`)
  })

  test('nobody signed in is a row attributed to nobody, not a refusal', () => {
    // §18.3: a guest generates usage and no money. The row still exists.
    expect(sessionFrom(played(), null)?.account_id).toBeNull()
  })

  test('no instance is one person alone in a level', () => {
    expect(sessionFrom(played(), ACCOUNT)?.instance).toBeNull()
  })
})

describe('what a browser is not allowed to claim', () => {
  test('a world nobody can resolve', () => {
    for (const ref of ['', 'Sidestep', '../etc/passwd', '-leading', 'room 7']) {
      expect(sessionFrom(played({ ref }), ACCOUNT)).toBeNull()
    }
  })

  test('a near-miss project reference is a builtin, exactly as ref.ts says', () => {
    // `p-<not a uuid>-v2` is in the builtin alphabet, so it parses as one and is
    // stored as one. Pinned here rather than "fixed": the rule that decides is
    // `parseXpRef`, and a second opinion about it in this module is how two
    // spellings of one world end up in the table.
    expect(sessionFrom(played({ ref: 'p-not-a-uuid-v2' }), ACCOUNT)?.xp_ref).toBe(
      'p-not-a-uuid-v2',
    )
  })

  test('a reference too long for the column a place stores it in', () => {
    expect(sessionFrom(played({ ref: 'a'.repeat(65) }), ACCOUNT)).toBeNull()
  })

  test('an outcome that is not one of the three', () => {
    expect(
      sessionFrom(played({ outcome: 'won' as PlayedSession['outcome'] }), ACCOUNT),
    ).toBeNull()
  })

  test('a year of play in one session', () => {
    expect(sessionFrom(played({ seconds: MAX_SESSION_SECONDS + 1 }), ACCOUNT)).toBeNull()
    expect(sessionFrom(played({ seconds: MAX_SESSION_SECONDS }), ACCOUNT)?.seconds).toBe(
      MAX_SESSION_SECONDS,
    )
  })

  test('time running backwards, or not being a number at all', () => {
    for (const seconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sessionFrom(played({ seconds }), ACCOUNT)).toBeNull()
    }
  })

  test('a glance is not a session', () => {
    expect(sessionFrom(played({ seconds: MIN_SESSION_SECONDS - 1 }), ACCOUNT)).toBeNull()
    expect(sessionFrom(played({ seconds: MIN_SESSION_SECONDS }), ACCOUNT)).not.toBeNull()
  })

  test('a start the database could not read', () => {
    expect(sessionFrom(played({ startedAt: 'yesterday' }), ACCOUNT)).toBeNull()
  })

  test('a silly instance loses the instance and keeps the session', () => {
    const row = sessionFrom(played({ instance: 'x'.repeat(129) }), ACCOUNT)
    expect(row).not.toBeNull()
    expect(row?.instance).toBeNull()
  })

  test('seconds are whole, because the column is', () => {
    expect(sessionFrom(played({ seconds: 12.9 }), ACCOUNT)?.seconds).toBe(12)
  })
})

describe('how long it lasted', () => {
  test('whole seconds between two readings of the same clock', () => {
    expect(elapsedSeconds(1_000, 301_500)).toBe(300)
  })

  test('a clock that went backwards writes a zero rather than a refused row', () => {
    expect(elapsedSeconds(500, 0)).toBe(0)
  })
})
