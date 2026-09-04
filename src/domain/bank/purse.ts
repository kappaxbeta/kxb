import 'server-only'
import { randomUUID } from 'node:crypto'
import type { EarnReason, SpendReason } from '@/domain/bank/reasons'
import { homesteadDecider } from '@/domain/homestead/aggregate'
import type { HomesteadCommand } from '@/domain/homestead/commands'
import { homesteadProjection } from '@/domain/homestead/projection'
import { homesteadStreamId } from '@/domain/homestead/streams'
import { resolveFeatures } from '@/domain/flags/queries'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'

/**
 * Every coin that moves for a reason outside the homestead moves through here.
 *
 * `docs/product/economy.md` §4 calls this a front door rather than a new home,
 * and that is exactly what it is: the purse stays in the homestead stream,
 * because "you cannot spend what you do not have" is a single-stream invariant
 * that optimistic concurrency actually protects there. What this file owns is
 * the *reasons*, the *gate*, and the one rule about which half goes first.
 *
 * ---------------------------------------------------------------------------
 * Three callers, one door
 * ---------------------------------------------------------------------------
 * Battle, quotas and the catalogue all need to charge somebody and pay somebody
 * else. Each of them doing it directly would mean three copies of: resolve the
 * flag, derive the stream, catch the two error kinds, run the projection, and
 * remember that the debit goes before the credit. Three copies of that is one
 * of them being subtly wrong forever, and the one that is wrong prints money.
 *
 * ---------------------------------------------------------------------------
 * The owner is not optional, and it is not the session
 * ---------------------------------------------------------------------------
 * Every function here takes the account whose purse is being moved, and passes
 * it into the event. That is not ceremony: `events.actor_id` is `auth.uid()`,
 * forced by RLS inside `append_events`, so an append onto somebody else's
 * stream is stamped with *whoever was signed in*. A projection reading the
 * actor moved the wrong purse and the replay guard then dropped the write
 * entirely - see `ownerOf` in the homestead projection for the whole story.
 *
 * Almost everything here is a cross-stream append. A battle payout is written
 * by whichever client reported the result; a stake is paid to a level's owner
 * who may not even be in the space. So `owner` is threaded through every call.
 */

export type PurseResult = { ok: true } | { ok: false; error: string }

/**
 * Is this space playing by the economy's rules?
 *
 * Read on every charge rather than cached, and that is a deliberate cost. The
 * flag is what stands between "a space that has never heard of coins" and
 * "a space that started taking them from its members because a deploy went
 * out", so it has to be current - a stale `true` charges somebody after an
 * operator switched it off, which is the failure that generates a refund
 * request nobody can honour.
 *
 * `resolveFeatures` already fails soft to the fallbacks, and `economy` falls
 * back **off**. So a broken lookup makes a round free rather than charging for
 * one, which is the direction argued at the flag itself.
 */
export async function economyOn(supabase: Client, tenantId: string): Promise<boolean> {
  const features = await resolveFeatures(supabase, tenantId)
  return features.economy === true
}

/**
 * Run one command against one member's purse.
 *
 * Private, because every public function below is this plus a decision about
 * which command and what to do when it fails - and a caller reaching for the
 * general version would be a caller choosing its own reason.
 */
