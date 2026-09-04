import 'server-only'
import { randomUUID } from 'node:crypto'
import { economyOn, charge, credit } from '@/domain/bank/purse'
import { MAX_PRICE } from '@/domain/bank/prices'
import type { Client } from '@/es/store'

/**
 * The account that outlives every space.
 *
 * `docs/product/economy.md` §3. A purse is what you have *in a space*; this is
 * what you still have after leaving it, and it is the balance the tenant page
 * shows you next to the rail's per-space one.
 *
 * ---------------------------------------------------------------------------
 * Not event-sourced, and it could not be
 * ---------------------------------------------------------------------------
 * Every stream in this app is tenant-scoped: `events` has a `tenant_id`, RLS is
 * written against it, and `runProjection` catches one tenant up at a time. A
 * wallet has no tenant *by definition*. So it is a row and a ledger behind a
 * `security definer` function, which is the call `xp_store` already made - see
 * `20270128000000_a_purse_you_keep_when_you_leave.sql` for the full argument
 * and for why this is stronger rather than weaker on the rule that matters
 * most: a guarded update inside one transaction cannot double on a rebuild,
 * because there is no rebuild.
 *
 * ---------------------------------------------------------------------------
 * The door, and why it can be shut
 * ---------------------------------------------------------------------------
 * Coins only cross between a purse and a wallet when that space's `economy`
 * flag is on. §3.1: a space with the economy off is one where nothing is
 * metered and the café still mints, so its coins are play money that does not
 * count. Letting them out would make a wallet worth exactly as much as the
 * laxest space anybody can create, which is nothing.
 *
 * What this does *not* solve is §3.2 - a lax but switched-on space still
 * withdraws at par - and that is left open on purpose rather than patched with
 * a number nobody has thought about.
 */

export type WalletResult =
  | { ok: true; balance: number }
  | { ok: false; error: string }

/** What somebody has, across everything. Zero for an account that has never moved any. */
export async function readWallet(supabase: Client, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('wallets')
    .select('coins')
    .eq('user_id', userId)
    .maybeSingle()

  // A failed read is not a balance. Zero is the safe direction here, unusually:
  // this number is only ever *shown*, and every path that spends it re-reads
  // through `wallet_move`, whose guard is the authority. A wrong zero on a page
  // is a moment of confusion; a wrong number that something spends against is
  // an overdraft.
  if (error || !data) return 0
  return data.coins
}

/**
 * Move coins between a space purse and the wallet, in whichever direction.
 *
 * Private, because the two directions differ in which half goes first and a
 * caller choosing that for itself is a caller who can print money.
 */
async function moveWallet(
  supabase: Client,
  userId: string,
  tenantId: string,
  amount: number,
  transfer: string,
): Promise<WalletResult> {
  const { data, error } = await supabase.rpc('wallet_move', {
    p_user: userId,
    p_tenant: tenantId,
    p_amount: amount,
    p_transfer: transfer,
  })

  if (error) return { ok: false, error: 'That could not be moved right now' }

  const row = data?.[0]
  if (!row) return { ok: false, error: 'That could not be moved right now' }

  switch (row.status) {
    case 'ok':
      return { ok: true, balance: row.balance }
    case 'duplicate':
      // Already written. Reported as success on purpose: the movement the
      // caller asked for has happened, and the balance is the real one. A
      // failure here would push a retrying caller into trying again forever.
      return { ok: true, balance: row.balance }
    case 'short':
      return { ok: false, error: 'There is not enough in that wallet' }
    default:
      // 'not_you', and anything a later version adds. Unreachable through the
      // actions below, which take the account from the session.
      return { ok: false, error: 'That is not your wallet' }
  }
}

/**
 * A plausible amount, before anything is moved.
 *
 * The guard `MAX_PRICE` exists for elsewhere in this economy - a stray zero on
 * a price somebody typed - and it does the same job here for an amount typed
 * into a withdrawal box.
 */
function implausible(amount: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return 'Coins come in whole positive numbers'
  if (amount > MAX_PRICE) return `Move at most ${MAX_PRICE} at a time`
  return null
}

/**
 * Take coins out of a space and into the wallet.
 *
 * Purse first, wallet second, for the reason every payment in this economy
 * follows: **credit-first fails by minting.** A wallet credited from a purse
 * that was never debited is money created out of a network error. Failing the
 * other way loses a movement, which is a support conversation with a transfer
 * id attached.
 *
 * `charge` is a no-op when the economy is off, which would silently make a
 * withdrawal free - so the gate is checked here too, explicitly, and refused
 * rather than skipped. This is the one place where "the economy is off" must
 * be a *refusal* and not a quiet pass: everywhere else, off means nobody is
 * charged, and here it would mean everybody is paid.
 */
export async function withdraw(
  supabase: Client,
  userId: string,
  tenantId: string,
  amount: number,
): Promise<WalletResult> {
  const bad = implausible(amount)
  if (bad) return { ok: false, error: bad }

  if (!(await economyOn(supabase, tenantId))) {
    return {
      ok: false,
      error: 'Coins earned here stay here - this space is not running the economy',
    }
  }

  const transfer = randomUUID()

  const taken = await charge(supabase, tenantId, userId, {
    amount,
    reason: 'transfer-out',
    what: 'moved to your wallet',
  })
  if (!taken.ok) return { ok: false, error: taken.error }

  const landed = await moveWallet(supabase, userId, tenantId, amount, transfer)
  if (!landed.ok) {
    return { ok: false, error: `The coins left your purse but did not arrive (${transfer})` }
  }

  return landed
}

/**
 * Put wallet coins into a space purse.
 *
 * The mirror, with the halves the other way round for the same reason: the
 * wallet is debited first, so a failure loses coins rather than creating them.
 *
 * Gated the same way, and the gate matters as much in this direction. Coins
 * deposited into a space where nothing is metered can never come back out
 * (§3.1), so allowing it would be a one-way door somebody walks through by
 * accident.
 */
export async function deposit(
  supabase: Client,
  userId: string,
  tenantId: string,
  amount: number,
): Promise<WalletResult> {
  const bad = implausible(amount)
  if (bad) return { ok: false, error: bad }

  if (!(await economyOn(supabase, tenantId))) {
    return {
      ok: false,
      error: 'This space is not running the economy, so coins put in could not come back out',
    }
  }

  const transfer = randomUUID()

  const taken = await moveWallet(supabase, userId, tenantId, -amount, transfer)
  if (!taken.ok) return taken

  const landed = await credit(supabase, tenantId, userId, {
    amount,
    reason: 'transfer-in',
    what: 'moved from your wallet',
  })
  if (!landed.ok) {
    return { ok: false, error: `The coins left your wallet but did not arrive (${transfer})` }
  }

  return taken
}
