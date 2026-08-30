'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { battleDecider } from '@/domain/battle/aggregate'
import {
  type BattleCommand,
  battleIdSchema,
  createBattleSchema,
  joinBattleSchema,
  reportGoalSchema,
  setReadySchema,
} from '@/domain/battle/commands'
import type {
  BattleMode,
  FootballSettings,
  RaceSettings,
  Side,
  Team,
  XpMatchRules,
} from '@/domain/battle/events'
import { fightable, matchRulesProblems } from '@/domain/battle/xp-rules'
import { readShelf } from '@/domain/magazine/shelf'
import { battlesProjection } from '@/domain/battle/projection'
import {
  countRunningBattles,
  findBattle,
  type BattleView,
} from '@/domain/battle/queries'
import { closeStaleBattles } from '@/domain/battle/sweep'
import { hasRoomFor } from '@/domain/billing/quota'
import { revokeLinksForBattle } from '@/domain/guests/match-links'
import { battleModeFor } from '@/domain/xps/battle-mode'
import { loadPlayableXp } from '@/domain/xps/playable'
import { executeCommand } from '@/es/command'
import { ConcurrencyError, DomainError } from '@/es/errors'
import { runProjection } from '@/es/projection'
import type { Client } from '@/es/store'
import {
  battleOpen,
  hasRole,
  requireFeature,
  requireTenant,
  writeBlockedReason,
  xpOpen,
} from '@/lib/tenant'

/**
 * Running a match.
 *
 * The rule that shapes this file: **you may only report your own defeat.**
 * `reportDefeat` takes no user id at all - it uses the session's - because the
 * alternative hands anybody on the channel a way to end a match they are
 * losing. It is the server-side half of the same principle combat.ts already
 * enforces on the wire, where a client is authoritative over its own health and
 * nobody else's.
 *
 * The other thing worth knowing is which tenant a battle lives under. A match
 * can span two spaces, but a stream belongs to exactly one tenant, so the host
 * owns the stream and every command against it is executed with the *host's*
 * tenant id - including commands from a visiting fighter. `battleTenant()`
 * below is what resolves that, and it is why joining is not simply
 * `requireTenant(slug)` and go.
 *
 * ---------------------------------------------------------------------------
 * Guests are admitted here, and only here
 * ---------------------------------------------------------------------------
 * `requireTenant` refuses a guest by default - see `TenantOptions.guests` - so
 * every call in this file opts in explicitly. Battle is the one thing somebody
 * on a guest link may do, and picking a side is the reason they were let in;
 * without the opt-in the team buttons 404 instead of saying no.
 *
 * The opt-in is not the authorization, and it matters which layer is. The
 * decider still refuses what a non-host may not do - starting, cancelling -
 * and the events insert policy permits a guest the battle stream and no other.
 * So a guest driving this module by hand could take part in a match, and could
 * not touch the lounge, the pages, or the space itself.
 */

export type BattleResult =
  | { ok: true; battleId: string }
  | { ok: false; error: string }

function toResult(error: unknown): BattleResult {
  if (error instanceof DomainError) return { ok: false, error: error.message }
  if (error instanceof ConcurrencyError) {
    return { ok: false, error: 'That battle changed underneath you. Try again.' }
  }
  throw error
}

/**
 * Which tenant's stream a battle lives on.
 *
 * Read from the read model rather than assumed to be the caller's, because a
 * visiting fighter's own space is not the host. Returns null when the battle
 * does not exist *or* the caller cannot see it - the select policy makes those
 * the same answer, deliberately.
 */