async function onPurse(
  supabase: Client,
  tenantId: string,
  owner: string,
  command: HomesteadCommand,
): Promise<PurseResult> {
  try {
    await executeCommand({
      supabase,
      decider: homesteadDecider,
      tenantId,
      streamId: homesteadStreamId(tenantId, owner),
      command,
      metadata: { actorId: owner },
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      // `executeCommand` already retried and kept losing. Two things moving the
      // same purse at once is normal in a battle, and asking again is honest.
      return { ok: false, error: 'That purse was busy. Try again.' }
    }
    throw error
  }

  return { ok: true }
}

/**
 * Take coins, or refuse.
 *
 * All-or-nothing, which is right for everything somebody *chose*: an extra
 * blueprint you cannot afford should not half-happen. The one exception is a
 * battle loss, which is `fine` below.
 *
 * Returns the refusal rather than throwing, because every caller has somebody
 * on the other end who needs to be told why.
 */
export async function charge(
  supabase: Client,
  tenantId: string,
  owner: string,
  spend: { amount: number; reason: SpendReason; what: string },
): Promise<PurseResult> {
  if (!(await economyOn(supabase, tenantId))) return { ok: true }

  const result = await onPurse(supabase, tenantId, owner, {
    type: 'SpendCoins',
    cost: spend.amount,
    what: spend.what,
    reason: spend.reason,
  })
  if (!result.ok) return result

  await runProjection(supabase, homesteadProjection, tenantId)
  return { ok: true }
}

/**
 * Take what there is, and forgive the rest.
 *
 * §7.5. Only a battle loss uses this. Refusing an unaffordable loss would make
 * losing free for exactly the people who lose most, and carrying the difference
 * as a debt would turn one bad round into a punishment that outlasts it. So the
 * shortfall is recorded on the event and dropped.
 */
export async function fine(
  supabase: Client,
  tenantId: string,
  owner: string,
  spend: { amount: number; reason: SpendReason; what: string },
): Promise<PurseResult> {
  if (!(await economyOn(supabase, tenantId))) return { ok: true }

  const result = await onPurse(supabase, tenantId, owner, {
    type: 'ChargeCoins',
    amount: spend.amount,
    what: spend.what,
    reason: spend.reason,
  })
  if (!result.ok) return result

  await runProjection(supabase, homesteadProjection, tenantId)
  return { ok: true }
}

/**
 * Put coins in somebody's purse.
 *
 * `from` absent means these coins were created - a win, a knockout, a voucher.
 * Present means somebody paid, and their own `CoinsSpent` is the other half.
 * That distinction is the only thing that makes "is anybody printing coins"
 * answerable, so it is a parameter rather than something a caller may forget:
 * `pay` below is the paired version and calls this with both ends.
 */
export async function credit(
  supabase: Client,
  tenantId: string,
  owner: string,
  earning: { amount: number; reason: EarnReason; what?: string; from?: string },
): Promise<PurseResult> {
  if (!(await economyOn(supabase, tenantId))) return { ok: true }

  const result = await onPurse(supabase, tenantId, owner, {
    type: 'EarnCoins',
    amount: earning.amount,
    reason: earning.reason,
    owner,
    ...(earning.what === undefined ? {} : { what: earning.what }),
    ...(earning.from === undefined ? {} : { from: earning.from }),
  })
  if (!result.ok) return result

  await runProjection(supabase, homesteadProjection, tenantId)
  return { ok: true }
}

/**
 * One purse to another: a battle stake, a remix.
 *
 * ---------------------------------------------------------------------------
 * The debit goes first, and it is not a preference
 * ---------------------------------------------------------------------------
 * Two streams cannot be written atomically, so one half can land without the
 * other, and the only choice is which way to fail. `CoinsSent` already made the
 * argument and it holds for every payment in the economy: **credit-first fails
 * by minting.** A credit that lands and a debit that does not is money created
 * out of a network error, and money that can be created by retrying is not
 * money. Losing a payment is a support conversation; printing one is a broken
 * economy.
 *
 * So a failure after the debit is reported honestly, with the transfer id, so
 * the two ends can be found in the log. It is not retried here: a retry that
 * cannot tell "the credit failed" from "the credit succeeded and the reply was
 * lost" is a retry that doubles payouts.
 */
export async function pay(
  supabase: Client,
  tenantId: string,
  movement: {
    from: string
    to: string
    amount: number
    reason: Extract<SpendReason & EarnReason, string>
    what: string
  },
): Promise<PurseResult> {
  if (!(await economyOn(supabase, tenantId))) return { ok: true }

  // Paying yourself nets to zero and writes two events. Not an error worth
  // showing anybody - a level's owner playing their own level is ordinary - so
  // it is simply not charged. §7 says the owner is not charged their own stake.
  if (movement.from === movement.to) return { ok: true }

  const transfer = randomUUID()

  const debit = await charge(supabase, tenantId, movement.from, {
    amount: movement.amount,
    reason: movement.reason,
    what: movement.what,
  })
  if (!debit.ok) return debit

  const paid = await credit(supabase, tenantId, movement.to, {
    amount: movement.amount,
    reason: movement.reason,
    what: movement.what,
    from: movement.from,
  })
  if (!paid.ok) {
    return {
      ok: false,
      error: `The coins left but did not arrive (${transfer})`,
    }
  }

  return { ok: true }
}

/**
 * Put coins somewhere, whatever the space's flag says.
 *
 * ---------------------------------------------------------------------------
 * The one function here that ignores the gate, and why it must
 * ---------------------------------------------------------------------------
 * Every other movement in this file is a no-op when `economy` is off, which is
 * the whole point of that switch: a space that has not opted in does not get
 * charged and does not get paid.
 *
 * A *correction* is not a movement the space caused. It is somebody putting
 * back what a bug took, and the flag has nothing to say about that - a purse
 * damaged while the economy was on does not stop needing repair because an
 * operator switched it off afterwards, and coins in a purse are spendable in
 * the café whether or not the rest of the economy is running.
 *
 * Silently doing nothing would be the worst of the three options: an operator
 * would see "done", the member would see no coins, and nothing anywhere would
 * say why.
 *
 * **Not exported for general use.** The only caller is the backoffice grant,
 * which is gated on a write grant and writes an audit row. Anything else that
 * wants to move coins wants `credit`, and wants the gate with it.
 */
export async function creditRegardless(
  supabase: Client,
  tenantId: string,
  owner: string,
  earning: { amount: number; reason: EarnReason; what: string },
): Promise<PurseResult> {
  const result = await onPurse(supabase, tenantId, owner, {
    type: 'EarnCoins',
    amount: earning.amount,
    reason: earning.reason,
    owner,
    what: earning.what,
  })
  if (!result.ok) return result

  await runProjection(supabase, homesteadProjection, tenantId)
  return { ok: true }
}
