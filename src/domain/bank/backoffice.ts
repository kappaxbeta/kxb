import 'server-only'
import { spendReasonOf, type HomesteadEvent } from '@/domain/homestead/events'
import { REASON_LABELS, isMint, type CoinReason } from '@/domain/bank/reasons'
import type { Client } from '@/es/store'

/**
 * Where a space's coins came from, and where one person's went.
 *
 * `docs/product/economy.md` §13. Built around **people and movements**, not
 * around totals, and that is the whole design of it.
 *
 * A balance tells you *what* somebody has. Only the movements tell you *how
 * they got it*, and every question this section exists to answer is a question
 * about movements: is anybody printing coins, has a space quietly priced every
 * door, is this ranking real. A page of totals answers none of them.
 *
 * It is also what catches bugs. The credit half of every member-to-member
 * transfer was silently landing on the sender's own row and being dropped by
 * the replay guard - sender debited, nobody credited - and nothing in the
 * product could have shown that, because nothing in the product could read a
 * movement.
 */

export interface MoneyPerson {
  userId: string
  /** Every space they hold a balance in, and what it is. */
  spaces: { tenantId: string; name: string | null; coins: number; earned: number }[]
  /** Their wallet, which belongs to no space. */
  wallet: number
  /** Purses plus wallet. The figure to sort a list of suspects by. */
  total: number
}

export interface Movement {
  at: string
  tenantId: string
  /**
   * Whose movement this is.
   *
   * Redundant on a person's own statement and the whole point of a space's:
   * read down a space, every line belongs to somebody different, and "who" is
   * the column the reader is actually scanning.
   */
  owner: string
  /**
   * The other end of it, when there was one.
   *
   * Only a transfer and a paid earning have one - a mint has nobody on the
   * other side, which is the entire reason `minted` is worth a badge. Filling
   * it is what turns "-40, sent" into "-40 to Ada, in the kitchen", and those
   * are different amounts of information when the question is where a space's
   * coins are pooling.
   */
  counterparty: string | null
  /** Signed: positive arrived, negative left. */
  amount: number
  reason: CoinReason
  label: string
  /** What it was for, when the event said. */
  what: string | null
  /**
   * Whether this movement *created* coins.
   *
   * The column to read first. Everything else nets to zero somewhere, so an
   * economy can only inflate through one of these - a person whose history is
   * mostly mints is either playing a great deal or is the reason the totals
   * stopped making sense.
   */
  minted: boolean
}

/**
 * The people with money, richest first.
 *
 * Reads the purses and the wallets and joins them here rather than in SQL,
 * because they are in genuinely different worlds: a purse is tenant-scoped read
 * model and a wallet is a global row with no tenant at all. A view over both
 * would have to invent a tenant for the wallet half.
 *
 * Service-role only. `wallets` and `leaderboard_hidden` have no read policy for
 * a session, which is deliberate - see their migrations.
 */
export async function readMoneyPeople(
  admin: Client,
  limit = 100,
): Promise<MoneyPerson[]> {
  const [purses, wallets, spaces] = await Promise.all([
    admin
      .from('homestead_read_model')
      .select('user_id, tenant_id, coins, earned')
      .order('coins', { ascending: false })
      .limit(limit * 4),
    admin.from('wallets').select('user_id, coins'),
    admin.from('tenants_read_model').select('id, name'),
  ])

  const names = new Map((spaces.data ?? []).map((row) => [row.id, row.name]))
  const walletOf = new Map((wallets.data ?? []).map((row) => [row.user_id, row.coins]))

  const people = new Map<string, MoneyPerson>()

  for (const row of purses.data ?? []) {
    const person = people.get(row.user_id) ?? {
      userId: row.user_id,
      spaces: [],
      wallet: walletOf.get(row.user_id) ?? 0,
      total: walletOf.get(row.user_id) ?? 0,
    }
    person.spaces.push({
      tenantId: row.tenant_id,
      name: names.get(row.tenant_id) ?? null,
      coins: row.coins,
      earned: row.earned,
    })
    person.total += row.coins
    people.set(row.user_id, person)
  }

  // Somebody can hold a wallet and no purse - they earned somewhere, withdrew,
  // and left. They are exactly the shape worth seeing on this page, so they are
  // added rather than dropped for having no space.
  for (const [userId, coins] of walletOf) {
    if (people.has(userId)) continue
    people.set(userId, { userId, spaces: [], wallet: coins, total: coins })
  }

  return [...people.values()].sort((a, b) => b.total - a.total).slice(0, limit)
}

/**
 * One person's movements, newest first - in one space, or across all of them.
 *
 * Read from the **event log**, not from a ledger table, because the log is
 * where a purse's history actually is - the read model only ever carries the
 * running total. That is the whole reason §12 rule 2 insists every movement
 * carries a reason at the time it is written: this query cannot reconstruct one
 * afterwards, because ten coins arriving looks identical whether it was a won
 * battle, a loan or somebody minting them.
 *
 * Scoped by the event's `owner` where there is one and by `actor_id` otherwise,
 * which is the same rule the projection follows - see `ownerOf`. Doing it any
 * other way would attribute every cross-stream credit to whoever was signed in.
 */
