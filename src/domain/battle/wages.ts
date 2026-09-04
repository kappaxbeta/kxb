import 'server-only'
import {
  BATTLE_KILL,
  BATTLE_LOSS,
  BATTLE_STAKE,
  BATTLE_WIN,
  REVIVE,
} from '@/domain/bank/prices'
import { charge, credit, fine, pay } from '@/domain/bank/purse'
import type { BattleEvent } from '@/domain/battle/events'
import { wonBy } from '@/domain/battle/roster'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * What a round of battle costs and pays.
 *
 * `docs/product/economy.md` §7. Kept out of `actions.ts` deliberately: that file
 * is about *what happened in a match*, and it is already long. Money is a
 * separate subject with its own failure modes, and the day somebody changes how
 * a defeat is recorded should not be the day they accidentally change what one
 * pays.
 *
 * Everything here goes through `bank/purse.ts`, which owns the gate (`economy`
 * off means nothing charges), the reasons, and the rule that a debit is written
 * before a credit. Nothing in this file names an amount - the constants are in
 * `bank/prices.ts` and no browser-facing schema accepts one.
 *
 * ---------------------------------------------------------------------------
 * Money never decides the match
 * ---------------------------------------------------------------------------
 * Every function here is called *after* the event that caused it has already
 * been appended and accepted. A failed charge does not undo a defeat and does
 * not stop a battle starting - it is reported and the round goes on.
 *
 * That is the only defensible ordering. The alternative - refusing to record
 * that somebody was knocked out because their purse was busy - would make the
 * economy able to corrupt the game it is decorating, and a player mid-fight
 * would experience it as the match freezing. A coin that failed to move is a
 * line in a log; a match that failed to record a defeat is unplayable.
 */

/**
 * Claim the right to pay, exactly once.
 *
 * `false` means somebody already did. Everything that moves coins for a match
 * goes through this first, because the shape battle payouts follow -
 * `creditWorld`'s, asked after *every* command rather than in each of the four
 * actions that can end a match - runs the check again on the next command and
 * the one after that. Crediting a world twice sets a flag that was already set;
 * paying a winner twice creates ten coins out of somebody clicking "rematch".
 *
 * The race is settled by the database's primary key rather than by a read this
 * function did a moment earlier - see the migration.
 */
async function claim(
  supabase: Client,
  tenantId: string,
  battleId: string,
  phase: 'entry' | 'victory',
): Promise<boolean> {
  const { data, error } = await supabase.rpc('battle_payout_claim', {
    p_battle_id: battleId,
    p_phase: phase,
    p_tenant: tenantId,
  })

  // A failed claim is not a claim. Falling back to "somebody else has it" is
  // the safe direction on a money path: the recoverable mistake is a match that
  // did not pay, which is a line in a log somebody can act on. The other one
  // creates coins.
  if (error) return false
  return data === true
}

/**
 * Who gets paid when somebody enters, and whether anybody does.
 *
 * The stake goes to whoever owns the level being played, which is the first
 * time authoring pays anything in this product - and it pays *per play* rather
 * than per sale, so a level that is fun a hundred times earns more than one
 * that was taken once and never opened.
 *
 * `null` when there is nobody to pay, and there are two ways that happens: a
 * match on a world rather than on a project (`xp_id` is null), and a project
 * whose owner has left (`owner_id` is null - see `XpTransferred` and the
 * removal paths). **Neither charges anybody.** A toll with no recipient would
 * be a burn wearing a payment's name, and `docs/product/economy.md` §5 keeps
 * that list deliberately short.
 */
async function levelOwner(
  supabase: Client,
  battleId: string,
): Promise<{ xpId: string; ownerId: string; name: string; once: number } | null> {
  const { data: battle } = await supabase
    .from('battles_read_model')
    .select('xp_id')
    .eq('id', battleId)
    .maybeSingle()

  if (!battle?.xp_id) return null

  const { data: xp } = await supabase
    .from('xps_read_model')
    .select('owner_id, name, price_once')
    .eq('id', battle.xp_id)
    .maybeSingle()

  if (!xp?.owner_id) return null
  return {
    xpId: battle.xp_id,
    ownerId: xp.owner_id,
    name: xp.name,
    once: xp.price_once ?? 0,
  }
}

/** Everybody who has already bought this level, so nobody is charged twice. */
async function alreadyBought(
  supabase: Client,
  xpId: string,
  players: readonly string[],
): Promise<ReadonlySet<string>> {
  if (players.length === 0) return new Set()

  const { data, error } = await supabase
    .from('xp_purchases')
    .select('account_id')
    .eq('xp_id', xpId)
    .in('account_id', [...players])

  /*
    A failed read means "everybody has paid", not "nobody has". The two mistakes
    are not the same size: charging somebody a second time for a level they
    already bought is the thing that makes a price untrustworthy, and letting a
    round go free because a lookup blipped costs the owner a few coins they can
    see in the log. Same direction the `economy` flag falls in.
  */
  if (error) return new Set(players)
  return new Set((data ?? []).map((row) => row.account_id))
}

