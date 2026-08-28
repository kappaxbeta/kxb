import { describe, expect, test } from 'bun:test'
import {
  ADMISSION_TTL_HOURS,
  admissionExpiry,
  capacityProblem,
  guestArrival,
  type GuestLinkRecord,
  guestDisplayName,
  GUEST_NAME_MAX,
  guestLandingLabel,
  guestLandingSpot,
  guestLinkSchema,
  guestRoomSlug,
  guestLinkUrl,
  guestPathFromPastedLink,
  knockExpiry,
  knockState,
  linkExpiry,
  linkProblem,
  LINK_TTL_DAYS,
  mintGuestToken,
  mintJoinCode,
  normaliseJoinCode,
  JOIN_CODE_LENGTH,
  roomDestination,
} from '@/domain/guests/application'

/**
 * The rules a guest link is made of, tested without a database.
 *
 * The cases worth having are the ones where a link is *nearly* usable - spent
 * by one, expired by a second, revoked but not yet expired - because those are
 * the boundaries a rewrite slips through, and each one is somebody either
 * locked out of a room they were invited to or standing in one they were not.
 */

const good: GuestLinkRecord = {
  maxUses: null,
  uses: 0,
  expiresAt: null,
  revokedAt: null,
}

const NOW = new Date('2026-08-01T12:00:00.000Z')

describe('linkProblem', () => {
  test('an open link with no expiry is usable', () => {
    expect(linkProblem(good, NOW)).toBeNull()
  })

  test('a missing link is refused rather than thrown', () => {
    // The redemption path looks a token up and may find nothing, which is the
    // most common case in production - people mistype URLs. It has to be a
    // refusal and not an exception, or a typo is a 500.
    expect(linkProblem(null, NOW)).not.toBeNull()
  })

  test('a revoked link is refused even while it is otherwise fine', () => {
    expect(
      linkProblem({ ...good, revokedAt: '2026-07-31T00:00:00.000Z' }, NOW),
    ).not.toBeNull()
  })

  test('an open link is never exhausted, however many have used it', () => {
    // The point of maxUses: null. A comparison against Infinity would also pass
    // this, but a rewrite to `uses >= (maxUses ?? 0)` would not - and that is
    // the plausible mistake, because it looks like a safe default.
    expect(linkProblem({ ...good, maxUses: null, uses: 9999 }, NOW)).toBeNull()
  })

  test('a single-use link works once and not twice', () => {
    const single: GuestLinkRecord = { ...good, maxUses: 1 }
    expect(linkProblem({ ...single, uses: 0 }, NOW)).toBeNull()
    expect(linkProblem({ ...single, uses: 1 }, NOW)).not.toBeNull()
  })

  test('the use check is >= so an over-counted link stays shut', () => {
    expect(linkProblem({ ...good, maxUses: 2, uses: 3 }, NOW)).not.toBeNull()
  })

  test('expiry is exclusive at the boundary', () => {
    // A link expiring exactly now is spent. The alternative reading leaves a
    // link usable for the millisecond it dies in, which is untestable in
    // production and would only ever show up as a flake.
    const at = { ...good, expiresAt: NOW.toISOString() }
    expect(linkProblem(at, NOW)).not.toBeNull()

    const later = { ...good, expiresAt: '2026-08-01T12:00:00.001Z' }
    expect(linkProblem(later, NOW)).toBeNull()
  })

  test('every refusal reads the same, so probing a token learns nothing', () => {
    const revoked = linkProblem({ ...good, revokedAt: NOW.toISOString() }, NOW)
    const spent = linkProblem({ ...good, maxUses: 1, uses: 1 }, NOW)
    const expired = linkProblem({ ...good, expiresAt: '2026-07-01T00:00:00Z' }, NOW)
    const missing = linkProblem(null, NOW)

    expect(new Set([revoked, spent, expired, missing]).size).toBe(1)
  })
})

describe('capacityProblem', () => {
  test('no cap admits anybody', () => {
    expect(capacityProblem(null, 10_000)).toBeNull()
  })

  test('under the cap admits, at the cap refuses', () => {
    expect(capacityProblem(8, 7)).toBeNull()
    expect(capacityProblem(8, 8)).not.toBeNull()
    expect(capacityProblem(8, 9)).not.toBeNull()
  })

  test('a full room says something different from a dead link', () => {
    // They fail for unrelated reasons and the visitor's next move differs: wait
    // five minutes, versus go and ask for another link. Sharing one sentence
    // would send half of them to do the wrong thing.
    expect(capacityProblem(1, 1)).not.toBe(linkProblem(null, NOW))
  })
})

