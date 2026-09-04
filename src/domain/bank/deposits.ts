import 'server-only'
import { randomUUID } from 'node:crypto'
import { bankDecider } from '@/domain/bank/aggregate'
import type { BankCommand } from '@/domain/bank/commands'
import { bankProjection } from '@/domain/bank/projection'
import { charge, credit, economyOn } from '@/domain/bank/purse'
import { bankStreamId } from '@/domain/bank/streams'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'

/**
 * Coins moving between a member's purse and the space's bank.
 *
 * `docs/product/economy.md` §11. Two movements, and both of them are a purse at
 * one end and a bank at the other - which is what makes this its own file
 * rather than two more functions in `purse.ts`. That module knows about purses;
 * this one is the bridge, and it is the only place both aggregates are written
 * in one breath.
 *
 * ---------------------------------------------------------------------------
 * Two streams, one movement, and which half goes first
 * ---------------------------------------------------------------------------
 * The purse is on the homestead stream and the bank is on its own, so a
 * transfer between them cannot be atomic. The rule is the one `CoinsSent`
 * states and every payment in this economy follows: **debit first.**
 *
 * Paying *into* the bank debits the purse first. Paying *out* debits the bank
 * first. Either way a crash in the middle loses a movement rather than creating
 * one, and the transfer id is on both halves so the two ends can be found.
 */

export type DepositResult = { ok: true } | { ok: false; error: string }

/** Run one command against a space's bank. */
async function onBank(
  supabase: Client,
  tenantId: string,
  command: BankCommand,
  actorId: string,
): Promise<DepositResult> {
  try {
    await executeCommand({
      supabase,
      decider: bankDecider,
      tenantId,
      streamId: bankStreamId(tenantId),
      command,
      metadata: { actorId },
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      /*
        The bank is one stream for a whole space, so it is the most contended
        aggregate in the economy - every door charge in every room lands here.
        `executeCommand` already retried; this is the case where it kept losing.
      */
      return { ok: false, error: 'The bank was busy. Try again.' }
    }
    throw error
  }

  await runProjection(supabase, bankProjection, tenantId)
  return { ok: true }
}

/**
 * A member pays the space.
 *
 * Used by a door charging a toll and by anything a space's needs make somebody
 * buy. The coins are *not* destroyed - they land in the bank, which is what
 * makes a space an economy rather than a set of sinks: whoever set the prices
 * holds the takings and can lend them back.
 */
export async function payIntoBank(
  supabase: Client,
  tenantId: string,
  payer: string,
  movement: { amount: number; reason: 'needs' | 'room-entry' | 'channel'; what: string },
): Promise<DepositResult> {
  if (!(await economyOn(supabase, tenantId))) return { ok: true }

  const transfer = randomUUID()

  const taken = await charge(supabase, tenantId, payer, {
    amount: movement.amount,
    reason: movement.reason,
    what: movement.what,
  })
  if (!taken.ok) return taken

  const banked = await onBank(
    supabase,
    tenantId,
    {
      type: 'BankCoins',
      from: payer,
      amount: movement.amount,
      reason: movement.reason,
      what: movement.what,
      transfer,
    },
    payer,
  )

  if (!banked.ok) {
    return { ok: false, error: `The coins left your purse but did not arrive (${transfer})` }
  }

  return { ok: true }
}

/**
 * The space pays a member.
 *
 * The other direction, and the one the bank existed for: whoever set the prices
 * holds the takings and can hand them back. Without this the bank is a sink
 * with a nicer name - coins go in through doors and needs and never come out,
 * which is exactly the arrangement `docs/product/economy.md` §3 says a bank
 * exists to avoid.
 *
 * ---------------------------------------------------------------------------
 * The bank is debited first
 * ---------------------------------------------------------------------------
 * The mirror of paying in, and the same rule: **debit before credit.** A purse
 * credited from a bank that was never debited is money created out of a network
 * error. This way a crash loses a movement, which is a line in the log with a
 * transfer id on it.
 *
 * The affordability check is the decider's - `WithdrawCoins` refuses more than
 * the balance, and that is a single-stream invariant optimistic concurrency
 * actually protects. Two owners paying out the same last coin cannot both win.
 *
 * ---------------------------------------------------------------------------
 * Who may do this is not decided here
 * ---------------------------------------------------------------------------
 * This module knows two aggregates and nothing about roles. Spending a space's
 * money is the owner's, and the action above this checks it - the same split
 * every other guard in this codebase keeps between a decider and the door.
 */
export async function payOutOfBank(
  supabase: Client,
  tenantId: string,
  recipient: string,
  movement: { amount: number; reason: 'bank-grant-in' | 'loan' },
  actorId: string,
): Promise<DepositResult> {
  if (!(await economyOn(supabase, tenantId))) return { ok: true }

  const transfer = randomUUID()

  const taken = await onBank(
    supabase,
    tenantId,
    {
      type: 'WithdrawCoins',
      to: recipient,
      amount: movement.amount,
      reason: movement.reason,
      transfer,
    },
    actorId,
  )
  if (!taken.ok) return taken

  const landed = await credit(supabase, tenantId, recipient, {
    amount: movement.amount,
    reason: movement.reason,
    what: movement.reason === 'loan' ? 'a loan from the space' : 'paid by the space',
    // Named, so the two ends of one movement can be matched in the log. The
    // bank is not a member, so this is the space's own id standing in for one.
    from: tenantId,
  })

  if (!landed.ok) {
    return { ok: false, error: `The coins left the bank but did not arrive (${transfer})` }
  }

  return { ok: true }
}
