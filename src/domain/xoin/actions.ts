'use server'

import {
  floatAt,
  quoteBuy,
  quoteSell,
  rulesOf,
  type Market,
  type Quote,
  type XoinMode,
} from '@kxb/xoin'

import { charge, credit, economyOn } from '@/domain/bank/purse'
import { payIntoBank } from '@/domain/bank/deposits'
import { xoinDecider } from '@/domain/xoin/aggregate'
import { movementsFor } from '@/domain/xoin/movements'
import { completeTrade } from '@/domain/xoin/settlement'
import type { XoinCommand } from '@/domain/xoin/commands'
import { xoinProjection } from '@/domain/xoin/projection'
import {
  readHolding,
  readMarket,
  type HoldingView,
  type MarketView,
} from '@/domain/xoin/queries'
import { xoinStreamId } from '@/domain/xoin/streams'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasRole, requireTenant, writeBlockedReason } from '@/lib/tenant'

/**
 * The door into a space's market.
 *
 * ---------------------------------------------------------------------------
 * Why the stream is written with the service role
 * ---------------------------------------------------------------------------
 * The decider computes every coin figure on a `Traded` event, so a caller can
 * only ask for a trade at the true price. That is the security model - and it
 * is worth nothing on its own, because `events` admits an ordinary member's
 * insert on any stream that is not `tenant`. Without something else, a modified
 * client would simply POST its own `Traded` carrying whatever numbers it liked
 * and never come near this file.
 *
 * So the migration adds a RESTRICTIVE policy refusing *every* client insert on
 * `stream_type = 'xoin'`, and the only writer left is the service role, here.
 * The consequence, spelled out because it is easy to undo by accident: these
 * appends have no `auth.uid()`, so nothing on the xoin stream may rely on
 * `actor_id`. Who traded is in the event's `by`.
 *
 * The *purse*, by contrast, is moved with the member's own client. That is not
 * an inconsistency: `SpendCoins` carries no owner and is projected off the
 * actor, so moving it with the service role would write a spend belonging to
 * nobody. See `ownerOf` in the homestead projection.
 *
 * ---------------------------------------------------------------------------
 * No `revalidatePath`, ever
 * ---------------------------------------------------------------------------
 * Whoever presses these buttons may be standing inside the cartridge, and this
 * app's scene actions all inherit the same lesson: a layout re-render tears the
 * canvas down. The desk is handed back its new state and updates itself.
 */

export type XoinResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface DeskView {
  market: MarketView
  holding: HoldingView
  /** The member's real purse, or null in a mode where it is not at stake. */
  coins: number | null
}

/**
 * What the desk needs, in one round trip.
 *
 * One action rather than three, because `requireTenant` writes cookies and a
 * page that called it three times would re-render three times - the lesson
 * behind "never poll a Server Action" in this codebase, applied to fetching
 * rather than polling.
 */
export async function readXoinDesk(slug: string): Promise<XoinResult<DeskView | null>> {
  const context = await requireTenant(slug)
  if (!context.features.xoin) return { ok: false, error: 'This space has no market.' }

  const { supabase, tenant, user } = context
  const market = await readMarket(supabase, tenant.id)
  if (!market) return { ok: true, data: null }

  const [holding, coins] = await Promise.all([
    readHolding(supabase, tenant.id, user.id),
    rulesOf(market.mode).spendsPurse ? purseOf(supabase, tenant.id, user.id) : Promise.resolve(null),
  ])

  return { ok: true, data: { market, holding, coins } }
}

/**
 * Open a market, or change what it is.
 *
 * Owners and admins, like every other switch that changes what a space is doing
 * to everybody in it - and this is the most consequential of them, because it
 * is the difference between a game and somebody's coins.
 *
 * The polite copy of that rule is here; the real one is the RESTRICTIVE policy
 * in the migration, which refuses every client write to this stream outright.
 * A market's decider cannot check a role for the same reason the radio's
 * cannot: roles are state of the tenant stream, and this is not it.
 */