async function battleTenant(
  supabase: Client,
  battleId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('battles_read_model')
    .select('tenant_id')
    .eq('id', battleId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load battle: ${error.message}`)
  return data?.tenant_id ?? null
}

async function run(
  supabase: Client,
  hostTenantId: string,
  battleId: string,
  actorId: string,
  command: BattleCommand,
  slug: string,
): Promise<BattleResult> {
  try {
    await executeCommand({
      supabase,
      decider: battleDecider,
      tenantId: hostTenantId,
      streamId: battleId,
      command,
      metadata: { actorId },
    })
  } catch (error) {
    return toResult(error)
  }

  await runProjection(supabase, battlesProjection, hostTenantId)
  await creditWorld(supabase, battleId)
  revalidatePath(`/t/${slug}/battle`)
  return { ok: true, battleId }
}

/**
 * A finished match credits the world it was played on.
 *
 * Here rather than in the four actions that can end one - full time, a finish,
 * a last defeat, a goal that reaches the limit - because "did that end it" is a
 * question about the projection, not about which button was pressed. Asking it
 * once, after every command, is the only version that cannot be forgotten when
 * a fifth way to end a match is added.
 *
 * Only worlds that came from the catalogue have anything to credit, and the
 * function refuses anything else: it checks that this world is a recorded copy
 * *and* that a battle on it really has ended. See `approve_world_from_match`.
 *
 * Silent on failure. A match that ended is over whether or not a badge appeared
 * on a card somewhere.
 */
async function creditWorld(supabase: Client, battleId: string): Promise<void> {
  const { data } = await supabase
    .from('battles_read_model')
    .select('world_id, status')
    .eq('id', battleId)
    .maybeSingle()

  if (data?.status !== 'ended') return

  const { error } = await supabase.rpc('approve_world_from_match', {
    p_world_id: data.world_id,
  })
  if (error) console.warn(`Could not credit that world: ${error.message}`)
  else revalidatePath('/worlds')
}

/*
  The match as it stands was a Server Action here, so the room would never have
  to call `router.refresh()` around a live WebGL canvas.

  It did not achieve that, and could not: an action that refreshes the session
  writes cookies, and Next answers a cookie-writing action by re-rendering the
  whole route it was called from. Polled every five seconds, that was the
  refresh the action existed to avoid, happening mid-fight.

  It is `GET /api/t/[slug]/battle/[battleId]` now, which is outside that
  protocol, and the route handler has the full note.
*/

export async function createBattle(
  slug: string,
  name: string,
  mode: BattleMode,
  worldId?: string,
  /** Required for `football`, and refused by the decider for anything else. */
  football?: FootballSettings,
  /** Required for `race`, and refused by the decider for anything else. */
  race?: RaceSettings,
  /**
   * An XP to fight inside, by document id.
   *
   * Last rather than beside `worldId`, where it belongs by meaning: this is a
   * six-argument positional signature with three optional tails, and a new
   * parameter in the middle silently re-reads every existing call. The type
   * checker caught all three of them, which is the argument for putting it here
   * rather than for trusting that it always would.
   *
   * The world is still the host's own space when this is set - see the note on
   * `xpId` in ./events. What changes is only where the players are sent.
   */
  xpId?: string,
  /**
   * What the host settled the level's rules to be, when they were asked.
   *
   * Last again, and for the reason `xpId` is: a seventh positional parameter in
   * the middle would silently re-read every existing call. Absent is every
   * caller that is not the wizard - `openXpHere` and the room button both open
   * a level as its author wrote it, which is the right default for a control
   * with no room to ask a question in.
   */
  xpRules?: XpMatchRules,
): Promise<BattleResult> {
  const parsed = createBattleSchema.safeParse({
    name,
    mode,
    worldId,
    xpId,
    xpRules,
    football,
    race,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid battle' }
  }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  /**
   * And the space's own switch, which is the half `requireFeature` cannot see.
   *
   * A refusal rather than a `notFound()`, unlike the pages: this is a write
   * arriving from a rail or a wizard that was rendered before somebody turned
   * the surface off, and the person pressing the button deserves a sentence
   * rather than a page that disappears. See `battleOpen` - and note it
   * deliberately does not stop anybody *finishing* a match already running.
   */
  if (!battleOpen(context)) {
    return { ok: false, error: 'Matches are switched off for this space' }
  }

  const blocked = writeBlockedReason(context, { guestsAllowed: true })
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  /**
   * How many matches this space may have running at once.
   *
   * Swept first, and that ordering is the whole of why this is not two lines.
   * A match nobody is in still counts as running until something closes it, so
   * a space that hit its cap on Friday would be unable to start anything on
   * Monday - refused by matches with no players, with nothing on the screen
   * explaining it. `closeStaleBattles` is what the rail already runs for the
   * same reason; running it here means the cap counts matches rather than
   * ghosts.
   *
   * The sweep's own failure is not this action's problem: it is a tidy-up, and
   * a space that cannot start a match because the sweep was slow is a worse
   * outcome than one that counts a stale match for another minute. So it is
   * allowed to fail and the count goes ahead regardless.
   */
  try {
    await closeStaleBattles(supabase, tenant.id)
  } catch {
    // Deliberately ignored - see above.
  }

  const running = await countRunningBattles(supabase, tenant.id)
  const { allowed, limit } = await hasRoomFor(
    supabase,
    tenant.id,
    tenant.tier,
    'matches',
    running,
  )

  if (!allowed) {
    return {
      ok: false,
      error:
        limit === 0
          ? 'This plan does not include matches.'
          : `This space already has ${limit} matches running. Finish one, or upgrade for more.`,
    }
  }

  // A named world has to be a battlefield this space may fight on: its own, or
  // somebody else's that is public. Unnamed means the space's own lounge.
  const world = parsed.data.worldId
  if (world) {
    const { data } = await supabase
      .from('battlefields_read_model')
      .select('tenant_id, visibility, archived')
      .eq('world_id', world)
      .maybeSingle()

    if (!data || data.archived) return { ok: false, error: 'Battlefield not found' }
    if (data.tenant_id !== tenant.id && data.visibility !== 'public') {
      return { ok: false, error: 'Battlefield not found' }
    }

    /**
     * A banned arena stages no new matches.
     *
     * Checked here as well as in RLS, because the policies hide a banned world
     * from *other* spaces and the space that built it still sees its own - so
     * without this, the one space whose arena was banned would be the one space
     * that could go on fighting in it.
     */
    const { data: ban } = await supabase
      .from('banned_worlds')
      .select('reason')
      .eq('world_id', world)
      .maybeSingle()

    if (ban) {
      return { ok: false, error: 'That battlefield has been taken off the platform' }
    }
  }

  /**
   * A space that is not on xp does not fight inside one.
   *
   * The plan gate, and nothing else - what the reference *names* is checked
   * below, where it is a read rather than a rule.
   */
  const xp = xpOpen(context) ? parsed.data.xpId : undefined
  if (parsed.data.xpId && !xp) {
    // Two reasons the answer can be no, and they deserve different sentences:
    // one is an operator switch nobody in this space can do anything about, the
    // other is a plan they can change in two clicks. Telling an xo customer
    // that XP "is not switched on" would send them to support instead of to
    // the billing page.
    return {
      ok: false,
      error: context.features.xp
        ? 'XP matches are part of xp. Move this space to xp to fight one.'
        : 'XP matches are not switched on for this space',
    }
  }
  /*
   * The reference has to name something this space may actually open.
   *
   * It used to be an `access()` on a filename, which was true while every XP
   * was a file we shipped. A reference can now name a version of a project, so
   * the check is a read through the caller's own client - and being a real read
   * is what makes it a *permission* check as well as an existence one: a
   * private draft in somebody else's space comes back as "not found" here
   * rather than as a match nobody can load.
   */
  /*
   * The document itself now, rather than a yes-or-no.
   *
   * It used to be `playableExists`, which is this call with the answer thrown
   * away - and the answer is what an override has to be checked against: a host
   * asking for football on a level with no goals is exactly the claim
   * `capabilityProblems` refuses in the editor, and refusing it here is the
   * same rule reaching the one other place a mode can be chosen. Loading the
   * level was already the cost of finding out whether the reference resolves.
   */
  const document = xp ? await loadPlayableXp(supabase, tenant.id, xp) : null
  if (xp && !document) return { ok: false, error: 'XP not found' }

  /*
   * A cartridge that does not claim `match` cannot be the ground for one.
   *
   * The capability has said this since it was written - *"two sides, a score
   * and an end condition; the battle lobby can set a match here"* - and until
   * now nothing read it. What stopped it being read is that a *level* without
   * it is still a world people can be in together: `openXpHere` opens a room
   * for `mensch` and for `steal-a-plant`, both freeplay-only, and a match is
   * simply the only room mechanism the Play rail has. Refusing those would take
   * away the one door half the shelf goes through.
   *
   * A **cartridge** is the case where the word is load-bearing, because a
   * cartridge's rules are code and there is no wandering-around reading of
   * them. The café and the house are one member's kitchen and one member's
   * living room, with a purse behind them and no sides, no score and no end;
   * two people scheduled to fight in one get a match nobody can win, in
   * somebody's house. Boxing and Mau-Mau claim `match` and are unaffected.
   *
   * The mirror of `pinXp`'s refusal, and deliberately worded like it: that one
   * keeps a battles-only level out of the rooms list, this one keeps a place
   * out of the battle list. Both are the author's word about what their level
   * is for, honoured at the door rather than only in the picker that hides the
   * button.
   */
  if (document?.frame && !document.capabilities.includes('match')) {
    return {
      ok: false,
      error: `${document.name} is a place rather than a match, so there is nothing to fight over - keep it as a room instead.`,
    }
  }

  const rules = xp ? parsed.data.xpRules : undefined
  if (rules && document) {
    const problems = matchRulesProblems(rules, document)
    if (problems.length > 0) return { ok: false, error: problems[0]! }
  }

  /**
   * A match inside a level is the shape that level says it is.
   *
   * The caller's `mode` is overruled rather than validated, and that is the
   * point: the wizard skips its mode step for an XP and `openXpHere` has no
   * step at all, so both were passing `ffa` as a placeholder for "the document
   * decides". Now it does - see `battleModeFor`, which reads the `rules.sides`
   * the author set or derives it from the team spawns they placed.
   *
   * Only when there *is* a document. An ordinary battle in an arena is the host
   * answering the question themselves, which is what the wizard's mode step is.
   */
  const shape = document ? battleModeFor(document) : parsed.data.mode

  const battleId = randomUUID()

  return run(supabase, tenant.id, battleId, user.id, {
    type: 'CreateBattle',
    actorId: user.id,
    name: parsed.data.name,
    mode: shape,
    worldId: world ?? tenant.id,
    ...(xp ? { xpId: xp } : {}),
    ...(rules ? { xpRules: rules } : {}),
    hostTenantId: tenant.id,
    ...(parsed.data.football ? { football: parsed.data.football } : {}),
    ...(parsed.data.race ? { race: parsed.data.race } : {}),
  }, slug)
}

export async function joinBattle(
  slug: string,
  battleId: string,
  side?: Side,
): Promise<BattleResult> {
  const parsed = joinBattleSchema.safeParse({ battleId, side })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid battle' }
  }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context, { guestsAllowed: true })
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  /**
   * How many matches this space may have running at once.
   *
   * Swept first, and that ordering is the whole of why this is not two lines.
   * A match nobody is in still counts as running until something closes it, so
   * a space that hit its cap on Friday would be unable to start anything on
   * Monday - refused by matches with no players, with nothing on the screen
   * explaining it. `closeStaleBattles` is what the rail already runs for the
   * same reason; running it here means the cap counts matches rather than
   * ghosts.
   *
   * The sweep's own failure is not this action's problem: it is a tidy-up, and
   * a space that cannot start a match because the sweep was slow is a worse
   * outcome than one that counts a stale match for another minute. So it is
   * allowed to fail and the count goes ahead regardless.
   */
  try {
    await closeStaleBattles(supabase, tenant.id)
  } catch {
    // Deliberately ignored - see above.
  }

  const running = await countRunningBattles(supabase, tenant.id)
  const { allowed, limit } = await hasRoomFor(
    supabase,
    tenant.id,
    tenant.tier,
    'matches',
    running,
  )

  if (!allowed) {
    return {
      ok: false,
      error:
        limit === 0
          ? 'This plan does not include matches.'
          : `This space already has ${limit} matches running. Finish one, or upgrade for more.`,
    }
  }

  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'JoinBattle',
    actorId: user.id,
    // The joiner's own space, which is what makes a cross-space roster
    // legible later: the log says who fought for whom.
    tenantId: tenant.id,
    side: parsed.data.side,
  }, slug)
}

export async function leaveBattle(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  const left = await run(supabase, host, parsed.data.battleId, user.id, {
    type: 'LeaveBattle',
    actorId: user.id,
  }, slug)
  if (!left.ok) return left

  /**
   * The last one out takes the invitations with them.
   *
   * A link handed out mid-match is the most casually created thing in the app -
   * one click, pasted into a chat - and it stays live for twelve hours after
   * everybody has wandered off. Nobody goes back to revoke those, so an empty
   * match keeps admitting strangers into the space all evening.
   *
   * Read after the write, not derived from it: `run` has already advanced the
   * projection, so this sees the roster the log actually left behind rather than
   * the one this client believed it was changing.
   *
   * Best-effort on purpose. `revokeLinksForBattle` swallows its own failures and
   * this ignores the count, because tidying up must not turn somebody's exit
   * into an error message.
   */
  const after = await findBattle(supabase, parsed.data.battleId)
  if (after && after.participants.length === 0) {
    await revokeLinksForBattle(host, slug, parsed.data.battleId)
  }

  return left
}

/**
 * "I am at the line", or taking it back.
 *
 * No user id, like `reportDefeat` and for the same reason: readiness is a thing
 * you say about yourself, and a call that could name somebody else would let
 * one client start a match on behalf of a room that is still loading.
 */
export async function setReady(
  slug: string,
  battleId: string,
  ready: boolean,
): Promise<BattleResult> {
  const parsed = setReadySchema.safeParse({ battleId, ready })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context, { guestsAllowed: true })
  if (blocked) return { ok: false, error: blocked }

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'SetReady',
    actorId: user.id,
    ready: parsed.data.ready,
  }, slug)
}

export async function startBattle(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context, { guestsAllowed: true })
  if (blocked) return { ok: false, error: blocked }

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  // "Only the host may start it" is the decider's rule, re-derived from the log
  // rather than trusted from here.
  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'StartBattle',
    actorId: user.id,
    // The kickoff, from the server's clock. Every client derives the football
    // clock from this, so it must not come from whichever browser pressed start.
    at: new Date().toISOString(),
  }, slug)
}

/**
 * "I went down."
 *
 * Takes no user id: the session's is the only one it will use. See the note at
 * the top of this file - this is the whole reason the action exists rather than
 * the client writing to the read model.
 *
 * `by` is whoever the reporter believes finished them. Recorded, not trusted:
 * it decides whose name appears next to the defeat, never who wins.
 */
/**
 * "The ball went in."
 *
 * Reported by whichever client is stepping the ball - see `ballOwner` - which is a
 * weaker claim than `reportDefeat`'s, and knowingly so. There it is your own
 * health, and the session is the only id the action will use; here the reporter is
 * speaking about the *ball*, which nobody owns, and the point goes to a side rather
 * than to them. So the guards are different: the decider checks the match is a live
 * football match and that the same goal id is never counted twice, and the roster
 * check below means only somebody actually in the match can report one at all.
 *
 * `by` is passed through as a claim about who put it in. It decides whose name goes
 * on the goal and never who wins - the same standing `PlayerDefeated.by` has.
 */
export async function reportGoal(
  slug: string,
  battleId: string,
  input: { id: string; side: Team; by?: string; ownGoal?: boolean },
): Promise<BattleResult> {
  const parsed = reportGoalSchema.safeParse({ battleId, ...input })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid goal' }
  }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'ReportGoal',
    actorId: user.id,
    id: parsed.data.id,
    side: parsed.data.side,
    by: parsed.data.by,
    ownGoal: parsed.data.ownGoal,
  }, slug)
}

/**
 * "Time is up."
 *
 * Called by whichever client notices first, and validated in the decider against
 * the kickoff recorded in the log - so it does not matter who asks or whether their
 * clock is fast. `now` is stamped here from the server's clock for exactly that
 * reason: a browser that set its own `now` could otherwise end a match it was
 * losing the moment it started losing.
 *
 * Somebody has to ask, because the log cannot notice time passing on its own. The
 * alternative - a scheduled job sweeping for overdue matches - would resolve a
 * match minutes after the people in it had stopped caring.
 */
export async function callFullTime(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'CallFullTime',
    actorId: user.id,
    now: new Date().toISOString(),
  }, slug)
}

/**
 * "I crossed the line."
 *
 * Takes no user id and no place, which is the whole point of it existing rather
 * than the client writing a row: the session says who, the log says where they
 * came, and the server's clock says how long it took. A racer reports one thing -
 * that they got there - and everything that decides the result is worked out on
 * this side of the network.
 */
export async function reportFinish(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'ReportFinish',
    actorId: user.id,
    userId: user.id,
    // The stopwatch, from the server's clock. A browser cannot post a fast time
    // by being wrong about what time it is.
    now: new Date().toISOString(),
  }, slug)
}

export async function reportDefeat(
  slug: string,
  battleId: string,
  by?: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'ReportDefeat',
    actorId: user.id,
    userId: user.id,
    by,
  }, slug)
}

/** "I'll go again." Recorded on the finished match, not held in a browser tab. */
export async function wantRematch(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'WantRematch',
    actorId: user.id,
  }, slug)
}

/**
 * Make the rematch.
 *
 * Three steps, in this order:
 *
 *   1. create the new battle,
 *   2. join it ourselves,
 *   3. point the old match at it.
 *
 * Step 3 last, because the decider refuses a second rematch once one is
 * recorded - so an interrupted run leaves a spare battle nobody was sent to,
 * rather than the old match pointing at something that does not exist. Running
 * it again makes a fresh one and the stray is ignored, which is the failure
 * worth having.
 *
 * We only ever join *ourselves*. Everybody else who opted in walks into it from
 * the old room, which is the same rule the rest of this file keeps: a person's
 * place in a match is theirs to take.
 */
export async function startRematch(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context, { guestsAllowed: true })
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  /**
   * How many matches this space may have running at once.
   *
   * Swept first, and that ordering is the whole of why this is not two lines.
   * A match nobody is in still counts as running until something closes it, so
   * a space that hit its cap on Friday would be unable to start anything on
   * Monday - refused by matches with no players, with nothing on the screen
   * explaining it. `closeStaleBattles` is what the rail already runs for the
   * same reason; running it here means the cap counts matches rather than
   * ghosts.
   *
   * The sweep's own failure is not this action's problem: it is a tidy-up, and
   * a space that cannot start a match because the sweep was slow is a worse
   * outcome than one that counts a stale match for another minute. So it is
   * allowed to fail and the count goes ahead regardless.
   */
  try {
    await closeStaleBattles(supabase, tenant.id)
  } catch {
    // Deliberately ignored - see above.
  }

  const running = await countRunningBattles(supabase, tenant.id)
  const { allowed, limit } = await hasRoomFor(
    supabase,
    tenant.id,
    tenant.tier,
    'matches',
    running,
  )

  if (!allowed) {
    return {
      ok: false,
      error:
        limit === 0
          ? 'This plan does not include matches.'
          : `This space already has ${limit} matches running. Finish one, or upgrade for more.`,
    }
  }

  const previous = await findBattle(supabase, parsed.data.battleId)
  if (!previous) return { ok: false, error: 'Battle not found' }

  // Somebody already made it. Send them there rather than making a second.
  if (previous.rematchBattleId) {
    return { ok: true, battleId: previous.rematchBattleId }
  }

  /**
   * The rematch is hosted by the space that hosted the original.
   *
   * A stream belongs to one tenant, and `createBattle` hosts under whoever is
   * calling it - so a visiting fighter starting the rematch would host it in
   * *their* space, quietly moving the match. Requiring a member of the host
   * space to start it keeps a series in one place.
   */
  if (tenant.id !== previous.tenantId) {
    return {
      ok: false,
      error: 'Somebody from the hosting space has to start the rematch',
    }
  }

  const next = await sameAgain(slug, previous, user.id)
  if (!next.ok) return next

  const linked = await run(supabase, previous.tenantId, parsed.data.battleId, user.id, {
    type: 'StartRematch',
    actorId: user.id,
    battleId: next.battleId,
  }, slug)

  return linked.ok ? { ok: true, battleId: next.battleId } : linked
}

/**
 * This match again, as a new one, with the caller in it.
 *
 * The middle two steps of both ways a series continues - the rematch above and
 * the restart below - and it is shared rather than written twice because what
 * it does is carry things *over*. Every field forgotten here is a match that
 * silently becomes a different match, which is exactly the bug the level and
 * its rules were added to fix; two copies of that list is two chances to
 * forget the next one.
 *
 * We only ever join *ourselves*. Everybody else walks in from the old room,
 * which is the rule the rest of this file keeps: a person's place in a match is
 * theirs to take.
 */
async function sameAgain(
  slug: string,
  previous: BattleView,
  userId: string,
): Promise<BattleResult> {
  const next = await createBattle(
    slug,
    previous.name,
    previous.mode,
    // The lounge is stored as the host's own tenant id; createBattle reads an
    // absent world the same way, so hand it undefined rather than the id.
    previous.worldId === previous.tenantId ? undefined : previous.worldId,
    /**
     * The rules carry over, and they have to.
     *
     * A rematch is the same match again, so a five-minute friendly stays a
     * five-minute friendly rather than reverting to whatever the defaults are.
     * More pointedly, the decider refuses to create a football match or a race
     * without settings at all - so without these two lines the rematch button
     * on exactly the two modes that have settings would fail with "a match
     * needs a clock" and no way forward.
     */
    previous.football ?? undefined,
    previous.race ?? undefined,
    /**
     * The level, and the rules it was played under.
     *
     * Both were dropped, and dropping them was the bug behind *"the match ended
     * and I cannot rematch"* being only half the story: pressing rematch on a
     * match fought inside an XP made an ordinary free-for-all in the host's
     * lounge, because `xpId` was never passed on. Everybody who followed the
     * link arrived somewhere else.
     *
     * The overrides travel with it for the same reason the football settings
     * above do: a rematch is the same match again, so a deathmatch first to
     * twenty on somebody's course stays that rather than reverting to whatever
     * the document happens to say today.
     */
    previous.xpId ?? undefined,
    previous.xpRules ?? undefined,
  )
  if (!next.ok) return next

  const mine = previous.participants.find((p) => p.userId === userId)
  const joined = await joinBattle(slug, next.battleId, mine?.side ?? undefined)
  if (!joined.ok) return { ok: false, error: joined.error }

  return next
}

/**
 * Start this one again, from the middle of it.
 *
 * Asked for after the thing that keeps happening in a four-player game:
 * somebody drops out, everybody else stands around waiting, and there is no way
 * back to a game worth playing except for all four to walk out and set the
 * whole thing up again. So this is the button that does it - the match is
 * called off, a fresh one is opened on the same level under the same rules, and
 * the old stream is left pointing at it so **everybody else's room walks them
 * across** rather than dropping them on a "called off" screen.
 *
 * The same three steps `startRematch` takes and in the same order, for the same
 * reason: the link is written last, so an interrupted run leaves a spare match
 * nobody was sent to rather than a live match pointing at nothing. Pressing it
 * again makes another and the stray is swept.
 *
 * The one thing it does not do is *bring people with it*. They land in the new
 * lobby and take their own seat, which is the rule this whole file keeps.
 */
export async function restartBattle(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const blocked = writeBlockedReason(context, { guestsAllowed: true })
  if (blocked) return { ok: false, error: blocked }

  const { supabase, tenant, user } = context

  const previous = await findBattle(supabase, parsed.data.battleId)
  if (!previous) return { ok: false, error: 'Battle not found' }

  // Somebody already pressed it. Send them where everybody else went rather
  // than opening a third room.
  if (previous.rematchBattleId) {
    return { ok: true, battleId: previous.rematchBattleId }
  }

  /**
   * Restarted by the space that is hosting it, for `startRematch`'s reason: a
   * stream belongs to one tenant and `createBattle` hosts under whoever calls
   * it, so a visiting fighter would quietly move the match into their own
   * space.
   */
  if (tenant.id !== previous.tenantId) {
    return {
      ok: false,
      error: 'Somebody from the hosting space has to restart it',
    }
  }

  const next = await sameAgain(slug, previous, user.id)
  if (!next.ok) return next

  const linked = await run(supabase, previous.tenantId, parsed.data.battleId, user.id, {
    type: 'RestartBattle',
    actorId: user.id,
    battleId: next.battleId,
    ...(hasRole(context, ['owner', 'admin']) ? { asStaff: true } : {}),
  }, slug)

  return linked.ok ? { ok: true, battleId: next.battleId } : linked
}

/**
 * Call a match off, and take it out of the list.
 *
 * Two people can do this and they are not the same person: whoever opened the
 * match, and whoever runs the space. The second was added because the first is
 * not always there — a match its host has left, or one nobody came to, sat in
 * the space's active list until the day-later sweep, and the only person who
 * could see the problem was an owner with no button.
 *
 * `asStaff` is worked out **here**, from the session's role, and is the reason
 * it is not a parameter: a client that could ask for it could call off anybody's
 * match. Guests are admitted to this action (`guests: true`) exactly as they are
 * to the rest of the battle surface, and a guest is never staff — `hasRole`
 * answers that off the membership row rather than off anything sent.
 *
 * What it does *not* do is delete a row. `BattleCancelled` moves the match out
 * of `open`/`live`, which is what "gone" means here: the list asks for those two
 * (`listBattles`), the door refuses a cancelled match, and the log keeps the
 * fact that somebody opened one and called it off. Deleting the row would erase
 * that, and this is an event-sourced product — the point of a log is that the
 * things that happened stay happened.
 */
export async function cancelBattle(
  slug: string,
  battleId: string,
): Promise<BattleResult> {
  const parsed = battleIdSchema.safeParse({ battleId })
  if (!parsed.success) return { ok: false, error: 'Invalid battle' }

  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')

  const { supabase, user } = context
  const host = await battleTenant(supabase, parsed.data.battleId)
  if (!host) return { ok: false, error: 'Battle not found' }

  return run(supabase, host, parsed.data.battleId, user.id, {
    type: 'CancelBattle',
    actorId: user.id,
    ...(hasRole(context, ['owner', 'admin']) ? { asStaff: true } : {}),
  }, slug)
}

/** A level `/battle` can offer: enough to list, and the ref `createBattle` takes. */
export interface SummonableXp {
  ref: string
  name: string
  blurb: string | null
}

export type SummonablesResult =
  | { ok: true; xps: SummonableXp[] }
  | { ok: false; error: string }

/**
 * The levels a summons from the chat can put a match on.
 *
 * The same three-source shelf the battle page hands its wizard, filtered by the
 * same `fightable` question, so `/battle` and the wizard cannot disagree about
 * what is playable - a level the chat offered and `createBattle` then refused
 * would be a menu that lies. Stripped to three fields because the chat's menu
 * is a list of names, not a shelf of cartridges: no covers, no finishes, and
 * nothing a broadcast payload would bloat on.
 *
 * An action rather than data threaded through the layout, because the menu is
 * opened rarely and from a component that is mounted always - loading every
 * space's shelf into every session for a command most never type would be
 * paying the wizard's bill at the door of every page.
 */
export async function listSummonableXps(slug: string): Promise<SummonablesResult> {
  const context = await requireTenant(slug, { guests: true })
  requireFeature(context, 'battle')
  if (!battleOpen(context)) {
    return { ok: false, error: 'Matches are switched off for this space' }
  }

  const { supabase, tenant } = context
  const shelf = await readShelf(supabase, tenant.id, xpOpen(context))

  return {
    ok: true,
    xps: [...shelf.inMagazine, ...shelf.catalogue]
      .filter((row) => row.xp !== null && fightable(row.xp))
      .map((row) => ({
        ref: row.xp!.ref,
        name: row.xp!.name,
        blurb: row.xp!.blurb,
      })),
  }
}
