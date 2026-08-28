/**
 * What a promo code is, and what the answers to redeeming one mean.
 *
 * Pure, and importable from a Client Component - which is the constraint that
 * shaped it, and the reason `mintPromoCode` lives next door in `mint.ts`
 * instead of here. The sign-up form and the redeem box both normalise what
 * somebody typed before sending it, so that "cafe 24" and "CAFE24" stop being
 * two different requests; a single `node:crypto` import in this file would put
 * that normaliser out of the browser's reach. Same split, and the same reason,
 * as `analytics/campaign.ts` and `analytics/track.ts`.
 *
 * The refusal wording lives here too. `redeem_promo_code()` in SQL returns a
 * bare outcome word on purpose - see its comment - so this is the single place
 * that turns "inactive" into a sentence, and the German pages get theirs from
 * the same table rather than from a second copy of the reasoning.
 */

import type { Tier } from '@/domain/billing/tiers'
import { DEFAULT_LOCALE, type Locale } from '@/domain/i18n/locale'

// ---------------------------------------------------------------------------
// The code itself
// ---------------------------------------------------------------------------

/**
 * The shape of a code once it has been cleaned up.
 *
 * Uppercase letters, digits and hyphens, matching the column's own check
 * constraint. Deliberately no underscores or dots: this is a string that gets
 * read off a poster and typed by hand, and every character class that is hard
 * to describe out loud is a support email.
 */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/

/**
 * What somebody typed, as it should be looked up - or null if it could not be a
 * code at all.
 *
 * Spaces are stripped rather than trimmed, because a code read aloud arrives as
 * "CAFE 24" about as often as "CAFE24", and treating those as different codes
 * would be technically defensible and practically useless. Everything else that
 * fails is returned as null rather than mangled into something plausible: a
 * lookup for a string we invented would either miss (confusing) or hit
 * (alarming).
 */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.replace(/\s+/g, '').toUpperCase()
  return CODE_PATTERN.test(code) ? code : null
}

// ---------------------------------------------------------------------------
// Redeeming
// ---------------------------------------------------------------------------

/** Every answer `redeem_promo_code()` can give. */
export type RedeemOutcome = 'ok' | 'unknown' | 'inactive' | 'already' | 'not_new'

export function isRedeemOutcome(value: unknown): value is RedeemOutcome {
  return (
    value === 'ok' ||
    value === 'unknown' ||
    value === 'inactive' ||
    value === 'already' ||
    value === 'not_new'
  )
}

/** Where a redemption was made. Provenance, not permission. */
/**
 * How a redemption came about.
 *
 * Four doors a *person* walks through, and one that nobody walks through at
 * all: `grant` is an operator putting an account on a plan directly. It is its
 * own value rather than being folded into `link` because every report that
 * groups by source would otherwise count operator grants as campaign traffic -
 * wrong in the direction that flatters us.
 */
export type RedeemSource = 'signup' | 'link' | 'picker' | 'space' | 'grant'

export function isRedeemSource(value: unknown): value is RedeemSource {
  return (
    value === 'signup' ||
    value === 'link' ||
    value === 'picker' ||
    value === 'space' ||
    value === 'grant'
  )
}

export interface RedeemGrant {
  /** When the free run ends, ISO. */
  until: string
  days: number
  /**
   * Which tier the month is of.
   *
   * Worth carrying all the way back to the caller rather than leaving it in the
   * database, because "a free month" is no longer a complete sentence: the
   * difference between a month of xo and a month of xp is whether the XP suite
   * appears, and a confirmation screen that does not say which one somebody
   * just got is a confirmation screen that will be misread half the time.
   */
  tier: Tier
}

export type RedeemResult =
  | { ok: true; grant: RedeemGrant }
  | { ok: false; outcome: Exclude<RedeemOutcome, 'ok'>; error: string }

/**
 * Why a redemption was refused, in words.
 *
 * `unknown` and `inactive` deliberately say almost the same thing. Splitting
 * them finely - "that code expired on the 3rd", "that code is fully claimed" -
 * would hand somebody typing codes at random a way to learn which strings are
 * real, and would do it on an endpoint reachable without an account. What they
 * do share is a way forward, which is the part a person holding a genuine code
 * off a genuine poster actually needs.
 *
 * `already` and `not_new` are specific, because by the time either can fire the
 * caller is signed in and is being told a fact about their own account. Being
 * vague there is not privacy, it is just unhelpful.
 */
const REFUSALS: Record<Exclude<RedeemOutcome, 'ok'>, string> = {
  unknown: 'That code is not one of ours. Check it and try again.',
  inactive: 'That code is no longer available.',
  // "of that plan", not "its free month". Since vouchers went per-tier an
  // account can hold a free month of xo and still be owed one of xp, so a flat
  // "you have had yours" would be wrong half the time it fires.
  already: 'This account has already had a free month of that plan.',
  not_new:
    'The free month is for people who have not had that plan before, and this account has.',
}

export function refusalFor(outcome: Exclude<RedeemOutcome, 'ok'>): string {
  return REFUSALS[outcome]
}

/**
 * The other languages. One table per locale rather than a pair of constants, so
 * a refusal cannot exist in one language only - adding an outcome above fails
 * here until every language has a sentence for it, and adding a language fails
 * here until it has all four.
 *
 * Both translations are formal, which is what the app does everywhere except
 * the tour - and a code being refused is not the moment to be the exception.
 * See the note over `RAIL_BG` for the rule and why the tour is outside it.
 */
