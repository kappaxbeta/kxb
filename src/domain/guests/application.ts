import { randomBytes } from 'node:crypto'
import { z } from 'zod'

/**
 * What has to be true before a link lets somebody stand in a space.
 *
 * Pure, and free of any import that needs a server or a request - the same
 * split `access/application.ts` makes, for the same reason. Whether a link is
 * still good, and whether there is room for one more body, are the parts worth
 * testing without a database in the room. The action does the I/O; this decides
 * what it is allowed to do.
 *
 * ---------------------------------------------------------------------------
 * A guest link is not an invitation
 * ---------------------------------------------------------------------------
 * The two look alike and are near-inverses, which is the thing most worth
 * holding on to while reading either file.
 *
 * An `account_invites` token creates an *account* and enters no space. A guest
 * link enters exactly *one* space and creates no account. So there is no email
 * anywhere here - not on the link, not at the door. An invitation is addressed
 * to somebody; a guest link is held by whoever is holding it, and asking a
 * visitor for their address before they may look at a room would be collecting
 * a personal detail the feature has no use for.
 *
 * What the door asks for instead is a display name, because the one thing the
 * room genuinely needs is something to write on their nameplate.
 */

// ---------------------------------------------------------------------------
// The token
// ---------------------------------------------------------------------------

/**
 * The secret in the URL.
 *
 * 32 bytes of CSPRNG, base64url so it survives a URL without escaping - the
 * same shape and the same reasoning as `mintInviteToken`. This is the only
 * thing standing between a stranger and a space, and the redemption path cannot
 * rate-limit by identity when the whole point is that the caller has no
 * account, so it has to be long enough that guessing is not a strategy.
 */
export function mintGuestToken(): string {
  return randomBytes(32).toString('base64url')
}

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

/**
 * The alphabet a join code is drawn from.
 *
 * Chosen for being *said*, not for entropy. No `O`/`0`, no `I`/`1`/`L`, no
 * `U`/`V` - those are the pairs people mishear across a table and mistype off a
 * phone screen, and surviving that is the entire job of having a code at all.
 * Twenty-six symbols left, which is a coincidence rather than a design.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ'

/** How many characters. Six is short enough to say in one breath. */
export const JOIN_CODE_LENGTH = 6

/**
 * A spoken form for a guest link.
 *
 * **Not a credential, and the difference from `mintGuestToken` is the point.**
 * The token is the only thing between a stranger and a space, so it is 32 bytes
 * of CSPRNG. A code is six characters and is guessable by anybody willing to
 * try; what makes that acceptable is that it names one link, dies with it, and
 * that most links expire in `LINK_TTL_DAYS`. A door that must not be guessed
 * wants `requires_knock`, where somebody still has to be let in.
 *
 * `randomBytes` rather than `Math.random` even so. It costs nothing here, and a
 * predictable sequence would let somebody who saw one code narrow the next -
 * which is a different and much worse property than "guessable one at a time".
 */
export function mintJoinCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH)
  let code = ''

  for (let index = 0; index < JOIN_CODE_LENGTH; index++) {
    /*
     * Modulo bias is real here and is being accepted deliberately: 256 % 29
     * leaves the first eight symbols very slightly likelier. For a secret that
     * would matter; for a code whose whole security story is "it is not a
     * secret", rejection sampling would be ceremony.
     */
    code += CODE_ALPHABET[bytes[index]! % CODE_ALPHABET.length]
  }

  return code
}

/**
 * A code as somebody typed it, in the form the column holds - or null.
 *
 * Uppercased, and stripped of the spaces and hyphens people add when reading
 * six characters aloud. Null for anything that is not a code, so the caller
 * refuses without a query rather than sending free text to the database.
 *
 * `O`→`0` is deliberately *not* corrected, and nor is `I`→`1`: those symbols
 * are not in the alphabet at all, so a code containing one was misheard rather
 * than mistyped, and guessing which letter was meant would open a door the
 * speaker did not name.
 */
export function normaliseJoinCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, '')
  if (cleaned.length !== JOIN_CODE_LENGTH) return null

  for (const character of cleaned) {
    if (!CODE_ALPHABET.includes(character)) return null
  }

  return cleaned
}

/** How long a new link lasts unless whoever made it says otherwise. */
export const LINK_TTL_DAYS = 7

/**
 * How long one guest's admission lasts once they walk in.
 *
 * Short on purpose, and deliberately much shorter than the link that granted
 * it. A link is a door somebody props open for a week; an admission is one
 * visit through it. Making the visit outlive the afternoon it happened in
 * would mean the natural end of a guest's session is an admin remembering to
 * revoke it, and that is the failure mode this number exists to avoid.
 */
