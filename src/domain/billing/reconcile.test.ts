import { describe, expect, it } from 'bun:test'
import { selectForSync, type EntitlementRow, type SyncableUser } from '@/domain/billing/reconcile'

const NOW = Date.parse('2026-08-13T03:17:00Z')
const HOUR = 60 * 60 * 1000

const OPTIONS = { now: NOW, staleAfterMs: 20 * HOUR, max: 100 }

function user(id: string, email?: string): SyncableUser {
  return { id, email }
}

function row(
  user_id: string,
  status: EntitlementRow['status'],
  agoHours: number | null,
): EntitlementRow {
  return {
    user_id,
    status,
    synced_at: agoHours === null ? null : new Date(NOW - agoHours * HOUR).toISOString(),
  }
}

describe('selectForSync', () => {
  it('puts never-synced accounts first', () => {
    // The hand-created Stripe customer case: we have never asked about them, so
    // we cannot know they are not paying.
    const selected = selectForSync(
      [user('paying', 'a@x.de'), user('unknown', 'b@x.de')],
      [row('paying', 'active', 1)],
      OPTIONS,
    )

    expect(selected.map((c) => c.userId)).toEqual(['unknown', 'paying'])
    expect(selected[0]?.band).toBe(0)
  })

  it('re-checks paying accounts every run, however fresh', () => {
    // Synced a minute ago and still selected - the freshness window is band 2's
    // alone, because a renewal can fail between two runs.
    const selected = selectForSync(
      [user('a', 'a@x.de'), user('b', 'b@x.de'), user('c', 'c@x.de')],
      [row('a', 'active', 0.01), row('b', 'trialing', 0.01), row('c', 'past_due', 0.01)],
      OPTIONS,
    )

    expect(selected).toHaveLength(3)
    expect(selected.every((c) => c.band === 1)).toBe(true)
  })

  it('leaves fresh non-paying accounts alone', () => {
    const selected = selectForSync(
      [user('a', 'a@x.de'), user('b', 'b@x.de')],
      [row('a', 'canceled', 1), row('b', 'none', 1)],
      OPTIONS,
    )

    expect(selected).toEqual([])
  })

  it('picks up stale non-paying accounts, oldest first', () => {
    const selected = selectForSync(
      [user('recent', 'a@x.de'), user('ancient', 'b@x.de')],
      [row('recent', 'expired', 21), row('ancient', 'none', 900)],
      OPTIONS,
    )

    expect(selected.map((c) => c.userId)).toEqual(['ancient', 'recent'])
  })

  it('caps the run by eating into band 2, never into band 1', () => {
    // The property that matters: a cap tight enough to hurt must starve the
    // belt-and-braces band, not the accounts with money on them.
    const users = [
      user('stale1', 's1@x.de'),
      user('stale2', 's2@x.de'),
      user('payer', 'p@x.de'),
    ]
    const rows = [
      row('stale1', 'none', 500),
      row('stale2', 'none', 400),
      row('payer', 'active', 300),
    ]

    const selected = selectForSync(users, rows, { ...OPTIONS, max: 2 })

    expect(selected.map((c) => c.userId)).toEqual(['payer', 'stale1'])
  })

  it('skips accounts with no email', () => {
    // Anonymous guest accounts are the bulk of auth.users once guest links get
    // used, and Stripe knows a customer by email or not at all.
    const selected = selectForSync([user('guest')], [], OPTIONS)
    expect(selected).toEqual([])
  })

  it('treats an unparseable synced_at as never synced rather than as fresh', () => {
    // Fail toward doing the work. The opposite reading would silently exclude a
    // row forever.
    const selected = selectForSync(
      [user('a', 'a@x.de')],
      [{ user_id: 'a', status: 'none', synced_at: 'not a date' }],
      OPTIONS,
    )

    expect(selected.map((c) => c.userId)).toEqual(['a'])
  })
})
