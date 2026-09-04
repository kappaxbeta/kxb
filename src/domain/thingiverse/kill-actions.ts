'use server'

import { THING_KILL } from '@/domain/bank/prices'
import { credit, economyOn } from '@/domain/bank/purse'
import { priceOfThing } from '@/domain/thingiverse/blueprint'
import { requireTenant } from '@/lib/tenant'

/**
 * Paying somebody for breaking a thing that had health.
 *
 * `docs/product/economy.md` §7. A target knocked over in battle mode pays a
 * coin, the way a knockout does.
 *
 * ---------------------------------------------------------------------------
 * The coin printer this is arranged to avoid
 * ---------------------------------------------------------------------------
 * A blueprint's price may be **zero**, so the naive version of this - pay for
 * every thing that breaks - is the loop *summon a free crate, smash it, take a
 * coin*: no cost, no second player, no match length. Strictly worse than
 * anything else in this economy, because the win/loss pair at least needs
 * somebody else in the room.
 *
 * So a thing only pays when it cost **more than the reward** to summon. The
 * loop is then negative by construction and nothing has to detect a farm.
 *
 * ---------------------------------------------------------------------------
 * Self-reported, and that is survivable for the same reason
 * ---------------------------------------------------------------------------
 * The caller says "I broke that". The server cannot check it - health lives on
 * the wire and never in the log, which `fight.ts` argues for at length - so
 * this has the same standing as `PlayerDefeated.by`: a claim, not a fact.
 *
 * What makes it safe is the arithmetic above plus the claim row. A thing pays
 * once ever, and only if somebody spent more than that summoning it. Lying
 * about a kill you did not make still costs whoever summoned it more than it
 * pays you, and lying twice about the same thing pays nothing at all.
 */

export type KillResult =
  /**
   * `balance` comes back so the caller never has to go and look.
   *
   * This is called from inside a live canvas, and the surfaces that draw a
   * purse are *above* it in the tree. Handing the number back means the rail
   * can be told with `notePurseMoved(balance)` and nothing re-reads - a fetch
   * per kill would re-render the page around the scene, which is the trap the
   * café already fell into once. See `purse-signal.ts`.
   */
  | { ok: true; paid: number; balance: number }
  | { ok: false }

/** Nothing moved, and nothing is wrong. The common answer. */
const NOTHING: KillResult = { ok: false }

export async function rewardThingKill(
  slug: string,
  thingId: string,
): Promise<KillResult> {
  const context = await requireTenant(slug, { guests: true })
  const { supabase, tenant, user } = context

  // Off means nothing charges and nothing pays, here as everywhere.
  if (!(await economyOn(supabase, tenant.id))) return NOTHING

  const { data: thing } = await supabase
    .from('thingiverse_things_read_model')
    .select('blueprint_id, tenant_id')
    .eq('id', thingId)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (!thing) return NOTHING

  const { data: blueprint } = await supabase
    .from('thingiverse_blueprints_read_model')
    .select('spec')
    .eq('id', thing.blueprint_id)
    .maybeSingle()

  if (!blueprint) return NOTHING

  /*
    The rule that keeps this from printing coins. Strictly greater, so a thing
    priced at exactly the reward pays nothing and the loop can never break even.
  */
  const price = priceOfThing((blueprint.spec ?? {}) as { price?: number })
  if (price <= THING_KILL) return NOTHING

  /*
    Claimed before the coin moves, like a door toll: what is being protected is
    not a purchase but *not paying twice*. A crash between the two costs one
    player one coin, which is the cheapest failure on offer.
  */
  const { data: claimed, error } = await supabase.rpc('thing_kill_claim', {
    p_thing: thingId,
    p_tenant: tenant.id,
    p_paid: THING_KILL,
  })

  if (error || claimed !== true) return NOTHING

  const paid = await credit(supabase, tenant.id, user.id, {
    amount: THING_KILL,
    reason: 'battle-kill',
    what: 'something you broke',
  })

  if (!paid.ok) return NOTHING

  // Read once, here, so the caller does not have to. See `KillResult`.
  const { data: purse } = await supabase
    .from('homestead_read_model')
    .select('coins')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .maybeSingle()

  return { ok: true, paid: THING_KILL, balance: purse?.coins ?? 0 }
}