describe('guestDisplayName', () => {
  test('trims, and keeps an ordinary name', () => {
    expect(guestDisplayName('  Sam  ')).toBe('Sam')
  })

  test('falls back rather than leaving a blank nameplate', () => {
    expect(guestDisplayName('')).toBe('Guest')
    expect(guestDisplayName('   ')).toBe('Guest')
    expect(guestDisplayName(null)).toBe('Guest')
    expect(guestDisplayName(undefined)).toBe('Guest')
  })

  test('an over-long name falls back instead of being silently truncated', () => {
    // Truncating would put a half-word on somebody's nameplate and look like a
    // rendering bug. The door is where this is caught, and the door has a form
    // that can say so.
    expect(guestDisplayName('x'.repeat(GUEST_NAME_MAX + 1))).toBe('Guest')
  })

  test('a name exactly at the cap is kept', () => {
    const exact = 'x'.repeat(GUEST_NAME_MAX)
    expect(guestDisplayName(exact)).toBe(exact)
  })
})

describe('tokens and expiry', () => {
  test('tokens are url-safe and do not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => mintGuestToken()))
    expect(tokens.size).toBe(200)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  test('an admission is far shorter-lived than the link that granted it', () => {
    // The invariant behind the two constants. A visit that outlived its link
    // would mean revoking the link left people still inside.
    expect(ADMISSION_TTL_HOURS).toBeLessThan(LINK_TTL_DAYS * 24)
  })

  test('expiries are ISO strings in the future', () => {
    expect(linkExpiry(7, NOW)).toBe('2026-08-08T12:00:00.000Z')
    expect(admissionExpiry(NOW)).toBe('2026-08-02T00:00:00.000Z')
  })
})

describe('guestLinkSchema', () => {
  test('defaults to an open link with the standard lifetime', () => {
    const parsed = guestLinkSchema.parse({})
    expect(parsed.maxUses).toBeNull()
    expect(parsed.days).toBe(LINK_TTL_DAYS)
  })

  test('accepts the single-use shape the UI offers', () => {
    expect(guestLinkSchema.parse({ maxUses: 1 }).maxUses).toBe(1)
  })

  test('rejects a zero or negative use count', () => {
    // Zero would be a link that admits nobody, which is a revoked link spelled
    // confusingly; negative would sail past the `uses >= maxUses` check.
    expect(guestLinkSchema.safeParse({ maxUses: 0 }).success).toBe(false)
    expect(guestLinkSchema.safeParse({ maxUses: -1 }).success).toBe(false)
  })
})

describe('guestLinkUrl', () => {
  test('builds the same URL whether or not the origin has a trailing slash', () => {
    // Two admin surfaces render this and they must agree; a doubled slash is
    // the kind of thing that works locally and 404s behind a proxy.
    expect(guestLinkUrl('https://kxb.team', 'abc')).toBe('https://kxb.team/g/abc')
    expect(guestLinkUrl('https://kxb.team/', 'abc')).toBe('https://kxb.team/g/abc')
  })
})

describe('a link pasted into the code box', () => {
  const origin = 'https://kxb.team'
  const token = 'tDh4w9dRkqgL7m8vXc2NfZbQyE3rWs1pKjUaHo0TVYI'

  test('follows a guest door on this origin, and only the path of it', () => {
    expect(guestPathFromPastedLink(`${origin}/g/${token}`, origin)).toBe(`/g/${token}`)
    // A chat client's trailing slash, a tracking query, a fragment - dropped,
    // not forwarded. The door takes a token and nothing else.
    expect(guestPathFromPastedLink(`  ${origin}/g/${token}/?utm=x#y `, origin)).toBe(
      `/g/${token}`,
    )
  })

  test('refuses anything that is not a guest door here', () => {
    // The open redirect this exists to close: a foreign origin is never
    // followed, whatever path it carries.
    expect(guestPathFromPastedLink(`https://evil.example/g/${token}`, origin)).toBeNull()
    expect(guestPathFromPastedLink('https://evil.example/login', origin)).toBeNull()
    // Same host, wrong scheme or port - a different origin.
    expect(guestPathFromPastedLink(`http://kxb.team/g/${token}`, origin)).toBeNull()
    expect(guestPathFromPastedLink(`https://kxb.team:8443/g/${token}`, origin)).toBeNull()
    // A lookalike host, and a userinfo trick that puts our host in front.
    expect(guestPathFromPastedLink(`https://kxb.team.evil.example/g/${token}`, origin)).toBeNull()
    expect(guestPathFromPastedLink(`https://kxb.team@evil.example/g/${token}`, origin)).toBeNull()
    // Our origin, but not the door.
    expect(guestPathFromPastedLink(`${origin}/t/acme/lounge`, origin)).toBeNull()
    expect(guestPathFromPastedLink(`${origin}/g/${token}/waiting`, origin)).toBeNull()
    expect(guestPathFromPastedLink(`${origin}/g/../signup`, origin)).toBeNull()
    expect(guestPathFromPastedLink(`${origin}/g/short`, origin)).toBeNull()
    // Not a URL at all - a code, or garbage - is the form's business.
    expect(guestPathFromPastedLink('ABC234', origin)).toBeNull()
    expect(guestPathFromPastedLink('', origin)).toBeNull()
    expect(guestPathFromPastedLink('javascript:alert(1)', origin)).toBeNull()
  })
})

describe('knockState', () => {
  const now = new Date('2026-08-02T12:00:00.000Z')
  const soon = new Date('2026-08-02T12:05:00.000Z').toISOString()
  const past = new Date('2026-08-02T11:55:00.000Z').toISOString()

  test('a row with no admission is somebody still waiting', () => {
    expect(knockState({ admittedAt: null, expiresAt: soon }, now)).toBe('waiting')
  })

  test('a stamped admission is somebody who is in', () => {
    expect(
      knockState({ admittedAt: '2026-08-02T11:59:00.000Z', expiresAt: soon }, now),
    ).toBe('admitted')
  })

  /**
   * Turning somebody away deletes the row, so "no row" is the ordinary shape of
   * a refusal rather than an error case. The waiting page has to treat it as an
   * ending, not as a failed read to retry.
   */
  test('no row at all is an ending', () => {
    expect(knockState(null, now)).toBe('gone')
  })

  /**
   * The expiry is checked before the admission, which is what makes one column
   * serve both states: an admitted guest whose visit has run out is as gone as
   * a knock nobody answered, and the reaper treats them the same way.
   */
  test('a lapsed row is gone whether or not it was ever admitted', () => {
    expect(knockState({ admittedAt: null, expiresAt: past }, now)).toBe('gone')
    expect(
      knockState({ admittedAt: '2026-08-02T11:50:00.000Z', expiresAt: past }, now),
    ).toBe('gone')
  })

  test('the moment of expiry has already passed', () => {
    // `<=`, not `<`. A knock that expires exactly now is over; letting it
    // through would make the boundary depend on millisecond timing.
    expect(
      knockState({ admittedAt: null, expiresAt: now.toISOString() }, now),
    ).toBe('gone')
  })
})

describe('knock links', () => {
  test('a link lets people straight in unless it is asked not to', () => {
    // The default is the load-bearing half: every link minted before knocking
    // existed, and every caller that has not heard of it - the one-click invite
    // button - has to keep behaving exactly as it did.
    expect(guestLinkSchema.parse({}).requiresKnock).toBe(false)
    expect(guestLinkSchema.parse({ requiresKnock: true }).requiresKnock).toBe(true)
  })

  test('a knock is measured in minutes and a visit in hours', () => {
    const at = new Date('2026-08-02T12:00:00.000Z')
    expect(new Date(knockExpiry(at)).getTime()).toBeLessThan(
      new Date(admissionExpiry(at)).getTime(),
    )
  })
})

describe('a link into a room', () => {
  const slug = 'acme'

  /**
   * The round trip, which is the thing that was actually broken.
   *
   * `guestRoomSlug` could read this shape long before anything wrote it: the
   * rail minted every link with no destination at all, so a guest invited from
   * inside a room landed in the lounge, joined `loungeTopic` instead of
   * `roomTopic`, and was invisible to the person who invited them - in both
   * directions, with no error on either side. Asserting the two halves are
   * inverses is what stops that reopening.
   */
  test('is read back as the room it names', () => {
    expect(guestRoomSlug(roomDestination(slug, 'workshop'), slug)).toBe('workshop')
  })

  test('survives being confined', () => {
    // `guestArrival` is the gate every destination goes through on the way out.
    // A room link has to pass it unchanged, or the guest quietly gets the
    // lounge - which is precisely the bug, arriving by a different route.
    expect(guestArrival(roomDestination(slug, 'workshop'), slug)).toBe(
      '/t/acme/rooms/workshop',
    )
  })

  test('cannot name a room in another space', () => {
    // The slug is the caller's, so this is only reachable by passing the wrong
    // one - but it is the case that turns an invitation into a way into
    // somewhere else, so it is pinned rather than assumed.
    expect(guestArrival(roomDestination('other', 'workshop'), slug)).toBe(
      '/t/acme/lounge',
    )
  })
})

describe('which room a guest may see listed', () => {
  const slug = 'acme'

  test('the room the link points at', () => {
    expect(guestRoomSlug('/t/acme/rooms/meeting', slug)).toBe('meeting')
  })

  test('a destination that is not a room lists nothing', () => {
    // The lounge, a match, the space root: all real places to be admitted to,
    // and none of them a room - so the rail draws an empty list rather than
    // falling back to every room the space has open.
    expect(guestRoomSlug(null, slug)).toBeNull()
    expect(guestRoomSlug('/t/acme/lounge', slug)).toBeNull()
    expect(guestRoomSlug('/t/acme/battle/abc-123', slug)).toBeNull()
    expect(guestRoomSlug('/t/acme', slug)).toBeNull()
    expect(guestRoomSlug('/t/acme/rooms', slug)).toBeNull()
    expect(guestRoomSlug('/t/acme/rooms/', slug)).toBeNull()
  })

  test('a room in another space is not a room here', () => {
    // Confined through `guestArrival` first, so this is the lounge by the time
    // the room segment is looked for - the guard that stops a destination
    // naming a room in a workspace the guest was never admitted to.
    expect(guestRoomSlug('/t/other/rooms/meeting', slug)).toBeNull()
    expect(guestRoomSlug('/t/acme-evil/rooms/meeting', slug)).toBeNull()
  })

  test('only the first segment names the room', () => {
    expect(guestRoomSlug('/t/acme/rooms/meeting/anything', slug)).toBe('meeting')
  })
})

describe('where a link lets out', () => {
  const slug = 'acme'
  const lounge = '/t/acme/lounge'

  test('no destination is the lounge', () => {
    // The default every link minted before destinations existed relies on.
    expect(guestArrival(null, slug)).toBe(lounge)
    expect(guestArrival(undefined, slug)).toBe(lounge)
    expect(guestArrival('', slug)).toBe(lounge)
  })

  test('a room inside this space is followed', () => {
    // The case the whole thing exists for: invited from a match, land in it.
    expect(guestArrival('/t/acme/battle/abc-123', slug)).toBe('/t/acme/battle/abc-123')
    expect(guestArrival('/t/acme/cafe', slug)).toBe('/t/acme/cafe')
    expect(guestArrival('/t/acme', slug)).toBe('/t/acme')
  })

  test('another space is not', () => {
    // An admission is to one space. A link pointing anywhere else is the case
    // that must fail even though an owner is the one who wrote it.
    expect(guestArrival('/t/other/lounge', slug)).toBe(lounge)
    expect(guestArrival('/backoffice/access', slug)).toBe(lounge)
  })

  test('a space whose slug merely starts with this one is not', () => {
    // The trailing slash in the prefix check is what this is about: `acme-evil`
    // is a different workspace, and one anybody may create.
    expect(guestArrival('/t/acme-evil/lounge', slug)).toBe(lounge)
  })

  test('nothing that leaves the site is followed', () => {
    // The open redirect this is really guarding against - a destination is
    // written by one person and followed by another.
    expect(guestArrival('https://evil.example/x', slug)).toBe(lounge)
    expect(guestArrival('//evil.example/x', slug)).toBe(lounge)
    expect(guestArrival('/\\evil.example/x', slug)).toBe(lounge)
    expect(guestArrival('/t/acme/\\evil.example', slug)).toBe(lounge)
  })

  test('control characters are refused rather than stripped', () => {
    // Some parsers drop these before resolving, which is how a tab turns a
    // path into an origin.
    expect(guestArrival('/\tevil.example', slug)).toBe(lounge)
    expect(guestArrival('/\nevil.example', slug)).toBe(lounge)
  })

  test('queries, fragments and traversal are refused', () => {
    expect(guestArrival('/t/acme/lounge?next=https://evil.example', slug)).toBe(lounge)
    expect(guestArrival('/t/acme/lounge#x', slug)).toBe(lounge)
    expect(guestArrival('/t/acme/../../backoffice', slug)).toBe(lounge)
  })

  test('surrounding whitespace does not decide the answer', () => {
    expect(guestArrival('  /t/acme/cafe  ', slug)).toBe('/t/acme/cafe')
    expect(guestArrival('   ', slug)).toBe(lounge)
  })
})

describe('where a link lands somebody', () => {
  const slug = 'acme'

  test('no destination is the lounge', () => {
    expect(guestLandingSpot(null, slug)).toEqual({ kind: 'lounge', room: null })
    expect(guestLandingSpot(undefined, slug)).toEqual({ kind: 'lounge', room: null })
    expect(guestLandingSpot('/t/acme/lounge', slug)).toEqual({ kind: 'lounge', room: null })
  })

  test('a room is named', () => {
    expect(guestLandingSpot('/t/acme/rooms/workshop', slug)).toEqual({
      kind: 'room',
      room: 'workshop',
    })
  })

  test('a match is a kind rather than an id', () => {
    // The id is a uuid nobody can read, and the match is over long before the
    // link stops being listed.
    expect(guestLandingSpot('/t/acme/battle/8f14e45f', slug)).toEqual({
      kind: 'match',
      room: null,
    })
  })

  /**
   * The property the whole list depends on: a row describes the walk the
   * visitor actually takes. A destination that would be refused on the way in
   * lands in the lounge, so it must be *described* as the lounge - saying
   * "workshop" about a link that drops somebody in the lounge is worse than
   * saying nothing, because it is the row a host would trust.
   */
  test('a destination that could not be honoured is described as the lounge', () => {
    expect(guestLandingSpot('/t/other/rooms/workshop', slug)).toEqual({
      kind: 'lounge',
      room: null,
    })
    expect(guestLandingSpot('https://evil.example/x', slug)).toEqual({
      kind: 'lounge',
      room: null,
    })
    expect(guestLandingSpot('/t/acme-evil/rooms/workshop', slug)).toEqual({
      kind: 'lounge',
      room: null,
    })
  })

  test('the label is the room name itself, and an article otherwise', () => {
    expect(guestLandingLabel({ kind: 'room', room: 'Workshop' })).toBe('Workshop')
    expect(guestLandingLabel({ kind: 'lounge', room: null })).toBe('The lounge')
    expect(guestLandingLabel({ kind: 'match', room: null })).toBe('A match')
  })
})

describe('the join code', () => {
  test('is six characters from an alphabet you can read aloud', () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const code = mintJoinCode()
      expect(code).toHaveLength(JOIN_CODE_LENGTH)
      // The pairs people mishear, and the whole reason the alphabet is short.
      expect(code).not.toMatch(/[O0I1LUV]/)
    }
  })

  test('does not repeat itself in any small run', () => {
    // Not a uniformity test - the modulo bias is accepted and documented. This
    // only catches a generator that has stopped being random at all.
    const codes = new Set(Array.from({ length: 500 }, () => mintJoinCode()))
    expect(codes.size).toBeGreaterThan(490)
  })

  test('round-trips through the normaliser it will be looked up with', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = mintJoinCode()
      expect(normaliseJoinCode(code)).toBe(code)
    }
  })
})

describe('normalising a code somebody typed', () => {
  test('accepts the shapes people actually type', () => {
    expect(normaliseJoinCode('abc234')).toBe('ABC234')
    expect(normaliseJoinCode('  ABC234  ')).toBe('ABC234')
    // Read aloud in threes, written down with a hyphen.
    expect(normaliseJoinCode('ABC-234')).toBe('ABC234')
    expect(normaliseJoinCode('ABC 234')).toBe('ABC234')
  })

  test('refuses the wrong length rather than guessing', () => {
    expect(normaliseJoinCode('ABC23')).toBeNull()
    expect(normaliseJoinCode('ABC2345')).toBeNull()
    expect(normaliseJoinCode('')).toBeNull()
  })

  test('refuses a symbol the alphabet does not have', () => {
    // Not corrected to zero. A code with an O in it was *misheard*, and picking
    // a letter for the speaker would open a door they did not name.
    expect(normaliseJoinCode('ABCO34')).toBeNull()
    expect(normaliseJoinCode('ABCI34')).toBeNull()
    expect(normaliseJoinCode('ABC_34')).toBeNull()
  })
})