/** Everybody in the match, for charging the door. */
async function rosterOf(supabase: Client, battleId: string): Promise<string[]> {
  const { data } = await supabase
    .from('battle_participants')
    .select('user_id')
    .eq('battle_id', battleId)

  return (data ?? []).map((row) => row.user_id)
}

/**
 * The door, charged once when the match actually starts.
 *
 * At kickoff rather than at join, and the difference matters to somebody who
 * looked at a lobby and left: joining is browsing, and starting is playing. It
 * also means a match that never begins costs nobody anything, which is the
 * right answer for the lobby that sat there for an hour waiting for a fourth.
 *
 * The level's owner is not charged for their own level - `pay` drops a movement
 * whose two ends are the same person rather than writing two events that net to
 * nothing.
 *
 * Charged one player at a time and *not* stopped by a failure. A purse that
 * refuses is one player who got in free, which is a line in the log; abandoning
 * the loop would mean whether you paid depended on where you were in a list.
 */
export async function chargeEntry(
  supabase: Client,
  tenantId: string,
  battleId: string,
): Promise<void> {
  const owner = await levelOwner(supabase, battleId)
  if (!owner) return

  if (!(await claim(supabase, tenantId, battleId, 'entry'))) return

  const roster = await rosterOf(supabase, battleId)

  /*
    A level with a one-time price is bought rather than rented. The first entry
    pays `once` and every entry after it is free - *including* the stake, which
    is the whole point: being charged a toll on something you have already
    bought is how people stop trusting a price. So the two models are exclusive
    rather than cumulative, and which one applies is decided here once for the
    whole roster.
  */
  const bought = owner.once > 0
    ? await alreadyBought(supabase, owner.xpId, roster)
    : new Set<string>()

  for (const player of roster) {
    if (owner.once === 0) {
      await pay(supabase, tenantId, {
        from: player,
        to: owner.ownerId,
        amount: BATTLE_STAKE,
        reason: 'battle-stake',
        what: owner.name,
      })
      continue
    }

    // Paid before, or it is their own level. Either way nothing moves, and the
    // receipt below is not written - `pay` already drops a movement whose two
    // ends are the same person.
    if (bought.has(player) || player === owner.ownerId) continue

    const paid = await pay(supabase, tenantId, {
      from: player,
      to: owner.ownerId,
      amount: owner.once,
      reason: 'battle-stake',
      what: owner.name,
    })
    // The receipt goes in only after the coins actually moved. Written first,
    // a failed payment would hand somebody the level for nothing and there
    // would be no second chance to charge them - the row says they have paid.
    if (!paid.ok) continue

    await supabase.from('xp_purchases').insert({
      account_id: player,
      xp_id: owner.xpId,
      // What it cost today, not what it costs whenever this is read back. Same
      // rule `PropPlaced` states about `price`.
      paid: owner.once,
      tenant_id: tenantId,
    })
  }
}

/**
 * Somebody went down.
 *
 * The victim is *fined* rather than charged: `fine` takes what there is and
 * forgives the rest, because refusing an unaffordable loss would make losing
 * free for exactly the people who lose most. §7.3.
 *
 * ---------------------------------------------------------------------------
 * Paying on a field nobody trusts
 * ---------------------------------------------------------------------------
 * `by` is what the victim *believes* finished them. `PlayerDefeated` says
 * plainly that it is recorded and not trusted - it decides whose name is on a
 * kill feed, never who wins - and paying a coin on it looks like exactly the
 * mistake that turns an untrusted field into a thing worth lying about.
 *
 * What makes it safe is arithmetic, not authority: **a kill pays less than a
 * loss costs.** Reporting your own defeat and naming a friend moves 1 coin to
 * them and takes 3 from you. Two players colluding are down 2 coins a round.
 * There is no version of that which prints money, so there is no reason to do
 * it, and no check is needed to stop it.
 *
 * That is a constraint on the *prices*, not on this code, and it is pinned in
 * `prices.test.ts`. If a kill ever pays more than a loss costs, this becomes a
 * mint and the field would need to be believed - which it cannot be.
 */
export async function payDefeat(
  supabase: Client,
  tenantId: string,
  victim: string,
  by?: string,
  respawns = false,
): Promise<void> {
  // No `claim` here, unlike the door and the purse. It needs none: this is only
  // ever called with a `PlayerDefeated` that was just appended, and the decider
  // writes at most one of those per player per match. The exactly-once property
  // is upstream, in the log, rather than in a table beside it.
  await fine(supabase, tenantId, victim, {
    amount: BATTLE_LOSS,
    reason: 'battle-loss',
    what: 'a defeat',
  })

  /*
    Getting back up, in a match that lets you.

    Charged here rather than from the runtime, and that is a deliberate
    departure from what §7 describes as a separate price. Respawning is a
    *client-side* event: the scene puts you back on your feet in a frame, with
    no server round trip anywhere near it. Adding one would mean a server action
    fired from inside a live canvas - which tears the React tree down and takes
    the scene with it, the trap `polled-server-actions` is remembered for.

    So the coin is taken where the server already is. In a match with respawn
    on, being defeated *is* getting back up, and the two are charged together
    from the one event that already crosses the wire.

    The consequence, stated rather than hidden: somebody knocked out four times
    in a respawning match pays the revive once, because the decider records one
    defeat per player per match. That is a cheaper economy than §7 describes and
    it is the right trade - the alternative is a purchase on the hot path.
  */
  if (respawns) {
    await charge(supabase, tenantId, victim, {
      amount: REVIVE,
      reason: 'revive',
      what: 'getting back up',
    })
  }

  // Nobody named, or the victim naming themselves - which is what falling off
  // the map looks like from inside the runtime. Neither is a knockout.
  if (!by || by === victim) return

  await credit(supabase, tenantId, by, {
    amount: BATTLE_KILL,
    reason: 'battle-kill',
    what: 'a knockout',
  })
}

