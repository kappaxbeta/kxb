import 'server-only'
import type { EntitlementStatusName } from '@/lib/supabase/types'

/**
 * Choosing who the nightly entitlement sync actually asks Stripe about.
 *
 * ---------------------------------------------------------------------------
 * The problem this exists to solve
 * ---------------------------------------------------------------------------
 * The job used to walk every account and call Stripe for each one, serially. At
 * eight users that is a second. At ten thousand it is two Stripe requests apiece
 * at a couple of hundred milliseconds each, in one HTTP request, on a box with
 * two cores - well over half an hour of a Node process pinned to a loop, and
 * long past the `--max-time 300` on the cron line that started it. The job would
 * be killed part-way through, every night, having reconciled whichever prefix of
 * the user list it reached before the timer ran out.
 *
 * Note what that failure looks like from outside: nothing. The curl is silenced
 * to /dev/null, the run reports no error because it never returns, and the
 * accounts at the far end of the list are never reconciled at all. It is the
 * kind of thing found six months later by a customer who cancelled and kept
 * their access.
 *
 * ---------------------------------------------------------------------------
 * Priority, not pagination
 * ---------------------------------------------------------------------------
 * The naive fix is to page - do 500 a night and rotate. That bounds the run but
 * it also means a *paying* customer's row can be a fortnight stale, which is the
 * one thing this job exists to prevent.
 *
 * So the work is banded by what a wrong answer would cost:
 *
 *   0. **Never synced.** No row at all. We have literally never asked Stripe
 *      about this person, so we cannot know whether they are a hand-created
 *      customer from the dashboard - the exact case the module comment on
 *      `entitlement.ts` says Stripe-as-authority exists for.
 *
 *   1. **Money on the line.** `active`, `trialing`, `past_due`. These are the
 *      rows that change without anyone visiting the site: a renewal succeeds, a
 *      card fails, a trial ends. Being wrong here means either billing someone
 *      who left or locking out someone who paid.
 *
 *   2. **Everything else**, oldest first. `none`, `canceled`, `expired`. These
 *      only change when the person does something, and when they do, Checkout
 *      and the webhook have already written the row - so this band is pure
 *      belt-and-braces and can rotate slowly without anybody noticing.
 *
 * Bands 0 and 1 are small in any realistic account mix and are taken whole. The
 * cap eats into band 2, which is exactly the band that can afford to wait.
 */

/** The subset of `user_entitlements` this decision needs. */
export interface EntitlementRow {
  user_id: string
  status: EntitlementStatusName
  synced_at: string | null
}

/** The subset of an auth user this decision needs. */
export interface SyncableUser {
  id: string
  email?: string
}

export interface SyncCandidate {
  userId: string
  email: string
  /** Which band put them here. Reported so a run can be understood from its output. */
  band: 0 | 1 | 2
}

/**
 * Statuses where the cached answer going stale costs somebody money or access.
 *
 * `past_due` is in here rather than in band 2 on purpose. It is the least
 * stable state Stripe has - it resolves to `active` or `canceled` on its own,
 * usually within days, and neither transition produces a visit to our site.
 */
const AT_RISK: ReadonlySet<EntitlementStatusName> = new Set([
  'active',
  'trialing',
  'past_due',
])

export interface SelectOptions {
  /** Rows fresher than this are left alone. Only applies to band 2. */
  staleAfterMs: number
  /** Hard ceiling on the work list. */
  max: number
  now: number
}

/**
 * Decide who to reconcile this run, most-costly-to-be-wrong first.
 *
 * Pure, and separated from the route for that reason: the banding is the part
 * with the actual judgement in it, and it should be checkable without a Stripe
 * key, a database, or a cron secret.
 */
export function selectForSync(
  users: readonly SyncableUser[],
  rows: readonly EntitlementRow[],
  options: SelectOptions,
): SyncCandidate[] {
  const byUser = new Map(rows.map((row) => [row.user_id, row]))

  const bands: [SyncCandidate[], SyncCandidate[], SyncCandidate[]] = [[], [], []]
  // Parallel to `bands`, so band 2 can be ordered by staleness afterwards
  // without re-reading the map.
  const syncedAt = new Map<string, number>()

  for (const user of users) {
    // Entitlement is keyed on email, because that is what Stripe knows a
    // customer by. No email means no possible answer - anonymous guest accounts
    // are the bulk of these - so they are not candidates at all.
    if (!user.email) continue

    const row = byUser.get(user.id)
    const candidate = { userId: user.id, email: user.email }

    if (!row || !row.synced_at) {
      bands[0].push({ ...candidate, band: 0 })
      syncedAt.set(user.id, 0)
      continue
    }

    const age = Date.parse(row.synced_at)
    syncedAt.set(user.id, Number.isNaN(age) ? 0 : age)

    if (AT_RISK.has(row.status)) {
      bands[1].push({ ...candidate, band: 1 })
      continue
    }

    // Band 2 is the only one the freshness window applies to. A paying
    // customer is re-checked every run whatever the clock says; a `canceled`
    // one checked an hour ago is not worth a Stripe request tonight.
    if (options.now - (syncedAt.get(user.id) ?? 0) >= options.staleAfterMs) {
      bands[2].push({ ...candidate, band: 2 })
    }
  }

  // Oldest first within each band, so a capped run rotates through the tail
  // rather than re-checking the same names every night.
  const byStaleness = (a: SyncCandidate, b: SyncCandidate) =>
    (syncedAt.get(a.userId) ?? 0) - (syncedAt.get(b.userId) ?? 0)

  bands[0].sort(byStaleness)
  bands[1].sort(byStaleness)
  bands[2].sort(byStaleness)

  return [...bands[0], ...bands[1], ...bands[2]].slice(0, Math.max(0, options.max))
}
