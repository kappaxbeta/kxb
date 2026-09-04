'use server'

import { revalidatePath } from 'next/cache'
import { recordBackofficeAction } from '@/domain/backoffice/audit'
import { MAX_PRICE } from '@/domain/bank/prices'
import { creditRegardless } from '@/domain/bank/purse'
import { requireBackofficeSection } from '@/lib/backoffice'

/**
 * Hiding somebody from a space's best list, and putting them back.
 *
 * `docs/product/economy.md` §13. Two things make this defensible rather than
 * grubby, and both are enforced here rather than described:
 *
 * **Only a ranking is hidden.** Nothing in this file touches coins, a purse, or
 * a single event in the log. It writes one row whose entire meaning is "leave
 * this person out of that table", and there is no path from here to taking
 * anything away from anybody.
 *
 * **It is recorded.** `reason` is required and the audit entry is written
 * beside the row. A silent edit with a name on it is a decision somebody can be
 * asked about; one without is a capability nobody has to answer for, and this
 * is the one operator power in the product whose subject is not told.
 *
 * ---------------------------------------------------------------------------
 * Private spaces are not checked here
 * ---------------------------------------------------------------------------
 * Deliberately. The rule - a public space's ranking is never edited - is
 * enforced at the *read*, in `readBestList`, because whether a space is public
 * changes independently of this row. Checking it here would make the guarantee
 * depend on the state of the world at the moment somebody clicked, which is
 * exactly the thing that goes stale.
 *
 * So a row may exist for a space that later becomes public, and it stops
 * applying. That is the safe direction: the failure is a griefer reappearing on
 * a list, not a stranger being silently removed from a public one.
 */

export type HideResult = { ok: true } | { ok: false; error: string }

export async function hideFromBestList(formData: FormData): Promise<HideResult> {
  const { user, admin } = await requireBackofficeSection('money', 'write')

  const tenantId = String(formData.get('tenantId') ?? '')
  const userId = String(formData.get('userId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()

  if (!tenantId || !userId) return { ok: false, error: 'Pick a space and a person' }

  // Required, like the reason on a takedown. An operator who cannot say why in
  // one sentence should not be doing it - and the sentence is the only thing
  // that will explain this to whoever reads the audit log in six months.
  if (reason.length === 0) return { ok: false, error: 'Say why' }

  const { error } = await admin.from('leaderboard_hidden').upsert(
    { tenant_id: tenantId, user_id: userId, hidden_by: user.id, reason },
    { onConflict: 'tenant_id,user_id' },
  )
  if (error) return { ok: false, error: 'That could not be saved' }

  await recordBackofficeAction({
    actor: user,
    section: 'money',
    action: 'money.hide',
    summary: `Hid ${userId} from the best list in ${tenantId}`,
    detail: { tenantId, userId, reason },
  })

  revalidatePath('/ovaloffice/money')
  return { ok: true }
}

/**
 * Put them back.
 *
 * Audited exactly as heavily as the hiding was, which is worth stating because
 * the instinct is to treat an undo as housekeeping. It is not: the reason
 * somebody was hidden and the reason they stopped being hidden are the same
 * kind of fact, and a trail with only half of them in it reads as though nobody
 * ever changed their mind.
 */
export async function showOnBestList(formData: FormData): Promise<HideResult> {
  const { user, admin } = await requireBackofficeSection('money', 'write')

  const tenantId = String(formData.get('tenantId') ?? '')
  const userId = String(formData.get('userId') ?? '')
  if (!tenantId || !userId) return { ok: false, error: 'Pick a space and a person' }

  const { error } = await admin
    .from('leaderboard_hidden')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)

  if (error) return { ok: false, error: 'That could not be undone' }

  await recordBackofficeAction({
    actor: user,
    section: 'money',
    action: 'money.show',
    summary: `Put ${userId} back on the best list in ${tenantId}`,
    detail: { tenantId, userId },
  })

  revalidatePath('/ovaloffice/money')
  return { ok: true }
}

/**
 * Put coins in somebody's purse, as a correction.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * Because the alternative was worse. The credit half of every member-to-member
 * transfer once landed on the sender's own row and was dropped by the replay
 * guard - sender debited, nobody credited - and when that was found, the
 * backoffice could see exactly who had lost what and could do nothing about it.
 * A money view that can only watch is half a tool.
 *
 * ---------------------------------------------------------------------------
 * It mints, and everything about it is arranged around admitting that
 * ---------------------------------------------------------------------------
 * These coins come from nowhere. That is the honest description and it is why:
 *
 *   - the reason is **required**, and goes in the audit row beside the amount;
 *   - the movement is recorded under `operator`, which is on `MINTS`, so it
 *     shows in the money view as created rather than moved;
 *   - it is bounded by `MAX_PRICE`, which does not stop an operator inflating a
 *     space on purpose and does stop a slipped keyboard doing it by accident.
 *
 * What none of that does is stop a *deliberate* abuse, and it is not pretending
 * to. This is a `write` grant on one backoffice section, held by people who
 * could already publish and take down anybody's work. The control is the trail,
 * not the ceiling - see `docs/operations/economy.md` §7.
 *
 * The space's `economy` flag is deliberately not consulted: a purse damaged
 * while the economy was on does not stop needing repair because somebody
 * switched it off afterwards. `creditRegardless` carries that argument.
 */
export async function grantCoins(formData: FormData): Promise<HideResult> {
  const { user, admin } = await requireBackofficeSection('money', 'write')

  const tenantId = String(formData.get('tenantId') ?? '')
  const userId = String(formData.get('userId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  const amount = Number(formData.get('amount'))

  if (!tenantId || !userId) return { ok: false, error: 'Pick a space and a person' }

  // Required, like the reason on a hiding. An operator who cannot say why in
  // one sentence should not be minting coins.
  if (reason.length === 0) return { ok: false, error: 'Say why' }

  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_PRICE) {
    return { ok: false, error: `A whole number of coins, up to ${MAX_PRICE}` }
  }

  const paid = await creditRegardless(admin, tenantId, userId, {
    amount,
    reason: 'operator',
    // Shown on the member's own statement. Deliberately plain: they did not ask
    // for this and should not have to work out what it was.
    what: 'put right by us',
  })
  if (!paid.ok) return { ok: false, error: paid.error }

  await recordBackofficeAction({
    actor: user,
    section: 'money',
    action: 'money.grant',
    summary: `Granted ${amount} coins to ${userId} in ${tenantId}`,
    detail: { tenantId, userId, amount, reason },
  })

  revalidatePath('/ovaloffice/money')
  return { ok: true }
}