const TRANSLATED: Record<
  Exclude<Locale, 'en'>,
  Record<Exclude<RedeemOutcome, 'ok'>, string>
> = {
  de: {
    unknown: 'Diesen Code kennen wir nicht. Bitte prüfen und erneut versuchen.',
    inactive: 'Dieser Code ist nicht mehr verfügbar.',
    already: 'Dieses Konto hatte für diesen Tarif bereits einen Gratismonat.',
    not_new:
      'Der Gratismonat gilt nur für Tarife, die dieses Konto noch nicht hatte.',
  },
  bg: {
    unknown: 'Този код не е наш. Проверете го и опитайте пак.',
    inactive: 'Този код вече не важи.',
    already: 'Този акаунт вече е получавал безплатен месец за този план.',
    not_new:
      'Безплатният месец е за хора, които още не са имали този план — този акаунт вече го е имал.',
  },
}

export function refusalForLocale(
  outcome: Exclude<RedeemOutcome, 'ok'>,
  locale: Locale,
): string {
  return locale === 'en' ? REFUSALS[outcome] : TRANSLATED[locale][outcome]
}

// ---------------------------------------------------------------------------
// The grant
// ---------------------------------------------------------------------------

/** How many seats a live grant is worth. */
export const GRANT_SEATS = 1

/**
 * Is this grant still running?
 *
 * Takes the timestamp rather than a row so both sides can ask: the entitlement
 * read has a database row, the billing panel has a serialised string, and an
 * expiry that two callers disagree about is the kind of bug that only shows up
 * on the last day of the month.
 *
 * ---------------------------------------------------------------------------
 * `null` is forever and `undefined` is nothing
 * ---------------------------------------------------------------------------
 * The distinction is the database's rather than this file's invention:
 * `granted_until` is nullable now, and NULL there means a grant with no end -
 * see the migration that made it so. A row therefore hands over a real `null`
 * and means *always*, while `undefined` is what a caller passes when there is
 * no row at all.
 *
 * Written as two checks rather than one falsy test because the falsy test is
 * exactly the bug: it read the permanent grants as lapsed, which is the failure
 * that would have been found by whoever was comped rather than by us.
 */
export function grantIsLive(until: string | null | undefined, now: Date = new Date()): boolean {
  if (until === null) return true
  if (until === undefined) return false
  const end = new Date(until).getTime()
  return Number.isFinite(end) && end > now.getTime()
}

/**
 * How long a grant has left, in words.
 *
 * One function because the answer has three shapes and every screen showing a
 * grant needs all three: a grant with no end, one with days left, and one that
 * has already lapsed. Written here rather than in each panel so "Forever" is
 * the same word in the backoffice list, the spaces page and the billing panel -
 * three spellings of *always* would read as three different states.
 */
export function describeGrantEnd(
  until: string | null,
  now: Date = new Date(),
  locale: Locale = DEFAULT_LOCALE,
): string {
  const words = GRANT_END[locale]
  if (until === null) return words.forever
  if (!grantIsLive(until, now)) {
    return words.ended.replace('{date}', new Date(until).toLocaleDateString(locale))
  }
  return words.left.replace('{n}', String(daysLeft(until, now)))
}

/**
 * The three readings, per language.
 *
 * Here rather than in a dictionary under `src/app`, because the domain may not
 * import the app and this function is the one place all three are decided. The
 * date is formatted in the reader's locale too - a German sentence carrying an
 * American date is a sentence somebody misreads by ten months.
 */
const GRANT_END: Record<Locale, { forever: string; ended: string; left: string }> = {
  en: { forever: 'Forever', ended: 'Ended {date}', left: '{n} days left' },
  de: { forever: 'Unbefristet', ended: 'Beendet am {date}', left: 'noch {n} Tage' },
  // `left` has no singular form, in any of the three: on the last day this
  // reads "Остават 1 дни", the same way the German reads "noch 1 Tage". The
  // slot is a number in a sentence rather than a plural rule, and giving it one
  // is a change to all three languages at once - not something to smuggle in
  // with a fourth.
  bg: { forever: 'Безсрочно', ended: 'Приключи на {date}', left: 'Остават {n} дни' },
}

/** Whole days left, rounded up - "1 day left" on the last day, never "0". */
export function daysLeft(until: string, now: Date = new Date()): number {
  const ms = new Date(until).getTime() - now.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.ceil(ms / 86_400_000)
}

/** The columns the backoffice list needs to say whether a code is live. */
export interface PromoCodeRecord {
  maxUses: number | null
  uses: number
  startsAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

/**
 * Can this code still be redeemed?
 *
 * A second implementation of the conditions in `redeem_promo_code()`, and that
 * duplication is deliberate rather than an oversight: this one renders a badge,
 * that one decides. Getting this wrong shows an admin a stale label; getting
 * that one wrong gives away months. They are checked against each other by the
 * tests below, which is the cheap half of keeping them honest.
 */
export function codeIsLive(
  record: PromoCodeRecord,
  now: Date = new Date(),
): boolean {
  if (record.revokedAt) return false
  if (record.startsAt && new Date(record.startsAt).getTime() > now.getTime()) return false
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) return false
  if (record.maxUses !== null && record.uses >= record.maxUses) return false
  return true
}
