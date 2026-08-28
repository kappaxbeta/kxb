'use server'

import { initialState as initialCafe } from '@/domain/cafe/game'
import { initialState as initialHome } from '@/domain/home/game'
import { homesteadDecider } from '@/domain/homestead/aggregate'
import {
  buyGroundSchema,
  movePropSchema,
  placePropSchema,
  removePropSchema,
  sellGroundSchema,
  serveCustomerSchema,
  setHomesteadAccessSchema,
} from '@/domain/homestead/commands'
import type { HomesteadCommand } from '@/domain/homestead/commands'
import { homesteadProjection } from '@/domain/homestead/projection'
import { homesteadStreamId } from '@/domain/homestead/streams'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { requireTenant, writeBlockedReason } from '@/lib/tenant'

export type HomesteadResult = { ok: true } | { ok: false; error: string }

/**
 * Every write goes through here.
 *
 * The repetition each action would otherwise carry - resolve the tenant, refuse
 * a lapsed subscription, append, catch the two error kinds, re-run the
 * projection - is identical in all five, and identical boilerplate is where the
 * one that forgot its entitlement check hides.
 *
 * Deliberately *not* revalidating a path. These are fired from inside a live
 * WebGL canvas, several times a minute; a `revalidatePath` would tear the React
 * tree down and take the scene with it. The client already applies the change
 * optimistically and holds the authoritative copy from its own subscription -
 * the same call the lounge's block edits make.
 */
async function run(slug: string, command: HomesteadCommand): Promise<HomesteadResult> {
  const context = await requireTenant(slug)

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  try {
    await executeCommand({
      supabase,
      decider: homesteadDecider,
      tenantId: tenant.id,
      // Derived from the session's own user id - see `homesteadStreamId`.
      streamId: homesteadStreamId(tenant.id, user.id),
      command,
      metadata: { actorId: user.id },
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      // Two members decorating at once. `executeCommand` already retried; this
      // is the case where it kept losing, and asking again is the honest answer.
      return { ok: false, error: 'Somebody else was decorating. Try again.' }
    }
    throw error
  }

  await runProjection(supabase, homesteadProjection, tenant.id)
  return { ok: true }
}

/**
 * Open this workspace's café, house and garden.
 *
 * Safe to call on every page load: the decider returns no events for a
 * workspace that already has one, so the second call and the thousandth are
 * both free. That is deliberate - there is no other reliable moment to notice
 * that a workspace has never opened one, and a "create" button would be a
 * question nobody wants to be asked.
 *
 * The opening layout comes from the same `initialState` the single-player
 * prototypes use, so a workspace's café starts as the same sensible little
 * kitchen. It is captured into the event rather than referenced, so editing
 * that function later cannot rearrange a room somebody has already moved into.
 */
export async function foundHomestead(slug: string): Promise<HomesteadResult> {
  const cafe = initialCafe()
  const home = initialHome('home')
  const outdoor = initialHome('outdoor')

  return run(slug, {
    type: 'FoundHomestead',
    coins: cafe.coins,
    layout: {
      cafe: [...cafe.props].map(([tile, placed]) => ({
        tile,
        propId: placed.propId,
        rotY: placed.rotY,
      })),
      home: [...home.props].map(([tile, placed]) => ({
        tile,
        propId: placed.propId,
        rotY: placed.rotY,
      })),
      outdoor: [...outdoor.props].map(([tile, placed]) => ({
        tile,
        propId: placed.propId,
        rotY: placed.rotY,
      })),
    },
  })
}

export async function placeProp(
  slug: string,
  input: { place: string; tile: string; propId: string; rotY: number },
): Promise<HomesteadResult> {
  const parsed = placePropSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad placement' }
  }
  return run(slug, { type: 'PlaceProp', ...parsed.data })
}

export async function removeProp(
  slug: string,
  input: { place: string; tile: string },
): Promise<HomesteadResult> {
  const parsed = removePropSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad removal' }
  }
  return run(slug, { type: 'RemoveProp', ...parsed.data })
}

export async function moveProp(
  slug: string,
  input: { place: string; from: string; to: string; rotY: number },
): Promise<HomesteadResult> {
  const parsed = movePropSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad move' }
  }
  return run(slug, { type: 'MoveProp', ...parsed.data })
}

export async function buyGround(
  slug: string,
  input: { place: string; tiles: string[] },
): Promise<HomesteadResult> {
  const parsed = buyGroundSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad purchase' }
  }
  return run(slug, { type: 'BuyGround', ...parsed.data })
}

/** Sell ground back, shrinking a room. The mirror of `buyGround`. */
export async function sellGround(
  slug: string,
  input: { place: string; tiles: string[] },
): Promise<HomesteadResult> {
  const parsed = sellGroundSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad sale' }
  }
  return run(slug, { type: 'SellGround', ...parsed.data })
}

/**
 * A customer paid up.
 *
 * The one action that creates money, so the one worth reading the decider's
 * `ServeCustomer` case alongside: the payment is bounded by the dish's menu
 * price, because the exact figure depends on ambience the aggregate does not
 * model. A client that lies can be out by a tip, not by a fortune.
 */
export async function serveCustomer(
  slug: string,
  input: { dish: string; payment: number },
): Promise<HomesteadResult> {
  const parsed = serveCustomerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad payment' }
  }
  return run(slug, { type: 'ServeCustomer', ...parsed.data })
}

/**
 * Set your own front door.
 *
 * Takes no user id, and that is the security model rather than an omission.
 * `run` derives the stream from the session, so this can only ever reach the
 * caller's own homestead - there is no argument that would let somebody fling
 * open a colleague's door. The same property that makes redecorating somebody
 * else's house unaddressable makes unlocking it unaddressable too.
 */
export async function setHomesteadAccess(
  slug: string,
  input: { mode: string },
): Promise<HomesteadResult> {
  const parsed = setHomesteadAccessSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Bad door setting' }
  }
  return run(slug, { type: 'SetHomesteadAccess', ...parsed.data })
}
