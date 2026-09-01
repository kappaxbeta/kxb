'use server'

import { z } from 'zod'

import { homesteadDecider } from '@/domain/homestead/aggregate'
import { homesteadProjection } from '@/domain/homestead/projection'
import { homesteadStreamId } from '@/domain/homestead/streams'
import { priceOfSlot, priceOfThing } from '@/domain/thingiverse/blueprint'
import { MAX_SOCKET_NAME } from '@/domain/thingiverse/blueprint'
import { findBlueprint } from '@/domain/thingiverse/queries'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * Paying for something in a room, out of the café's till.
 *
 * ---------------------------------------------------------------------------
 * Why this is not in `homestead/actions.ts`
 * ---------------------------------------------------------------------------
 * Because of what a `'use server'` file *is*: every export is an endpoint the
 * browser can call with whatever arguments it likes. A `spendCoins(slug, cost)`
 * sitting beside `buyGround` would be exactly the door `BuyGround`'s comment
 * spends a paragraph closing - somebody names their own price, and the guard
 * that this aggregate prices from its own state is gone for good.
 *
 * So the *cost is never a parameter*. These take an id and a socket name, read
 * the stored blueprint, and compute the price server-side. What crosses the
 * wire is "I took from this socket of that thing", which is a fact about the
 * world rather than a number about money.
 *
 * ---------------------------------------------------------------------------
 * What this does and does not enforce
 * ---------------------------------------------------------------------------
 * It keeps the **purse** honest: coins cannot be conjured, a cost is bounded and
 * has to be affordable, and every deduction is a row somebody can read back.
 *
 * It does *not* gate the item. Taking something off a table is a broadcast
 * claim settled between the clients in the room (see `@/domain/thingiverse/live`),
 * and no server call stands between reaching and having - which means a
 * modified client could pocket a patty without paying for one.
 *
 * That is the same position `_sim/combat.ts` takes about health, in as many
 * words: this is a private team room, not a competitive ladder. The cost of
 * closing it is a server round trip on every pickup, which would turn a kitchen
 * into a queue. What is worth protecting is the balance - because that number
 * is shared, persistent and shows up in somebody else's café - and the balance
 * is protected.
 */

export type ShopResult = { ok: true; spent: number } | { ok: false; error: string }

const summonSchema = z.object({ blueprintId: z.uuid() })

const takeSchema = z.object({
  blueprintId: z.uuid(),
  socket: z.string().min(1).max(MAX_SOCKET_NAME),
})

/** What summoning one of these costs, charged. Free ones record nothing. */
export async function payToSummon(slug: string, input: unknown): Promise<ShopResult> {
  const parsed = summonSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a blueprint' }
  return charge(slug, parsed.data.blueprintId, (spec) => ({
    on: 'thing',
    cost: priceOfThing(spec),
  }))
}

/** What taking from this socket costs, charged. */
export async function payToTake(slug: string, input: unknown): Promise<ShopResult> {
  const parsed = takeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a place to take from' }
  const { blueprintId, socket } = parsed.data
  return charge(slug, blueprintId, (spec) => ({
    on: 'item',
    cost: priceOfSlot(spec, socket),
  }))
}

/**
 * Read the blueprint, work out what it costs, and take it off the till.
 *
 * The blueprint is loaded with the *caller's* own visibility rules, which is
 * the same read the shelf does - so a price on somebody's private blueprint is
 * unreachable rather than merely unpriced, and there is no way to probe what a
 * blueprint you cannot see is worth.
 */
async function charge(
  slug: string,
  blueprintId: string,
  price: (spec: Parameters<typeof priceOfThing>[0] & Parameters<typeof priceOfSlot>[0]) => {
    on: 'thing' | 'item'
    cost: number
  },
): Promise<ShopResult> {
  const context = await requireTenant(slug)

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  const blueprint = await findBlueprint(supabase, tenant.id, user.id, blueprintId)
  if (!blueprint) return { ok: false, error: 'That is not on the shelf' }

  const { on, cost } = price(blueprint.spec)
  // Free is the overwhelmingly common case and costs nothing to answer: no
  // command, no round trip through the decider, no row in the log.
  if (cost === 0) return { ok: true, spent: 0 }

  const what = on === 'thing' ? blueprint.name : `${blueprint.name} (${on})`

  try {
    await executeCommand({
      supabase,
      decider: homesteadDecider,
      tenantId: tenant.id,
      // The caller's own purse, derived from the session - see
      // `homesteadStreamId`. There is no argument anybody can pass to spend
      // somebody else's coins.
      streamId: homesteadStreamId(tenant.id, user.id),
      command: { type: 'SpendCoins', on, what, cost },
      metadata: { actorId: user.id },
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      return { ok: false, error: 'Your till was busy. Try again.' }
    }
    throw error
  }

  await runProjection(supabase, homesteadProjection, tenant.id)
  return { ok: true, spent: cost }
}
