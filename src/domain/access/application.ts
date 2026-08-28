import { randomBytes } from 'node:crypto'
import { z } from 'zod'

/**
 * What has to be true before somebody joins the waiting list, and before an
 * invite gets them past a closed door.
 *
 * Pure, and free of any import that needs a server or a request - the same
 * split `contact/message.ts` makes, for the same reason. The rules about what
 * counts as a usable application, and about when an invite has run out, are
 * the part worth testing without a database in the room. The action does the
 * I/O; this decides what it is allowed to write and who it is allowed to let
 * in.
 */

// ---------------------------------------------------------------------------
// Joining the list
// ---------------------------------------------------------------------------

/**
 * What the form is showing right now.
 *
 * Lives here rather than beside the action that returns it because a
 * `'use server'` module may export nothing but async functions - a plain
 * `export const` in `actions.ts` is a build error, not a style question.
 */
export type ApplicationState =
  | { status: 'idle' }
  | { status: 'listed' }
  | {
      status: 'error'
      error: string
      field: string | null
      /**
       * What they had typed, handed straight back. React resets an uncontrolled
       * form once its action returns, and retyping a rejected address is the
       * kind of small insult that makes people give up on a waiting list.
       */
      values: ApplicationDraft
    }

/** The raw strings as they came off the form, valid or not. */
export interface ApplicationDraft {
  email: string
  username: string
  note: string
  /** Checkbox state, carried as a string the way FormData reports it. */
  newsletter: boolean
}

export const EMPTY_APPLICATION: ApplicationDraft = {
  email: '',
  username: '',
  note: '',
  newsletter: false,
}

export const APPLICATION_IDLE: ApplicationState = { status: 'idle' }

/** An application as it should be stored, minus the columns the request fills. */
export interface Application {
  email: string
  /** NULL rather than '' - an absent name is absent, not empty. */
  username: string | null
  note: string | null
  newsletterConsent: boolean
}

const schema = z.object({
  email: z.email('That does not look like an email address').max(200),
  username: z
    .string()
    .trim()
    .max(80, 'That name is too long')
    .nullable(),
  note: z
    .string()
    .trim()
    .max(2000, 'Keep it under 2000 characters')
    .nullable(),
  newsletterConsent: z.boolean(),
})

export type ApplicationParse =
  | { ok: true; value: Application }
  | { ok: false; error: string; field: string | null }

/**
 * Read an application out of whatever the form sent.
 *
 * Only the address is required. A waiting list that demands a name and a reason
 * before it will take an email address is a waiting list that collects fewer
 * addresses, and neither field decides anything - an admin reads them, nothing
 * branches on them.
 *
 * Takes unknowns rather than strings because a `FormData` field is
 * `string | File | null` and every caller would otherwise repeat the same cast.
 */
export function parseApplication(input: {
  email?: unknown
  username?: unknown
  note?: unknown
  newsletter?: unknown
}): ApplicationParse {
  const username = text(input.username)
  const note = text(input.note)

  const parsed = schema.safeParse({
    email: text(input.email)?.trim().toLowerCase() ?? '',
    username: username && username.trim().length > 0 ? username : null,
    note: note && note.trim().length > 0 ? note : null,
    // A checkbox is absent from FormData when unticked, present as 'on' when
    // ticked. Anything else is somebody posting by hand, and is not a yes.
    newsletterConsent: input.newsletter === 'on' || input.newsletter === true,
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'That application cannot be sent',
      field: typeof issue?.path[0] === 'string' ? issue.path[0] : null,
    }
  }

  return { ok: true, value: parsed.data }
}

/** The form's own fields, as strings, for handing back after a rejection. */
export function applicationDraftFrom(formData: FormData): ApplicationDraft {
  const field = (name: string) => text(formData.get(name)) ?? ''

  return {
    email: field('email'),
    username: field('username'),
    note: field('note'),
    newsletter: formData.get('newsletter') === 'on',
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * The consent columns, filled in together or left empty together.
 *
 * The table's check constraint says a consent without a time and an address is
 * not a consent; this is the one place that builds the set, so there is exactly
 * one thing to get right rather than one per caller. An unticked box writes
 * three NULLs, not a timestamp for an agreement nobody made.
 */
export function consentEvidence(
  agreed: boolean,
  ip: string | null,
  userAgent: string | null,
  now: Date = new Date(),
): {
  newsletter_consent: boolean
  consent_at: string | null
  consent_ip: string | null
  consent_user_agent: string | null
} {
  if (!agreed) {
    return {
      newsletter_consent: false,
      consent_at: null,
      consent_ip: null,
      consent_user_agent: null,
    }
  }

  return {
    newsletter_consent: true,
    consent_at: now.toISOString(),
    consent_ip: ip,
    consent_user_agent: userAgent?.slice(0, 500) ?? null,
  }
}

/**
 * How many applications one address may send before we stop listening.
 *
 * Not a security control - anybody can type a different address - but it turns
 * a stuck submit button into two rows instead of two hundred. Same reasoning as
 * the contact form's throttle, and a smaller number because there is no reason
 * to apply twice.
 */
export const APPLY_THROTTLE_MAX = 2
export const APPLY_THROTTLE_WINDOW_MINUTES = 10

/** The instant the throttle window opens, as Postgres wants it. */
export function applyThrottleWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - APPLY_THROTTLE_WINDOW_MINUTES * 60_000).toISOString()
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/**
 * A fresh invite token.
 *
 * 32 bytes of CSPRNG, base64url so it survives a URL without escaping. This is
 * the only thing standing between a stranger and an account while the door is
 * shut, so it is `randomBytes` and not `Math.random` - and it is long enough
 * that guessing is not a strategy, which matters because the redemption path
 * cannot rate-limit by identity when the whole point is that the caller has no
 * account yet.
 */
export function mintInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

/** How long a new invite lasts unless an admin says otherwise. */
export const INVITE_TTL_DAYS = 14

export function inviteExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** The columns `inviteProblem` needs. A subset of the row, so tests can build one. */
export interface InviteRecord {
  /** Locks the invite to one mailbox. NULL means anybody holding the link. */
  email: string | null
  maxUses: number
  uses: number
  expiresAt: string | null
  revokedAt: string | null
}

/**
 * Why this invite cannot be used, or null if it can.
 *
 * One function rather than a chain of ifs at the call site, because there are
 * two call sites - the sign-up action and the OAuth callback - and an invite
 * that is honoured by one and refused by the other is the bug this shape
 * exists to make impossible.
 *
 * Every rejection is the same sentence on purpose. Distinguishing "expired"
 * from "already used" from "not for you" tells somebody probing tokens which
 * of their guesses landed, and a person holding a genuine invite that stopped
 * working needs to talk to a human either way.
 */
export function inviteProblem(
  invite: InviteRecord | null,
  email: string,
  now: Date = new Date(),
): string | null {
  const refusal = 'That invitation is not valid any more. Ask for a new one.'

  if (!invite) return refusal
  if (invite.revokedAt) return refusal
  if (invite.uses >= invite.maxUses) return refusal
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now.getTime()) {
    return refusal
  }

  // An addressed invite is for that mailbox and no other. Compared
  // case-insensitively because nobody types their own address the same way
  // twice, and an invite that works from the email client but not from a
  // retyped form is indistinguishable from a broken invite.
  if (invite.email && invite.email.toLowerCase() !== email.trim().toLowerCase()) {
    return refusal
  }

  return null
}
