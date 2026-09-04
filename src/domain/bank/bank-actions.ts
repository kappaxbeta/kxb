'use server'

import { revalidatePath } from 'next/cache'
import { payOutOfBank } from '@/domain/bank/deposits'
import { MAX_GRANT } from '@/domain/bank/commands'
import { economyOn } from '@/domain/bank/purse'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import { hasRole, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * What the space has taken, and paying some of it back out.
 *
 * `docs/product/economy.md` §3 and §11. Door tolls and needs fill this account;
 * this is the only way anything leaves it. Without it the bank is a sink with a
 * nicer name.
 */

export interface BankView {
  coins: number
  /** Gross in and gross out, ever. The trend, which the balance alone hides. */
  taken: number
  paidOut: number
  /** Whether the reader may spend it. */
  maySpend: boolean
  /** Everybody who could be paid. */
  people: { id: string; name: string }[]
}

export type BankResult =
  | { ok: true; bank: BankView }
  | { ok: false; error: string }

/**
 * The balance, the trend, and who could be paid.
 *
 * `taken` and `paid_out` come along because the balance alone hides the thing
 * worth knowing: a space whose takings climb while its payouts stay flat is one
 * whose owner has built a sink, and that is visible in a row rather than an
 * aggregation.
 */
export async function readBank(slug: string): Promise<BankResult> {
  const context = await requireTenant(slug)
  const { supabase, tenant, user } = context

  const [row, members, on] = await Promise.all([
    supabase
      .from('space_bank_read_model')
      .select('coins, taken, paid_out')
      .eq('tenant_id', tenant.id)
      .maybeSingle(),
    supabase
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenant.id)
      .neq('user_id', user.id),
    economyOn(supabase, tenant.id),
  ])

  const ids = (members.data ?? []).map((member) => member.user_id)
  const names = await readUsernames(supabase, ids)

  return {
    ok: true,
    bank: {
      // A space that has never taken a coin has no row, which is a balance of
      // zero rather than an absence - see the migration.
      coins: row.data?.coins ?? 0,
      taken: row.data?.taken ?? 0,
      paidOut: row.data?.paid_out ?? 0,
      // Spending the space's money is the owner's. Admins run the space day to
      // day; this is the till.
      maySpend: on && hasRole(context, ['owner']),
      people: ids.map((id) => ({ id, name: displayNameFrom(names, id) })),
    },
  }
}

/**
 * Pay somebody out of the bank.
 *
 * `loan` and `grant` move coins identically and are recorded apart, because
 * "how much has this space lent" is a question with an answer only if the two
 * were ever distinguished. Neither is repaid today - open question 8 - and that
 * is exactly why the reason is kept: when repayment is decided, the events that
 * need finding will be findable.
 */
export async function payFromBank(
  slug: string,
  input: { to: string; amount: number; kind: 'grant' | 'loan' },
): Promise<BankResult> {
  const context = await requireTenant(slug)

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  // The till is the owner's. Checked here because the decider cannot see a
  // role - it knows a balance, not who is asking.
  if (!hasRole(context, ['owner'])) {
    return { ok: false, error: 'Only the space owner can spend the bank' }
  }

  const { amount, to, kind } = input
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_GRANT) {
    return { ok: false, error: 'That is not an amount you can pay out' }
  }

  const { data: member } = await context.supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', context.tenant.id)
    .eq('user_id', to)
    .maybeSingle()

  if (!member) return { ok: false, error: 'They are not in this space' }

  const paid = await payOutOfBank(
    context.supabase,
    context.tenant.id,
    to,
    { amount, reason: kind === 'loan' ? 'loan' : 'bank-grant-in' },
    context.user.id,
  )
  if (!paid.ok) return { ok: false, error: paid.error }

  revalidatePath(`/t/${slug}/settings/space`)
  return readBank(slug)
}
