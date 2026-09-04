'use server'

import { deposit, readWallet, withdraw } from '@/domain/bank/wallet'
import { economyOn } from '@/domain/bank/purse'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * The two balances a person has here, and moving coins between them.
 *
 * `docs/product/economy.md` §3. A **purse** is what you have in *this* space; a
 * **wallet** is what you have as a person, across every space you have ever
 * played in. The tenant page shows both because the difference is not obvious
 * and the first question anybody asks on seeing two numbers is which one they
 * are about to spend.
 *
 * ---------------------------------------------------------------------------
 * Read on mount, re-read after a move. Never on a timer
 * ---------------------------------------------------------------------------
 * `requireTenant` writes cookies, so a polled server action re-renders the page
 * around whatever is on it - the trap `polled-server-actions` is remembered
 * for, and the same call `PurseRail` already makes. The two moments these
 * numbers can be wrong are both handled without one: they are read when the
 * card mounts, and re-read after a move, which is the only change you cause
 * from here.
 */

export interface MoneyView {
  /** What you have in this space. */
  purse: number
  /** What you have as a person, everywhere. */
  wallet: number
  /**
   * Whether coins may cross between the two here.
   *
   * False when this space is not running the economy. §3.1: a space with it
   * switched off is one where nothing is metered and the cafe still mints, so
   * its coins are play money that does not count - and letting them out would
   * make a wallet worth as much as the laxest space anybody can create.
   *
   * Returned rather than left to the caller to infer, so the card can say why
   * the buttons are missing instead of just not drawing them.
   */
  canMove: boolean
}

export type MoneyResult =
  | { ok: true; money: MoneyView }
  | { ok: false; error: string }

/** Both balances, and whether the door between them is open. */
export async function readMoney(slug: string): Promise<MoneyResult> {
  const context = await requireTenant(slug)
  const { supabase, tenant, user } = context

  const [purse, wallet, open] = await Promise.all([
    supabase
      .from('homestead_read_model')
      .select('coins')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle(),
    readWallet(supabase, user.id),
    economyOn(supabase, tenant.id),
  ])

  return {
    ok: true,
    money: {
      // A member who has never opened a cafe has no row and no coins yet. Zero
      // rather than absent, so the card draws a number instead of a gap.
      purse: purse.data?.coins ?? 0,
      wallet,
      canMove: open,
    },
  }
}

/**
 * Move coins between this space's purse and your wallet.
 *
 * One action with a direction rather than two, because they are one gesture
 * with a sign - and because the guard, the parse and the re-read are identical
 * in both. Two actions would be two places for the amount check to be right.
 *
 * The ordering inside each direction is *not* symmetric and must not be made
 * so: taking coins out debits the purse first, putting them in debits the
 * wallet first. Either way a crash loses a movement rather than creating one.
 * That lives in `wallet.ts`, next to the transfer id it depends on.
 */
export async function moveMoney(
  slug: string,
  direction: 'out' | 'in',
  amount: number,
): Promise<MoneyResult> {
  const context = await requireTenant(slug)

  // A lapsed subscription or an archived space stops this like any other write.
  // Moving money is not a read, however much it looks like one on the page.
  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  const moved =
    direction === 'out'
      ? await withdraw(supabase, user.id, tenant.id, amount)
      : await deposit(supabase, user.id, tenant.id, amount)

  if (!moved.ok) return { ok: false, error: moved.error }

  // Re-read rather than adjusting locally. The server is the only thing that
  // knows whether anything else moved in the meantime, and a balance that
  // drifts from the log is worse than one that is a moment behind.
  return readMoney(slug)
}