export async function setXoinMode(slug: string, mode: XoinMode): Promise<XoinResult<MarketView>> {
  const context = await requireTenant(slug)
  if (!context.features.xoin) return { ok: false, error: 'This space has no market.' }

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  if (!hasRole(context, ['owner', 'admin'])) {
    return { ok: false, error: 'Only an owner or an admin can change the market.' }
  }

  const { supabase, tenant } = context

  /**
   * A mode that spends purses needs the economy on, and the check is here as
   * well as in `rulesOf` because this is where somebody is *choosing* it. An
   * owner switching a space onto real coins in a space that has no economy
   * would produce a market that refuses every trade, and the refusal would
   * arrive later, to a member, about a decision they did not make.
   */
  if (rulesOf(mode).needsEconomy && !(await economyOn(supabase, tenant.id))) {
    return {
      ok: false,
      error: 'That mode spends real coins, and this space does not have the economy switched on.',
    }
  }

  const existing = await readMarket(supabase, tenant.id)
  const command: XoinCommand = existing
    ? { type: 'SetMode', mode }
    : { type: 'OpenMarket', mode }

  const written = await onMarket(tenant.id, command)
  if (!written.ok) return written

  const market = await readMarket(supabase, tenant.id)
  if (!market) return { ok: false, error: 'The market was opened but has not appeared yet.' }
  return { ok: true, data: market }
}

/** What the client may ask for: a side, a size, and the worst it will take. */
export interface TradeInput {
  side: 'buy' | 'sell'
  /** Coins to spend on a buy; specks to sell on a sale. */
  size: number
  agreed?: { specks?: number; coins?: number }
}

/**
 * A trade.
 *
 * ---------------------------------------------------------------------------
 * The order of the two writes, and the one hole it leaves
 * ---------------------------------------------------------------------------
 * A trade is two writes on two streams - the market's book and somebody's purse
 * - and there is no transaction across them. Something has to go first, and the
 * choice is not arbitrary:
 *
 * **The book goes first**, for both sides, because it is the write whose
 * failure means *nothing happened*. The market stream is the contended one -
 * every trade in the space lands on it - so a `ConcurrencyError` there is the
 * likely failure, and having it happen before any coin has moved means the
 * player simply sees "try again".
 *
 * Going the other way round would mean the common failure was "your coins have
 * gone and there is no trade", which is the same outcome but with somebody's
 * money in it.
 *
 * That leaves exactly one hole: the book moved and the purse then refused. The
 * compensation is `ReverseTrade`, which puts the book and the position back and
 * cannot itself fail for want of money. It is an event rather than a silent
 * rollback because a market that quietly undoes fills is one nobody can audit.
 *
 * ---------------------------------------------------------------------------
 * Why the purse is checked before the append even though it is not authoritative
 * ---------------------------------------------------------------------------
 * The decider folds the book and every position, so it can refuse a sale of
 * xoin nobody holds. It cannot see a purse - that is a different stream - so a
 * broke buyer would append a fill and then have it reversed a moment later.
 * Correct, and a horrible way to be told you cannot afford something.
 *
 * So there is a courtesy check first. It is explicitly *not* the boundary: two
 * trades in flight can still race past it, and the reversal is what catches
 * that.
 */
