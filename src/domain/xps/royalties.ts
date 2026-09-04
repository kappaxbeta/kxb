import 'server-only'
import { pay } from '@/domain/bank/purse'
import type { Client } from '@/es/store'

/**
 * Paying for a remix, and splitting it.
 *
 * `docs/product/economy.md` §9. An owner puts a price on taking a copy of their
 * level; somebody who takes one pays it, and it is divided between whoever the
 * owner named.
 *
 * ---------------------------------------------------------------------------
 * The shares are floored, and the owner takes the remainder
 * ---------------------------------------------------------------------------
 * That ordering is the whole of how this avoids minting. Percentages of a whole
 * number of coins almost never divide evenly, and the two obvious ways to round
 * are both wrong: rounding each share up pays out more than came in, and
 * rounding to nearest can do the same on the wrong combination.
 *
 * So every named share is floored and the owner is paid *what is left* rather
 * than a computed percentage. The total paid is exactly the price, always, by
 * construction rather than by a check - and the rounding loss lands on the
 * person who set the price, which is the right place for it.
 */

export interface RemixPrice {
  /** Coins to take a copy. `0` is free and nothing happens. */
  price: number
  /** The level's owner. Paid the remainder after every named share. */
  owner: string
  /** Account id to whole percentage. Empty means it is all the owner's. */
  split: Record<string, number>
  /** For the statement, so a purse can be explained afterwards. */
  name: string
}

/**
 * Charge for a remix and pay everybody.
 *
 * Called **before** the copy is made. A copy handed over and a charge that did
 * not land is a level somebody got for free out of a network error, and it is
 * unrecoverable - there is nothing left to charge them for. Failing this way
 * costs somebody the price of a level, which is a line in the log with their
 * name on it.
 *
 * Returns the refusal so the caller can stop. Nothing is copied if this fails.
 */
export async function payForRemix(
  supabase: Client,
  tenantId: string,
  buyer: string,
  price: RemixPrice,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (price.price <= 0) return { ok: true }

  // Your own level, or one you already hold a share of paying yourself. `pay`
  // drops a movement whose two ends are the same person, but the owner case is
  // worth stopping here so the shares are not walked at all.
  if (price.owner === buyer) return { ok: true }

  let owed = price.price

  for (const [account, percent] of Object.entries(price.split)) {
    // Floored, so the shares can never sum past the price. See the note above.
    const share = Math.floor((price.price * percent) / 100)
    if (share <= 0) continue

    // Never more than is left, even if a stored split is somehow malformed -
    // the decider refuses shares over 100, and this is the second line of
    // defence on the one path that could otherwise create coins.
    const amount = Math.min(share, owed)
    if (amount <= 0) break

    const paid = await pay(supabase, tenantId, {
      from: buyer,
      to: account,
      amount,
      reason: 'remix',
      what: price.name,
    })
    // A share that could not be paid stops everything. Half a remix payment is
    // worse than none: the buyer is out of pocket and the level is not theirs.
    if (!paid.ok) return paid

    owed -= amount
  }

  if (owed <= 0) return { ok: true }

  return pay(supabase, tenantId, {
    from: buyer,
    to: price.owner,
    amount: owed,
    reason: 'remix',
    what: price.name,
  })
}

/**
 * What taking a copy of this project costs, or `null` for nothing to charge.
 *
 * `null` covers a builtin (one of ours - free, and there is nobody to pay), a
 * project with no price, and a project whose owner has left. The last is worth
 * naming: a payment with no payee would be a burn wearing a payment's name, and
 * §5 keeps that list short deliberately.
 */
export async function remixPriceOf(
  supabase: Client,
  xpId: string,
): Promise<RemixPrice | null> {
  const { data } = await supabase
    .from('xps_read_model')
    .select('owner_id, name, price_remix, price_split')
    .eq('id', xpId)
    .maybeSingle()

  if (!data?.owner_id) return null
  if (!data.price_remix || data.price_remix <= 0) return null

  const raw = data.price_split
  const split: Record<string, number> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [account, percent] of Object.entries(raw)) {
      // Parsed rather than trusted: this is a jsonb column, and a value that is
      // not a sane percentage is dropped instead of being coerced into one.
      if (typeof percent === 'number' && Number.isInteger(percent) && percent > 0) {
        split[account] = Math.min(percent, 100)
      }
    }
  }

  return { price: data.price_remix, owner: data.owner_id, split, name: data.name }
}