export const ADMISSION_TTL_HOURS = 12

/**
 * How long somebody may stand at the door before the knock lapses.
 *
 * Deliberately measured in minutes against the admission's hours. A knock is a
 * question somebody is waiting on the answer to, and an hour-old one is not a
 * question any more - it is a stranger's name sitting in a list, which is
 * exactly the queue an admin ends up ignoring and the feature dying of.
 *
 * Reusing `expires_at` for this rather than adding a second timestamp is what
 * lets `reap_expired_guests()` sweep an unanswered knock with no idea that
 * knocking exists. Being let in resets the clock to the full admission - see
 * `admissionExpiry`.
 */
export const KNOCK_TTL_MINUTES = 10

export function linkExpiry(days: number = LINK_TTL_DAYS, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function admissionExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + ADMISSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
}

export function knockExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + KNOCK_TTL_MINUTES * 60 * 1000).toISOString()
}

/**
 * Where a visitor stands, from their own row.
 *
 * The waiting page asks this every few seconds and needs three answers, not
 * two: they are in, they are still waiting, or there is nothing to wait for any
 * more. The third covers being turned away *and* the knock lapsing *and* the
 * link being revoked underneath them, and it collapses them on purpose - all
 * three mean "this is over, ask whoever sent it", and distinguishing "they said
 * no" from "nobody came" would be telling a stranger something about the people
 * in the room.
 *
 * Pure, so the state machine the waiting page runs on can be read and tested
 * without a database or a clock.
 */
export type KnockState = 'waiting' | 'admitted' | 'gone'

export function knockState(
  row: { admittedAt: string | null; expiresAt: string } | null,
  now: Date = new Date(),
): KnockState {
  // No row at all is the ordinary shape of being turned away: refusing deletes
  // it, and so does the reaper.
  if (!row) return 'gone'
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return 'gone'
  return row.admittedAt ? 'admitted' : 'waiting'
}

// ---------------------------------------------------------------------------
// Is the link still good?
// ---------------------------------------------------------------------------

/** The columns `linkProblem` needs. A subset of the row, so tests can build one. */
export interface GuestLinkRecord {
  /** Total admissions this link may ever grant. NULL is an open link. */
  maxUses: number | null
  uses: number
  expiresAt: string | null
  revokedAt: string | null
}

/**
 * Why this link cannot be used, or null if it can.
 *
 * Every rejection is the same sentence, for the reason `inviteProblem` gives:
 * telling somebody probing tokens whether they hit a revoked link or an
 * exhausted one tells them which of their guesses landed, and a person holding
 * a link that stopped working needs to talk to whoever sent it either way.
 *
 * The `maxUses === null` branch is the open link, and reading it as "skip the
 * use check entirely" rather than "compare against Infinity" is deliberate -
 * see the migration's note on why NULL and not a sentinel number.
 */
export function linkProblem(
  link: GuestLinkRecord | null,
  now: Date = new Date(),
): string | null {
  const refusal = 'That link is not valid any more. Ask whoever sent it for a new one.'

  if (!link) return refusal
  if (link.revokedAt) return refusal
  if (link.maxUses !== null && link.uses >= link.maxUses) return refusal
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) {
    return refusal
  }

  return null
}

/**
 * Is there room for one more guest right now?
 *
 * Separate from `linkProblem` because it fails for a different reason and
 * deserves a different sentence. A dead link is the visitor's problem and
 * nothing they can do will fix it; a full room is nobody's fault and waiting
 * five minutes may well fix it. Collapsing both into one refusal would send
 * somebody to ask for a new link when the link was fine.
 *
 * `limit === null` is "no cap" - the flag is off - and is checked first so that
 * unlimited needs no sentinel number, matching `tenant_guest_limit()`.
 */
export function capacityProblem(limit: number | null, current: number): string | null {
  if (limit === null) return null
  if (current < limit) return null

  return 'This space is full right now. Try again in a few minutes.'
}

// ---------------------------------------------------------------------------
// What a guest is called
// ---------------------------------------------------------------------------

/**
 * The name that goes on the nameplate.
 *
 * Trimmed, length-capped, and that is all the validation there is. It is not
 * checked against anybody else's name and it is not reserved: two guests called
 * "Sam" is a mild confusion, while telling a visitor at the door that their own
 * name is taken is a worse one.
 *
 * The cap is what stops a nameplate from being used as a billboard - a
 * thousand-character name would render across the whole room, and the scene has
 * no other length limit standing behind this one.
 */