export async function tradeXoin(slug: string, input: TradeInput): Promise<XoinResult<DeskView>> {
  const context = await requireTenant(slug)
  if (!context.features.xoin) return { ok: false, error: 'This space has no market.' }

  const blocked = writeBlockedReason(context)
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    return { ok: false, error: 'That is not a size.' }
  }

  const market = await readMarket(supabase, tenant.id)
  if (!market) return { ok: false, error: 'This space has no market yet.' }

  const rules = rulesOf(market.mode)
  if (!rules.spendsPurse) {
    return { ok: false, error: 'This market is a demo. Nothing here is written down.' }
  }
  if (!(await economyOn(supabase, tenant.id))) {
    return { ok: false, error: 'This space does not have the economy switched on.' }
  }

  /*
   * The float at *this server's* clock, not the browser's. The client quoted
   * against its own epoch a moment ago and may well have been in the previous
   * one; `agreed` is what reconciles the two, and the decider applies it.
   */
  const at: Market = { id: tenant.id, startedAt: market.startedAt, reserves: market.reserves }
  const float = floatAt(at, Date.now())

  /*
   * Quoted here as well as in the decider, and the duplication is deliberate:
   * this copy is only used to know how many coins to move, and the decider's is
   * the one that decides. They cannot disagree - same function, same reserves -
   * and if they ever did, the event is the record and this is thrown away.
   */
  const quote =
    input.side === 'buy'
      ? quoteBuy(market.reserves, float, input.size)
      : quoteSell(market.reserves, float, input.size)

  if (!quote) return { ok: false, error: 'This market will not take a trade that size.' }

  if (input.side === 'buy') {
    const purse = await purseOf(supabase, tenant.id, user.id)
    if (purse < quote.coins) return { ok: false, error: 'Not enough coins for that.' }
  }

  /*
   * The ordering, and its compensation, live in `completeTrade` - see the note
   * there for why they are a file rather than four lines here. What this
   * supplies is the three effects; what that decides is which of them run.
   */
  const done = await completeTrade({
    record: () =>
      onMarket(tenant.id, {
        type: 'RecordTrade',
        side: input.side,
        by: user.id,
        size: input.size,
        float,
        agreed: input.agreed,
      }),
    pay: () => settleMoney(context, quote),
    reverse: (why) =>
      onMarket(tenant.id, {
        type: 'ReverseTrade',
        by: user.id,
        side: quote.side,
        coins: quote.coins,
        specks: quote.specks,
        fee: quote.fee,
        why,
      }),
  })

  if (!done.ok) return done

  const [after, holding, coins] = await Promise.all([
    readMarket(supabase, tenant.id),
    readHolding(supabase, tenant.id, user.id),
    purseOf(supabase, tenant.id, user.id),
  ])

  return after
    ? { ok: true, data: { market: after, holding, coins } }
    : { ok: false, error: 'The trade went through but the market has not reappeared.' }
}

/**
 * The purse half.
 *
 * The arithmetic - which movements, which way, how much - is `movementsFor`,
 * deliberately not written out here. What lives in this file is the *ordering*
 * and the error handling; what lives there is a property that can be checked
 * without a database, and is. See the note at the top of `movements.ts` for why
 * that split is worth a file.
 *
 * Movements are applied in order and the first refusal stops the rest. A trade
 * whose fee could not be banked is still a failed trade: the caller reverses
 * the fill, and the alternative - keeping a trade whose house cut silently went
 * missing - is a market that leaks in the direction nobody audits.
 */
async function settleMoney(
  context: Awaited<ReturnType<typeof requireTenant>>,
  quote: Quote,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, tenant, user } = context
  const what = quote.side === 'buy' ? 'bought xoin' : 'sold xoin'

  for (const movement of movementsFor(quote)) {
    const done =
      movement.kind === 'bank'
        ? await payIntoBank(supabase, tenant.id, user.id, {
            amount: movement.amount,
            reason: movement.reason,
            what,
          })
        : movement.kind === 'spend'
          ? await charge(supabase, tenant.id, user.id, {
              amount: movement.amount,
              reason: movement.reason,
              what,
            })
          : await credit(supabase, tenant.id, user.id, {
              amount: movement.amount,
              reason: movement.reason,
              what,
            })

    if (!done.ok) return done
  }

  return { ok: true }
}

/**
 * One command against a space's market, with the service role.
 *
 * The projection is run with the same client, because the read model's own
 * policies are written for a member and this writer is not one - it is the
 * projector, and it has no session at all.
 */
async function onMarket(
  tenantId: string,
  command: XoinCommand,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()

  try {
    await executeCommand({
      supabase: admin,
      decider: xoinDecider,
      tenantId,
      streamId: xoinStreamId(tenantId),
      command,
    })
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message }
    if (error instanceof ConcurrencyError) {
      // Everybody in the space trades against one book, so losing a race is
      // ordinary rather than exceptional. Asking again is the honest answer.
      return { ok: false, error: 'The market was busy. Try again.' }
    }
    throw error
  }

  await runProjection(admin, xoinProjection, tenantId)
  return { ok: true }
}

/** A member's coins, or zero for a space they have never earned anything in. */
async function purseOf(
  supabase: Awaited<ReturnType<typeof requireTenant>>['supabase'],
  tenantId: string,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from('homestead_read_model')
    .select('coins')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.coins ?? 0
}
