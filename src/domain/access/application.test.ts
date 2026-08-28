import { describe, expect, test } from 'bun:test'
import {
  APPLY_THROTTLE_WINDOW_MINUTES,
  applyThrottleWindowStart,
  consentEvidence,
  type InviteRecord,
  inviteProblem,
  mintInviteToken,
  parseApplication,
} from '@/domain/access/application'

describe('parseApplication', () => {
  test('an address on its own is enough to join the list', () => {
    const result = parseApplication({ email: 'ada@example.com' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.email).toBe('ada@example.com')
    expect(result.value.username).toBeNull()
    expect(result.value.note).toBeNull()
    expect(result.value.newsletterConsent).toBe(false)
  })

  test('the address is lowercased, so one mailbox is one row', () => {
    const result = parseApplication({ email: '  Ada@Example.COM  ' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.email).toBe('ada@example.com')
  })

  test('a blank name or note is absent, not empty', () => {
    for (const blank of ['', '   ', undefined, null]) {
      const result = parseApplication({
        email: 'ada@example.com',
        username: blank,
        note: blank,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.username).toBeNull()
      expect(result.value.note).toBeNull()
    }
  })

  test("only the checkbox's own 'on' counts as a yes", () => {
    const yes = parseApplication({ email: 'ada@example.com', newsletter: 'on' })
    expect(yes.ok && yes.value.newsletterConsent).toBe(true)

    // Anything else is somebody posting by hand, and is not consent.
    for (const other of ['true', 'yes', '1', 'off', '', undefined]) {
      const result = parseApplication({ email: 'ada@example.com', newsletter: other })
      expect(result.ok && result.value.newsletterConsent).toBe(false)
    }
  })

  test('names the field that was wrong, so the form can point at it', () => {
    const result = parseApplication({ email: 'ada@' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.field).toBe('email')
  })

  test('a File where a string belongs is a missing field, not a crash', () => {
    const result = parseApplication({ email: new File([], 'x.txt') })
    expect(result.ok).toBe(false)
  })
})

describe('consentEvidence', () => {
  const now = new Date('2026-08-05T09:30:00.000Z')

  test('a yes is stamped with the time and the address', () => {
    const evidence = consentEvidence(true, '203.0.113.7', 'Mozilla/5.0', now)

    expect(evidence).toEqual({
      newsletter_consent: true,
      consent_at: '2026-08-05T09:30:00.000Z',
      consent_ip: '203.0.113.7',
      consent_user_agent: 'Mozilla/5.0',
    })
  })

  test('a no writes no evidence at all', () => {
    // The table's check constraint rejects a consent without a time and an
    // address; this is the other half of that rule - no consent means nothing
    // is recorded, rather than a timestamp for an agreement nobody made.
    const evidence = consentEvidence(false, '203.0.113.7', 'Mozilla/5.0', now)

    expect(evidence).toEqual({
      newsletter_consent: false,
      consent_at: null,
      consent_ip: null,
      consent_user_agent: null,
    })
  })

  test('an over-long user agent is truncated rather than rejected', () => {
    const evidence = consentEvidence(true, '203.0.113.7', 'x'.repeat(900), now)
    expect(evidence.consent_user_agent).toHaveLength(500)
  })
})

describe('applyThrottleWindowStart', () => {
  test('opens the window exactly one interval back', () => {
    const now = new Date('2026-08-05T12:00:00.000Z')
    expect(applyThrottleWindowStart(now)).toBe(
      new Date(now.getTime() - APPLY_THROTTLE_WINDOW_MINUTES * 60_000).toISOString(),
    )
  })
})

describe('mintInviteToken', () => {
  test('is URL-safe, so it survives a link without escaping', () => {
    for (let i = 0; i < 20; i++) {
      expect(mintInviteToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  test('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintInviteToken()))
    expect(seen.size).toBe(200)
  })
})

describe('inviteProblem', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')

  const usable: InviteRecord = {
    email: null,
    maxUses: 1,
    uses: 0,
    expiresAt: '2026-08-19T12:00:00.000Z',
    revokedAt: null,
  }

  test('an open invite with uses left lets anybody through', () => {
    expect(inviteProblem(usable, 'stranger@example.com', now)).toBeNull()
  })

  test('a token that matched nothing is refused', () => {
    expect(inviteProblem(null, 'ada@example.com', now)).not.toBeNull()
  })

  test('revoked, spent and expired are all refused', () => {
    const cases: InviteRecord[] = [
      { ...usable, revokedAt: '2026-08-04T00:00:00.000Z' },
      { ...usable, uses: 1, maxUses: 1 },
      { ...usable, expiresAt: '2026-08-05T11:59:59.000Z' },
    ]

    for (const invite of cases) {
      expect(inviteProblem(invite, 'ada@example.com', now)).not.toBeNull()
    }
  })

  test('expiry is exclusive - the instant it expires, it is gone', () => {
    const expiring = { ...usable, expiresAt: now.toISOString() }
    expect(inviteProblem(expiring, 'ada@example.com', now)).not.toBeNull()
  })

  test('an invite with no expiry never times out', () => {
    const forever = { ...usable, expiresAt: null }
    expect(inviteProblem(forever, 'ada@example.com', now)).toBeNull()
  })

  test('a multi-use invite works until its last use is spent', () => {
    expect(inviteProblem({ ...usable, maxUses: 3, uses: 2 }, 'a@b.com', now)).toBeNull()
    expect(inviteProblem({ ...usable, maxUses: 3, uses: 3 }, 'a@b.com', now)).not.toBeNull()
  })

  test('an addressed invite refuses a different mailbox', () => {
    const addressed = { ...usable, email: 'ada@example.com' }

    expect(inviteProblem(addressed, 'ada@example.com', now)).toBeNull()
    expect(inviteProblem(addressed, 'eve@example.com', now)).not.toBeNull()
  })

  test('the address is matched loosely enough to survive retyping', () => {
    const addressed = { ...usable, email: 'Ada@Example.com' }
    expect(inviteProblem(addressed, '  ada@example.COM ', now)).toBeNull()
  })

  test('every refusal reads the same, so no probe learns which guess landed', () => {
    const refusals = [
      inviteProblem(null, 'ada@example.com', now),
      inviteProblem({ ...usable, revokedAt: '2026-01-01T00:00:00Z' }, 'ada@e.com', now),
      inviteProblem({ ...usable, uses: 9 }, 'ada@example.com', now),
      inviteProblem({ ...usable, expiresAt: '2020-01-01T00:00:00Z' }, 'ada@e.com', now),
      inviteProblem({ ...usable, email: 'someone@else.com' }, 'ada@example.com', now),
    ]

    expect(new Set(refusals).size).toBe(1)
  })
})
