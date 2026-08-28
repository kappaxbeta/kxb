import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Whether an account's email address has been proven to belong to it.
 *
 * ---------------------------------------------------------------------------
 * Why this is ours and not `email_confirmed_at`
 * ---------------------------------------------------------------------------
 * GoTrue has a perfectly good field for this, and on this deployment it means
 * nothing. Sign-up runs with `ENABLE_EMAIL_AUTOCONFIRM=true` in production and
 * `enable_confirmations = false` locally, which is deliberate - guests arrive
 * through a link and anonymous accounts have no inbox to wait on, and a wall
 * between "I typed a password" and "I am in the room" is the one thing this
 * product cannot afford at the front door. Under autoconfirm GoTrue stamps
 * `email_confirmed_at` at the moment of sign-up, for everybody, having verified
 * nothing at all. Reading it would show the banner to nobody, ever.
 *
 * So the app keeps its own answer, and the question it answers is narrower and
 * more honest: *has somebody opened a link we sent to this exact address*. That
 * is what `/auth/confirm` records - see `recordEmailVerified` - and it is true
 * of every path that lands there: a magic link, an invite, an email change.
 *
 * ---------------------------------------------------------------------------
 * Why it lives in app_metadata
 * ---------------------------------------------------------------------------
 * Three candidates, and only one survives.
 *
 *   * A table of our own. Correct, and a migration plus a round trip on every
 *     page of every space to draw one banner.
 *   * `user_metadata`. Free to read, and writable by the account holder with a
 *     single `updateUser({ data })` call - so "verified" would mean "claims to
 *     be verified", which is not worth storing.
 *   * `app_metadata`. Free to read - it arrives on the `user` the layout has
 *     already fetched - and writable only by the service role. GoTrue silently
 *     drops it from a user-authenticated update, which was checked against the
 *     running server rather than assumed.
 *
 * The address is stored beside the timestamp on purpose. Verification is a fact
 * about a *pair*, not about an account: somebody who verifies a@example.com and
 * then changes to b@example.com is unverified again, and comparing against the
 * stored address is what makes that fall out for free instead of needing the
 * change flow to remember to clear a flag.
 */

/** What `app_metadata` carries once a link has been opened. */
type VerificationMark = {
  email_verified_for?: unknown
  email_verified_at?: unknown
}

/**
 * Is there anything to ask this account to do?
 *
 * Deliberately answers `true` for everybody who has no address to prove, rather
 * than `false`: the only caller is a banner, and "no email" must read as
 * "nothing to nag about", not as "unverified".
 *
 * Guests are the reason that matters. Somebody let in through a guest link is
 * an anonymous account with no address at all - they were invited to one room
 * for one afternoon, and a banner asking them to confirm an email they never
 * gave is both impossible to satisfy and rude.
 */
export function emailVerified(user: User): boolean {
  if (user.is_anonymous) return true

  const email = user.email?.trim().toLowerCase()
  if (!email) return true

  /**
   * An address vouched for by Google or Apple.
   *
   * Those providers only ever hand over an address they own, so a round trip
   * through one is stronger proof than a link in an inbox - asking somebody who
   * signed in with Google to also open an email would be asking them to prove
   * something they have already proved.
   *
   * Read from `identities` rather than from a mark we write, so this is also
   * true of every account that signed in with a provider before any of this
   * existed. There is no backfill to run.
   */
  const federated = (user.identities ?? []).some(
    (identity) =>
      identity.provider !== 'email' &&
      String(identity.identity_data?.email ?? '').trim().toLowerCase() === email,
  )
  if (federated) return true

  const mark = (user.app_metadata ?? {}) as VerificationMark
  const verifiedFor = typeof mark.email_verified_for === 'string'
    ? mark.email_verified_for.trim().toLowerCase()
    : null

  return verifiedFor === email
}

/**
 * Record that somebody opened a link we sent to this address.
 *
 * Called from `/auth/confirm` after `verifyOtp` has succeeded, which is the one
 * moment in the app where mailbox control has just been demonstrated. Every
 * link type that lands there counts: a magic link, an accepted invite and a
 * confirmed email change are all "a token we mailed to this address came back".
 *
 * Never throws. This runs on the tail of a completed sign-in, and a metadata
 * write that fails must not turn somebody's working link into an error page -
 * the cost of losing it is one more banner, and the next link fixes it.
 */
export async function recordEmailVerified(userId: string, email: string | null | undefined) {
  const address = email?.trim()
  if (!address) return

  try {
    const admin = createAdminClient()

    /**
     * Merged, not replaced. `app_metadata` is also where GoTrue keeps
     * `provider` and `providers`, and handing it a bare object of our two keys
     * would take those with it - which is how an account quietly loses the
     * record of how it signs in.
     */
    const { data } = await admin.auth.admin.getUserById(userId)
    const existing = data.user?.app_metadata ?? {}

    await admin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...existing,
        email_verified_for: address,
        email_verified_at: new Date().toISOString(),
      },
    })
  } catch {
    // See above: never worth failing a completed sign-in over.
  }
}