export async function readMovements(
  admin: Client,
  userId: string,
  options: { tenantId?: string; limit?: number } = {},
): Promise<Movement[]> {
  const { tenantId, limit = 200 } = options
  return sweep(admin, limit, (move) => move.owner === userId && inSpace(move, tenantId))
}

/**
 * Every movement in one space, newest first, whoever it belonged to.
 *
 * The other axis, and the one that answers a different question. A person's
 * statement tells you what they did; a space's tells you what is *happening* -
 * whether a door is taking from everybody, whether the same two accounts are
 * passing the same coins back and forth, whether one member is the source of
 * everything anybody else has.
 *
 * Both sides come out of `sweep`, so a movement means exactly the same thing
 * whichever list it is read in. Two hand-rolled loops over the same events
 * would eventually disagree about what a `CustomerServed` is worth, and the
 * disagreement would look like a bug in the economy rather than in this file.
 */
export async function readSpaceMovements(
  admin: Client,
  tenantId: string,
  options: { userId?: string; limit?: number } = {},
): Promise<Movement[]> {
  const { userId, limit = 200 } = options
  return sweep(
    admin,
    limit,
    (move) => move.tenantId === tenantId && (!userId || move.owner === userId),
  )
}

/** `undefined` means every space, which is a person's whole history. */
function inSpace(move: Movement, tenantId: string | undefined): boolean {
  return !tenantId || move.tenantId === tenantId
}

/**
 * The read both statements are made of.
 *
 * One pass over the newest money events, mapped, then filtered by the caller's
 * predicate. The filter is applied *after* the mapping rather than as a `.eq`
 * because the thing being filtered on is not a column: whose movement an event
 * is depends on the payload - see `ownerOf` - and a query cannot ask that.
 *
 * The consequence is worth stating rather than discovering. The window is the
 * last `limit * 5` money events **in the product**, not per person and not per
 * space, so a quiet space whose last movement was a month ago can fall out of
 * a busy window entirely and read as "nothing has moved". That is the honest
 * shape of a log with no index for this: §13 says this page is opened when
 * somebody already has a suspicion, not to browse. A wider window is a bigger
 * multiplier here and nothing else.
 */
async function sweep(
  admin: Client,
  limit: number,
  keep: (move: Movement) => boolean,
): Promise<Movement[]> {
  const { data, error } = await admin
    .from('events')
    .select('type, data, tenant_id, actor_id, created_at')
    .eq('stream_type', 'homestead')
    .in('type', ['CoinsSpent', 'CoinsEarned', 'CoinsSent', 'CoinsReceived', 'CustomerServed'])
    .order('created_at', { ascending: false })
    .limit(limit * 5)

  if (error) throw new Error(`Failed to read movements: ${error.message}`)

  const movements: Movement[] = []

  for (const row of data ?? []) {
    const payload = (row.data ?? {}) as Record<string, unknown>

    // Whose movement this is. `owner` when the event carries one, the actor
    // otherwise - the same fallback the projection uses, and for the same
    // reason: a cross-stream credit is stamped with whoever was signed in.
    const owner =
      typeof payload.owner === 'string' && payload.owner !== ''
        ? payload.owner
        : row.actor_id

    if (!owner) continue

    const event = { type: row.type, data: payload } as unknown as HomesteadEvent
    const movement = movementOf(event, row.tenant_id, row.created_at, owner)
    if (movement && keep(movement)) movements.push(movement)
    if (movements.length >= limit) break
  }

  return movements
}

/**
 * One event as a line on a statement, or `null` for one that moved nothing.
 *
 * Kept apart from the query so the mapping is a pure function of an event: the
 * interesting part is deciding what each type *means* to a reader, and that
 * should be testable without a database. Exported for exactly that and for
 * nothing else - the two statements go through `sweep`, which is the only
 * caller that knows how to work out an owner.
 */
export function movementOf(
  event: HomesteadEvent,
  tenantId: string,
  at: string,
  owner: string,
): Movement | null {
  const line = (
    amount: number,
    reason: CoinReason,
    what: string | null,
    counterparty: string | null = null,
  ): Movement => ({
    at,
    tenantId,
    owner,
    counterparty,
    amount,
    reason,
    label: REASON_LABELS[reason],
    what,
    // Only an *earning* can mint, so a spend is never asked. `isMint` is typed
    // for earn reasons and this is the one place both kinds meet.
    minted: amount > 0 && isMint(reason as never),
  })

  switch (event.type) {
    case 'CoinsSpent': {
      const reason = spendReasonOf(event.data)
      return line(-event.data.cost, reason, event.data.what)
    }
    case 'CoinsEarned':
      // `from` is absent on a mint and present when somebody paid - which is
      // the same distinction `minted` draws, arrived at from the event rather
      // than from the reason table. They agree; if they ever stop, the event
      // is right and the table is stale.
      return line(
        event.data.amount,
        event.data.reason,
        event.data.what ?? null,
        event.data.from ?? null,
      )
    case 'CoinsSent':
      return line(-event.data.amount, 'transfer-out', null, event.data.to)
    case 'CoinsReceived':
      return line(event.data.amount, 'transfer-in', null, event.data.from)
    case 'CustomerServed':
      return line(event.data.payment, 'served', event.data.dish ?? null)
    default:
      return null
  }
}
