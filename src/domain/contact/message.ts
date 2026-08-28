import { z } from 'zod'

/**
 * What a contact message has to look like before it is worth storing.
 *
 * Pure, and deliberately free of any import that needs a server: the whole
 * point of splitting it out of `actions.ts` is that the rules about what counts
 * as a usable message can be tested without a database, a session, or a
 * request. The action does the I/O; this decides what it is allowed to write.
 */

/**
 * What the form is showing right now.
 *
 * Lives here rather than beside the action that returns it because a
 * `'use server'` module may export nothing but async functions - a plain
 * `export const` in `actions.ts` is a build error, not a style question.
 */
export type ContactState =
  | { status: 'idle' }
  | { status: 'sent' }
  | {
      status: 'error'
      error: string
      field: string | null
      /**
       * What they had typed, handed straight back.
       *
       * React resets an uncontrolled form once its action returns, so without
       * this a rejected message takes the message with it - and the field most
       * likely to be rejected is the one that took the longest to write.
       */
      values: ContactDraft
    }

/** The raw strings as they came off the form, valid or not. */
export interface ContactDraft {
  username: string
  email: string
  phone: string
  subject: string
  message: string
}

export const EMPTY_DRAFT: ContactDraft = {
  username: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
}

export const CONTACT_IDLE: ContactState = { status: 'idle' }

export interface ContactMessage {
  username: string
  email: string
  /** NULL rather than '' - an empty phone number is an absent one. */
  phone: string | null
  subject: string
  message: string
}

/**
 * Phone numbers are not validated beyond their alphabet.
 *
 * There is no pattern that accepts every real international number and rejects
 * junk, and the failure mode of guessing wrong is the worst kind: somebody with
 * an unusual number is told their own phone is invalid and gives up. So the
 * rule is only "these are the characters a phone number is written with", which
 * catches a pasted sentence and nothing else.
 */
const PHONE_ALPHABET = /^[0-9+()./\s-]+$/

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(2, 'Tell us what to call you')
    .max(80, 'That name is too long'),
  email: z.email('That does not look like an email address').max(200),
  phone: z
    .string()
    .trim()
    .max(40, 'That phone number is too long')
    .regex(PHONE_ALPHABET, 'That does not look like a phone number')
    .nullable(),
  subject: z
    .string()
    .trim()
    .min(3, 'Give it a subject')
    .max(120, 'Keep the subject under 120 characters'),
  message: z
    .string()
    .trim()
    .min(10, 'Say a little more than that')
    .max(4000, 'Keep it under 4000 characters'),
})

export type ContactParse =
  | { ok: true; value: ContactMessage }
  | { ok: false; error: string; field: string | null }

/**
 * Read a message out of whatever the form sent.
 *
 * Takes unknowns rather than strings because a `FormData` field is `string |
 * File | null` and every caller would otherwise repeat the same cast. An absent
 * or blank phone collapses to NULL here, before validation, so the optional
 * field does not have to be optional twice.
 */
