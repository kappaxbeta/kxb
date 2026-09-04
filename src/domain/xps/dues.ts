import 'server-only'
import { ACCEPTED_REWARD_MIN, MAX_PRICE, SUBMISSION_FEE } from '@/domain/bank/prices'
import { charge, credit } from '@/domain/bank/purse'
import type { Client } from '@/es/store'

/**
 * What it costs to put a level in front of a reviewer, and what being accepted
 * pays.
 *
 * `docs/product/economy.md` §10. Its own file rather than lines inside
 * `actions.ts` and `backoffice-actions.ts`, because the two halves live in
 * different files with different callers - a member submits, an operator
 * accepts - and the only thing that makes them one feature is the pair of
 * numbers. Splitting them across those two files would leave nowhere to write
 * down why a rejection does not refund.
 *
 * ---------------------------------------------------------------------------
 * The fee is the mechanism, and the refusal to refund is the mechanism
 * ---------------------------------------------------------------------------
 * 300 is a real cost against a queue a human reads. **A rejected submission
 * does not refund**, and that is not harshness - it is the whole control. A
 * refund on rejection makes submitting free, and a free submission queue is an
 * unbounded one. The acceptance reward is what keeps it fair: roughly one in
 * three accepted pays for the ones that were not.
 */

/**
 * Charge for a submission.
 *
 * Called only when an `XpSubmitted` was actually appended, which is what makes
 * it exactly-once without a claim table: the decider refuses a second
 * submission on an already-submitted project, so a repeat produces no event and
 * nothing to charge for.
 *
 * Withdrawing and submitting again *does* charge again, and should. Each trip
 * through the queue is a trip a person has to read.
 *
 * Reports a refusal rather than throwing. The caller has already appended the
 * submission by the time this runs - see the note on ordering below - so a
 * purse that could not pay is something to tell the submitter about, not a
 * reason to unpick a decision the log has recorded.
 */
export async function chargeSubmission(
  supabase: Client,
  tenantId: string,
  submitter: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return charge(supabase, tenantId, submitter, {
    amount: SUBMISSION_FEE,
    reason: 'submission',
    what: name,
  })
}

/**
 * Pay for an acceptance.
 *
 * ---------------------------------------------------------------------------
 * A floor, not a price
 * ---------------------------------------------------------------------------
 * "This is good" and "this is extraordinary" should not pay the same, and only
 * a person can tell the difference - so the reviewer names the amount and
 * `ACCEPTED_REWARD_MIN` is the least it can be. An amount below the floor is
 * raised to it rather than refused: a reviewer who typed 500 meant to accept
 * the thing, and failing their click over a number is a worse outcome than
 * paying the minimum.
 *
 * The ceiling is `MAX_PRICE`, and it is doing real work here rather than
 * guarding a typo. This is the one path in the economy where a *person* names
 * an amount that is then minted, so it is the one place an operator could
 * create arbitrarily many coins. Bounding it does not solve that - open
 * question 4 says it should probably be bounded by the reviewer's role instead
 * - but it does mean a slip of the keyboard cannot.
 *
 * ---------------------------------------------------------------------------
 * Paid to the owner, in the space the project lives in
 * ---------------------------------------------------------------------------
 * Not to whoever submitted it, which can differ: a project can be transferred
 * between the submission and the review, and the reward belongs to whoever owns
 * the thing that got published.
 *
 * It lands in that space's purse and is therefore subject to that space's
 * `economy` flag, like every other movement. A space not running the economy
 * gets an acceptance and no coins, which is correct - it has nothing to spend
 * them on.
 */
export async function payAcceptance(
  supabase: Client,
  tenantId: string,
  owner: string,
  name: string,
  reward?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const named =
    typeof reward === 'number' && Number.isInteger(reward) ? reward : ACCEPTED_REWARD_MIN

  const amount = Math.min(Math.max(named, ACCEPTED_REWARD_MIN), MAX_PRICE)

  return credit(supabase, tenantId, owner, {
    amount,
    reason: 'accepted',
    what: name,
  })
}