export const GUEST_NAME_MAX = 24

export const guestNameSchema = z
  .string()
  .trim()
  .min(1, 'Pick a name so people can tell who you are')
  .max(GUEST_NAME_MAX, `Names are up to ${GUEST_NAME_MAX} characters`)

/**
 * What to call a guest who did not say.
 *
 * A visible, obviously-temporary name rather than an empty nameplate, because
 * an unnamed body in the room reads as a bug to everybody who can see it.
 */
export const ANONYMOUS_GUEST_NAME = 'Guest'

export function guestDisplayName(raw: string | null | undefined): string {
  const parsed = guestNameSchema.safeParse(raw ?? '')
  return parsed.success ? parsed.data : ANONYMOUS_GUEST_NAME
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

/**
 * What a link may be created as.
 *
 * `maxUses` null is the open link and 1 is the single-use link; the UI offers
 * exactly those two, and the schema allows anything in between because a
 * "twelve people from the conference" link is a reasonable thing to want and
 * costs nothing to permit.
 */
export const guestLinkSchema = z.object({
  label: z.string().trim().max(80).optional().default(''),
  maxUses: z.number().int().positive().nullable().default(null),
  days: z.number().int().min(1).max(90).default(LINK_TTL_DAYS),
  /**
   * Whether whoever holds this link has to be let in by somebody inside.
   *
   * Defaults false so every link minted before this existed, and every link
   * minted by a caller that has not heard of it, behaves exactly as it did. The
   * one-click `GuestInviteButton` is such a caller on purpose: it exists for
   * the moment mid-game when somebody wants a friend in *now*, and a link that
   * then makes them wait for a door they were just promised is the opposite of
   * what that button is for.
   */
  requiresKnock: z.boolean().default(false),

  /**
   * Where in the space this link lets out, or null for the lounge.
   *
   * Only ever a relative path, and `guestArrival` is what decides whether a
   * given one is allowed - the schema's job here is to refuse anything absurd
   * before it reaches the database, not to be the check that matters.
   */
  destination: z.string().trim().max(200).nullable().default(null),
})

export type GuestLinkDraft = z.infer<typeof guestLinkSchema>

/** The URL to hand somebody. One place, so the two admin surfaces agree. */
export function guestLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/g/${token}`
}

/**
 * The door a pasted link names, or null if it is not one of ours.
 *
 * `/join` honours `?c=` so the QR and the spoken code can be the same door,
 * and somebody who has the whole link on their clipboard will paste that rather
 * than retype six characters out of it. Following it used to be a one-liner:
 * "if it looks like a URL, redirect to it". That is an open redirect - `c` is
 * whatever the visitor's URL said, and `kxb.team/join?c=https://evil.example`
 * sent anybody off-site wearing this deployment's domain.
 *
 * So the answer is confined, the way `guestArrival` confines a destination: the
 * only thing that comes back is a `/g/<token>` path on this origin, and
 * everything else is null - which the page reads as "treat it as a code", and
 * the action then refuses with the same sentence it gives any wrong code.
 *
 * The path comes back rather than the pasted string, so a query, a fragment,
 * or a stray trailing slash somebody's chat client added are dropped rather
 * than forwarded. The token itself is `[A-Za-z0-9_-]` - base64url - and the
 * pattern says so, because a redirect target is the one place a liberal match
 * is never worth it.
 */
export function guestPathFromPastedLink(input: string, origin: string): string | null {
  let pasted: URL
  let home: URL
  try {
    pasted = new URL(input.trim())
    home = new URL(origin)
  } catch {
    return null
  }

  if (pasted.origin !== home.origin) return null

  const match = /^\/g\/([A-Za-z0-9_-]{16,})\/?$/.exec(pasted.pathname)
  return match ? `/g/${match[1]}` : null
}

/** Where a guest lands when the link does not say. */
export function loungePath(slug: string): string {
  return `/t/${slug}/lounge`
}

/**
 * The path to drop a guest at, given what their link asked for.
 *
 * An open redirect is the thing this exists to prevent, and it is worth being
 * explicit about why the risk is real: the destination is written by an owner
 * and read back on somebody else's behalf, so "the person who set it is
 * trusted" is not the same claim as "the person following it is safe". A
 * compromised or careless admin could otherwise turn an invitation into a
 * one-hop redirect to anywhere, wearing this deployment's domain.
 *
 * So the answer is not sanitised, it is *confined*: the only paths that come
 * back are ones inside this tenant's own space, and everything else silently
 * becomes the lounge. Silently, because a guest reading an error about a
 * malformed path has learned nothing they can act on - they were invited, and
 * the lounge is where an invitation without a destination has always led.
 *
 * The slug is passed in rather than parsed out of the path so that the check is
 * against the tenant the visitor is actually being admitted to. A link whose
 * destination points into a *different* space is exactly the case that must
 * fail, and comparing the path with itself would let it through.
 */
export function guestArrival(destination: string | null | undefined, slug: string): string {
  const home = loungePath(slug)
  if (!destination) return home

  const path = destination.trim()

  // Must be a plain relative path. A backslash is here because browsers have
  // historically treated `/\evil.com` as protocol-relative, and `//` because it
  // is protocol-relative in the spec rather than by accident.
  if (!path.startsWith('/')) return home
  if (path.startsWith('//') || path.startsWith('/\\')) return home
  if (path.includes('\\')) return home

  // No credentials, no fragment games, no second URL smuggled in a parameter.
  // A destination is a path within a space; nothing here needs a query string,
  // so the simplest correct rule is to allow none.
  if (/[?#]/.test(path)) return home

  // Control characters, including the newline and tab that some parsers strip
  // before resolving - which is how `/\tevil.com` becomes an origin.
  if (/[\u0000-\u001f\u007f]/.test(path)) return home

  // Traversal cannot climb out of the prefix check below, but a path holding
  // `..` is not one anybody meant to write, and refusing it keeps the rule
  // something a reader can hold in their head.
  if (path.split('/').includes('..')) return home

  // The confinement itself. The trailing slash is load-bearing: without it
  // `/t/acme-evil/...` passes the prefix test for the space `acme`.
  return path === `/t/${slug}` || path.startsWith(`/t/${slug}/`) ? path : home
}

/**
 * The one room a guest was invited into, if their link named one.
 *
 * A guest is not a member, and the room list is the clearest place that
 * difference shows: a member browses a space and picks somewhere to be, while a
 * guest was handed a door by somebody and let in through it. Showing them every
 * room the space has open tells them what a company's evening looks like -
 * "Meeting", "Testing", "1:1 with Sam" - which is a roster of the organisation
 * given to somebody who was invited to one conversation.
 *
 * So the rail and the rooms page ask this, and a guest sees the room they came
 * for and nothing else. Null covers both "their link pointed at the lounge" and
 * "their link pointed at something that is not a room" - a match, the space
 * root - and in every one of those cases the honest list is empty.
 *
 * Confined through `guestArrival` first, so a destination that escapes the
 * space cannot smuggle a slug out of another one: everything it refuses comes
 * back as the lounge path, which has no room segment and so answers null.
 */
export function guestRoomSlug(
  destination: string | null | undefined,
  slug: string,
): string | null {
  const path = guestArrival(destination, slug)
  const prefix = `/t/${slug}/rooms/`
  if (!path.startsWith(prefix)) return null

  /**
   * The first segment only. A destination deeper inside a room - a URL the
   * product does not have today - still names that room, and taking the head is
   * both what that means and what stops `rooms/a/../b` reading as `b`.
   */
  const room = path.slice(prefix.length).split('/')[0]
  return room ? room : null
}

/** The three places a link can put somebody, as far as anybody cares. */
export type GuestLandingKind = 'lounge' | 'room' | 'match'

export interface GuestLanding {
  kind: GuestLandingKind
  /**
   * Which one, as the destination names it: a room's slug, a match's id, and
   * null for the lounge, of which a space has exactly one.
   *
   * The address rather than the name, because that is all a string can be read
   * for. Turning it into something a person called it is a query, which is
   * `listGuestLinks`'s job and lands in `name` below.
   */
  ref: string | null
  /**
   * What it is called, once somebody has looked it up. Null until then.
   *
   * Two fields rather than one that changes meaning halfway - this used to be a
   * single `room` holding a slug on the way out of here and a name by the time
   * it was drawn, which worked and read as a bug every time anybody followed
   * it. Null is also a real answer and not only "not asked": a room that has
   * been closed and a match that has ended still have links pointing at them,
   * and the row then falls back to the category word.
   */
  name: string | null
}

/**
 * Where a link drops somebody, in terms a host can read off a list.
 *
 * The list of links used to say how each one behaves - open or single entry,
 * whether it makes them knock - and nothing at all about where it goes. Every
 * row looked identical, which made "send them the one into the workshop" a
 * guess between four indistinguishable rows, and getting it wrong drops a
 * visitor in the lounge wondering where everybody is.
 *
 * Derived from the destination rather than stored beside it, because the
 * destination is the truth and a second copy is a second thing to keep right.
 * Confined through `guestArrival` first, so anything that could not actually be
 * honoured is described as the lounge - which is where it would in fact land -
 * rather than as whatever it claims to say. A row must describe the walk the
 * visitor takes, not the string somebody typed.
 *
 * A match carries its id here for the same reason a room carries its slug: it
 * is the handle the name is looked up by. The id is never drawn - `A match`
 * three times over is exactly the wall of identical rows this function exists
 * to break up, and a uuid instead of it would be the same wall in hex.
 */
export function guestLandingSpot(
  destination: string | null | undefined,
  slug: string,
): GuestLanding {
  const path = guestArrival(destination, slug)

  const room = guestRoomSlug(path, slug)
  if (room) return { kind: 'room', ref: room, name: null }

  const prefix = `/t/${slug}/battle/`
  if (path.startsWith(prefix)) {
    // Whatever the first segment after the prefix is, and nothing else: a
    // battle's own sub-pages are still that battle, and an empty tail is a
    // match link with no match in it, which has no name to look up.
    const battle = path.slice(prefix.length).split('/')[0]
    return { kind: 'match', ref: battle ? battle : null, name: null }
  }

  return { kind: 'lounge', ref: null, name: null }
}

/**
 * The same answer as a phrase, so two lists cannot word it differently.
 *
 * Takes the thing's own name when one has been looked up and adds nothing to it
 * - "into the room Workshop" is a label written by somebody who has never had
 * to scan forty of them. Without a name it falls back to the category word,
 * which gets an article because it is a category rather than a name, and that
 * is the whole difference the reader needs.
 *
 * The three category words are passed in rather than written here, because one
 * of the two lists that draws this is inside a space and a space now has a
 * language. They default to English, which is what the backoffice - the other
 * caller, and an English surface by decision - still wants. A room's own name
 * is never translated: it is what somebody called it.
 */
export interface GuestLandingWords {
  room: string
  match: string
  lounge: string
}

const LANDING_EN: GuestLandingWords = {
  room: 'A room',
  match: 'A match',
  lounge: 'The lounge',
}

export function guestLandingLabel(
  landing: GuestLanding,
  words: GuestLandingWords = LANDING_EN,
): string {
  if (landing.kind === 'lounge') return words.lounge
  return landing.name ?? (landing.kind === 'room' ? words.room : words.match)
}

/**
 * The destination a guest link into one match carries.
 *
 * Here rather than beside the revoker in ./match-links.ts because both ends of
 * the round trip need it and only one of them is on the server: the invite
 * button in the battle room is a client component, and the sweep that takes the
 * links back afterwards finds them by matching this exact string. Two copies of
 * the format would mean the sweep quietly stopping the day either one changed.
 */
export function battleDestination(slug: string, battleId: string): string {
  return `/t/${slug}/battle/${battleId}`
}

/**
 * The destination a guest link into one room carries.
 *
 * The exact inverse of `guestRoomSlug`, and deliberately adjacent to it: that
 * function has been reading this shape out of destinations since rooms shipped,
 * and the rail has been writing links with no destination at all the whole
 * time. So the reading half worked, the filtering half worked, the tests
 * passed - and every link handed out from inside a room still dropped the
 * visitor in the lounge, because nothing ever produced the string.
 *
 * That failure is worth naming, because it is invisible from either side. A
 * member in a room is on `roomTopic(roomId)` and the guest is on
 * `loungeTopic(tenantId)`; both have working presence, both see an empty room,
 * and neither gets an error. The two of them are simply not in the same place.
 */
export function roomDestination(slug: string, roomSlug: string): string {
  return `/t/${slug}/rooms/${roomSlug}`
}

/**
 * Who may answer a knock.
 *
 * Every member, not only owners and admins, and the width is deliberate:
 * somebody is at the door of a room other people are already standing in, and
 * requiring the owner to be online to answer would leave visitors waiting out
 * their ten minutes in front of a room full of people who could see them.
 *
 * Guests are excluded by omission: a visitor who was let in must not be able to
 * hold the door open for the next one, or the first person through a forwarded
 * link becomes the doorman.
 *
 * Here rather than beside the actions that read it, because the door's route
 * handler needs it too and a `'use server'` module may export nothing but
 * actions. This is a rule about who may do a thing, which is what this file is.
 */
export const DOORKEEPERS = ['owner', 'admin', 'member'] as const