export function parseContactMessage(input: {
  username?: unknown
  email?: unknown
  phone?: unknown
  subject?: unknown
  message?: unknown
}): ContactParse {
  const phone = text(input.phone)

  const parsed = schema.safeParse({
    username: text(input.username) ?? '',
    email: text(input.email) ?? '',
    phone: phone && phone.trim().length > 0 ? phone : null,
    subject: text(input.subject) ?? '',
    message: text(input.message) ?? '',
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'That message cannot be sent',
      field: typeof issue?.path[0] === 'string' ? issue.path[0] : null,
    }
  }

  return { ok: true, value: parsed.data }
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** The form's own fields, as strings, for handing back after a rejection. */
export function draftFrom(formData: FormData): ContactDraft {
  const field = (name: keyof ContactDraft) => text(formData.get(name)) ?? ''

  return {
    username: field('username'),
    email: field('email'),
    phone: field('phone'),
    subject: field('subject'),
    message: field('message'),
  }
}

// ---------------------------------------------------------------------------
// Event enquiries
// ---------------------------------------------------------------------------

/**
 * Which form a message came off.
 *
 * Stored rather than inferred from `path`, because the path is context an admin
 * reads and this is something the inbox filters on. A message that arrived
 * from a page that has since been renamed should not quietly stop being a
 * booking.
 */
export type ContactKind = 'general' | 'business'

/**
 * What somebody can be planning.
 *
 * A closed list rather than free text, because this is the field the answer is
 * shaped by - a jam and a lecture want different rooms - and because a select
 * is the one part of this form that is faster to answer than to skip. "Something
 * else" is last and is not a failure: it is the option that stops anybody
 * bouncing off the form because their event is not on a list of six.
 */
export const EVENT_TYPES = [
  'Game jam',
  'Hackathon',
  'Conference',
  'Meetup',
  'Community night',
  'Class or course',
  'Something else',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

/** The event form's own fields, as strings, for handing back after a rejection. */
export interface EventDraft extends ContactDraft {
  eventType: string
  eventWhen: string
  eventSize: string
}

export const EMPTY_EVENT_DRAFT: EventDraft = {
  ...EMPTY_DRAFT,
  eventType: '',
  eventWhen: '',
  eventSize: '',
}

export type EventState =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'error'; error: string; field: string | null; values: EventDraft }

export const EVENT_IDLE: EventState = { status: 'idle' }

export interface EventEnquiry extends ContactMessage {
  eventType: string
  eventWhen: string
  eventSize: string
}

/**
 * The three facts a quote is built from, plus the ones every message needs.
 *
 * `subject` is absent on purpose: the event form does not ask for one. Making
 * somebody summarise an enquiry they are about to write out in full is a field
 * that gets "Event" typed into it, and an inbox of rows all called "Event" is
 * worse than no subject at all. It is composed below from the three answers
 * that actually distinguish one booking from another.
 *
 * "When" and "how many" are `min(1)` strings rather than a date and a number.
 * The honest answers at enquiry time are "second week of May" and "60-80", and
 * a form that refuses both is a form that loses the enquiry rather than
 * sharpening it.
 */
const eventSchema = schema.omit({ subject: true }).extend({
  eventType: z
    .string()
    .trim()
    .min(1, 'Pick what kind of event it is')
    .max(60, 'That is too long'),
  eventWhen: z
    .string()
    .trim()
    .min(1, 'Roughly when is it?')
    .max(120, 'Keep the date under 120 characters'),
  eventSize: z
    .string()
    .trim()
    .min(1, 'Roughly how many people?')
    .max(60, 'Keep that shorter'),
})

export type EventParse =
  | { ok: true; value: EventEnquiry }
  | { ok: false; error: string; field: string | null }

/**
 * Read an event enquiry out of whatever the form sent.
 *
 * Mirrors `parseContactMessage` down to the phone collapsing to NULL before
 * validation, and differs in the one way that matters: it returns a subject it
 * wrote itself.
 */
export function parseEventEnquiry(input: {
  username?: unknown
  email?: unknown
  phone?: unknown
  message?: unknown
  eventType?: unknown
  eventWhen?: unknown
  eventSize?: unknown
}): EventParse {
  const phone = text(input.phone)

  const parsed = eventSchema.safeParse({
    username: text(input.username) ?? '',
    email: text(input.email) ?? '',
    phone: phone && phone.trim().length > 0 ? phone : null,
    message: text(input.message) ?? '',
    eventType: text(input.eventType) ?? '',
    eventWhen: text(input.eventWhen) ?? '',
    eventSize: text(input.eventSize) ?? '',
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'That enquiry cannot be sent',
      field: typeof issue?.path[0] === 'string' ? issue.path[0] : null,
    }
  }

  return {
    ok: true,
    value: { ...parsed.data, subject: eventSubject(parsed.data) },
  }
}

/**
 * The line the inbox shows before anybody opens the message.
 *
 * Built from the three structured answers in the order a decision is made in -
 * what it is, when it is, how big it is - so the list is scannable without
 * opening anything. Trimmed to the column's 120 characters, which only a very
 * discursive "when" can reach.
 */
export function eventSubject(value: {
  eventType: string
  eventWhen: string
  eventSize: string
}): string {
  const line = `${value.eventType} · ${value.eventWhen} · ${value.eventSize} people`
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}

/** The event form's fields, as strings, for handing back after a rejection. */
export function eventDraftFrom(formData: FormData): EventDraft {
  const field = (name: keyof EventDraft) => text(formData.get(name)) ?? ''

  return {
    username: field('username'),
    email: field('email'),
    phone: field('phone'),
    // Never asked for, but the shape is shared with ContactDraft and an absent
    // key would make every read of it optional for one form's sake.
    subject: '',
    message: field('message'),
    eventType: field('eventType'),
    eventWhen: field('eventWhen'),
    eventSize: field('eventSize'),
  }
}

/**
 * How many messages one address may send before we stop listening.
 *
 * Not a security control - anybody can type a different address - but it is
 * what turns a stuck submit button, or somebody hammering send in frustration,
 * into three rows instead of three hundred.
 */
export const THROTTLE_MAX = 3
export const THROTTLE_WINDOW_MINUTES = 10

/** The instant the throttle window opens, as Postgres wants it. */
export function throttleWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - THROTTLE_WINDOW_MINUTES * 60_000).toISOString()
}