/**
 * Who was left standing.
 *
 * Takes a list rather than one id because a side can win: in a team match every
 * player on the winning side is a winner, and paying only whoever the read
 * model happens to name first would be arbitrary.
 *
 * A draw pays nobody. `BattleEnded.winner` is null for a match that ended with
 * nobody up, and that is a real outcome rather than a case to smooth over.
 */
export async function payVictory(
  supabase: Client,
  tenantId: string,
  battleId: string,
  winners: readonly string[],
): Promise<void> {
  if (winners.length === 0) return
  if (!(await claim(supabase, tenantId, battleId, 'victory'))) return

  for (const winner of winners) {
    await credit(supabase, tenantId, winner, {
      amount: BATTLE_WIN,
      reason: 'battle-win',
      what: 'a win',
    })
  }
}


/**
 * Settle whatever this match now owes, whoever just did something.
 *
 * Called after every battle command, exactly as `creditWorld` is, and the note
 * beside that function is the argument for this shape too: "did that start it"
 * and "did that end it" are questions about the *projection*, not about which
 * button was pressed. Asking them once, here, is the only version that cannot
 * be forgotten when a fifth way to end a match is added - and there are already
 * four.
 *
 * Both phases are idempotent through `claim`, which is what makes it safe to
 * ask on every command including the fiftieth after the match finished.
 *
 * ---------------------------------------------------------------------------
 * Silent on failure, deliberately
 * ---------------------------------------------------------------------------
 * A match that ended is over whether or not the coins moved. Reporting a purse
 * error back through `run` would turn a money problem into a *match* problem -
 * the player who reported the final defeat would see their action fail, and the
 * runtime would retry an event that had already landed.
 *
 * So the game is authoritative and the economy follows it. That direction is
 * chosen rather than accepted: the failure it admits is a payout that has to be
 * found in the log and made good, which is a support conversation. The other
 * direction admits matches that cannot be finished, which is unplayable.
 */
export async function settleBattle(
  supabase: Client,
  tenantId: string,
  battleId: string,
  appended: readonly StoredEvent<BattleEvent>[],
): Promise<void> {
  const { data: battle } = await supabase
    .from('battles_read_model')
    .select('status, started_at, winner_type, winner_id, respawn_on')
    .eq('id', battleId)
    .maybeSingle()

  if (!battle) return

  /*
    Defeats come from what was just written, not from the read model.
    `battle_participants.defeated` is true after the first knockout and stays
    true, so settling off it would fine the same player again on every command
    that followed. The append is exactly-once by construction: the decider emits
    `PlayerDefeated` only for somebody who was not already down, and optimistic
    concurrency means one caller wins the write.

    The row above is read first because a defeat's price depends on it: in a
    match that respawns, going down and getting back up are charged together.
  */
  for (const event of appended) {
    if (event.type !== 'PlayerDefeated') continue
    await payDefeat(
      supabase,
      tenantId,
      event.data.userId,
      event.data.by,
      battle.respawn_on === true,
    )
  }

  // The door. Charged once the match has actually kicked off rather than when
  // people joined - a lobby that never started costs nobody anything.
  if (battle.started_at) await chargeEntry(supabase, tenantId, battleId)

  if (battle.status !== 'ended') return

  // A draw. `BattleEnded.winner` is null for a match that ended with nobody up,
  // and that is a real outcome rather than a case to smooth over - it pays
  // nobody, and the claim is left unspent so nothing is written at all.
  if (battle.winner_type !== 'player' && battle.winner_type !== 'side') return

  const winner = { type: battle.winner_type, id: battle.winner_id ?? '' } as const

  const { data: roster } = await supabase
    .from('battle_participants')
    .select('user_id, side')
    .eq('battle_id', battleId)

  /*
    `wonBy` rather than a comparison written out again here. In a team match
    every player on the winning side won, and in a duel only the named player
    did - one rule, already stated once in `roster.ts`, and already what the
    scoreboard and the podium use. A second copy of it in the file that hands
    out money is the copy that eventually disagrees with what the players were
    shown.
  */
  const winners = (roster ?? [])
    .filter((row) => wonBy(winner, row.user_id, row.side))
    .map((row) => row.user_id)

  await payVictory(supabase, tenantId, battleId, winners)
}
