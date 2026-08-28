import 'server-only'
import { isPreset } from '@kxb/xp'
import {
  type BattleMode,
  type FootballSettings,
  isBattleMode,
  NO_SCORE,
  type RaceSettings,
  type Score,
  type Side,
  type XpMatchRules,
} from '@/domain/battle/events'
import { displayNameFrom, readUsernames } from '@/domain/profile/username-queries'
import type { Client } from '@/es/store'

export interface BattleParticipantView {
  userId: string
  tenantId: string
  side: Side | null
  defeated: boolean
  /** Said they want to go again. Only meaningful once the match has ended. */
  wantsRematch: boolean
  /** Said they are at the line. Only meaningful while the match is open. */
  ready: boolean
  /** The handle, or something stable to call them if they have none. */
  name: string
  /**
   * Where they came in a race, 1-based. Null means they have not finished - and
   * once the race is over, that is what a did-not-finish is.
   */
  place: number | null
  /** How long their run took, in seconds. Null until they are home. */
  seconds: number | null
}

export interface BattleView {
  id: string
  tenantId: string
  name: string
  mode: BattleMode
  worldId: string
  /** The XP this is fought inside, or null for a world. */
  xpId: string | null
  /**
   * What this match settled the level's rules to be, or null.
   *
   * Null for a match in a world, and for an XP match created before the wizard
   * could ask - both of which mean "whatever the level says". See
   * `XpMatchRules`, and `applyMatchRules` for what is done with it.
   */
  xpRules: XpMatchRules | null
  status: 'open' | 'live' | 'ended' | 'cancelled'
  /**
   * Ended by the backstop a day later, rather than by a whistle.
   *
   * Only ever true beside `ended`, and the score on such a match is the score as
   * it stood when everybody left - which is why this is worth showing: without
   * it a 2-1 that nobody came back for is indistinguishable from a 2-1 somebody
   * won.
   */
  abandoned: boolean
  winner: { type: 'player' | 'side'; id: string } | null
  createdBy: string | null
  createdAt: string
  /** The match this one turned into, once somebody started a rematch. */
  rematchBattleId: string | null
  participants: BattleParticipantView[]
  /** Present only for football. Null for every other mode. */
  football: FootballSettings | null
  /** Present only for a race. Null for every other mode. */
  race: RaceSettings | null
  /** The scoreline. Stays 0-0 in the modes that do not score. */
  score: Score
  /**
   * When the whistle went, so the client can derive the clock.
   *
   * Null before kickoff, and null for every mode that has no clock. See
   * `matchRemaining`, which every screen showing a countdown goes through.
   */
  startedAt: string | null
}

type BattleRow = {
  id: string
  tenant_id: string
  name: string
  mode: string
  world_id: string
  xp_id: string | null
  xp_rules: unknown
  status: string
  winner_type: string | null
  winner_id: string | null
  created_by: string | null
  created_at: string
  rematch_battle_id: string | null
  duration_minutes: number | null
  score_limit: number | null
  damage_on: boolean | null
  respawn_on: boolean | null
  score_red: number | null
  score_blue: number | null
  started_at: string | null
  abandoned: boolean | null
}

const COLUMNS =
  'id, tenant_id, name, mode, world_id, xp_id, xp_rules, status, winner_type, winner_id, created_by, created_at, rematch_battle_id, duration_minutes, score_limit, damage_on, respawn_on, score_red, score_blue, started_at, abandoned'

function toView(row: BattleRow): BattleView {
  // One guard rather than a chain per reader - see `isBattleMode`, which was
  // written because the chain in the tournaments list was two names short.
  const mode: BattleMode = isBattleMode(row.mode) ? row.mode : 'ffa'

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    // Anything the check constraint was later widened to accept reads as the
    // simplest mode rather than crashing the page.
    mode,
    worldId: row.world_id,
    xpId: row.xp_id ?? null,
    // A jsonb column, so its shape is whatever was stored rather than whatever
    // the type says. Read through one coercion here so no screen downstream has
    // to defend itself against a row written by an older projection.
    xpRules: readXpRules(row.xp_rules),
    status:
      row.status === 'live' || row.status === 'ended' || row.status === 'cancelled'
        ? row.status
        : 'open',
    // Null on any row written before the column existed, which means the same
    // thing as false and is said as false rather than left to a reader.
    abandoned: row.abandoned ?? false,
    winner:
      row.winner_type === 'player' || row.winner_type === 'side'
        ? { type: row.winner_type, id: row.winner_id ?? '' }
        : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    rematchBattleId: row.rematch_battle_id,
    participants: [],
    /**
     * The settings, reassembled only for football.
     *
     * Keyed off the mode rather than off the columns being non-null, so a row that
     * somehow carried a duration on a free-for-all does not grow a clock the
     * decider would refuse to honour. The duration falls back to the shortest
     * legal match rather than zero: a football row with no duration is a bug, and
     * an unfinishable match is a worse way to surface it than a short one.
     */
    football:
      mode === 'football'
        ? {
            durationMinutes: row.duration_minutes ?? 3,
            ...(row.score_limit ? { scoreLimit: row.score_limit } : {}),
            damage: row.damage_on ?? true,
            respawn: row.respawn_on ?? true,
          }
        : null,
    /**
     * The same reassembly for a race, off the two columns it shares with
     * football. Keyed off the mode for the same reason: a duration on a
     * free-for-all is a bug, and growing a clock from it would be a stranger way
     * to surface that than ignoring it.
     */
    race:
      mode === 'race'
        ? { durationMinutes: row.duration_minutes ?? 3, damage: row.damage_on ?? true }
        : null,
    score:
      row.score_red === null && row.score_blue === null
        ? NO_SCORE
        : { red: row.score_red ?? 0, blue: row.score_blue ?? 0 },
    startedAt: row.started_at,
  }
}

/**
 * The stored override, coerced back into a block.
 *
 * A `jsonb` column holds whatever was written to it, and every screen that
 * reads this hands it to `applyMatchRules`, which builds the rules a level is
 * played under - so a half-shaped value here would be a match with a preset of
 * `undefined` rather than a match with no override. Anything that is not a
 * complete block reads as null, which means what it has always meant: whatever
 * the level says.
 */
function readXpRules(raw: unknown): XpMatchRules | null {
  if (typeof raw !== 'object' || raw === null) return null

  const block = raw as {
    preset?: unknown
    scoreLimit?: unknown
    timeLimit?: unknown
    players?: { min?: unknown; max?: unknown }
  }
  if (typeof block.preset !== 'string' || !isPreset(block.preset)) return null

  const min = block.players?.min
  const max = block.players?.max
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null

  const whole = (value: unknown) =>
    Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined

  return {
    preset: block.preset,
    ...(whole(block.scoreLimit) ? { scoreLimit: whole(block.scoreLimit)! } : {}),
    ...(whole(block.timeLimit) ? { timeLimit: whole(block.timeLimit)! } : {}),
    players: { min: min as number, max: max as number },
  }
}

/** Matches this space is hosting, newest first. */
export async function listBattles(
  supabase: Client,
  tenantId: string,
  statuses: readonly string[] = ['open', 'live'],
  limit = 30,
): Promise<BattleView[]> {
  const { data, error } = await supabase
    .from('battles_read_model')
    .select(COLUMNS)
    .eq('tenant_id', tenantId)
    .in('status', statuses as string[])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to list battles: ${error.message}`)

  const views = (data ?? []).map(toView)
  return attachRosters(supabase, views)
}

/**
 * How many matches this space has running, for the cap.
 *
 * Its own query rather than `listBattles(...).length`, and both reasons matter.
 * That function takes a `limit` of 30, so at the top tier - which allows 30 at
 * once - a count taken from it would stop rising exactly where the cap sits and
 * the check would never fire. It also calls `attachRosters`, which is a query
 * per match to fetch names that a number does not need.
 *
 * `head: true` so Postgres counts without sending rows. The same two statuses
 * `listBattles` defaults to, because "running" means open or live and a match
 * that has ended is not holding anything open.
 *
 * Throws rather than returning zero on failure. A count that quietly reads zero
 * is a cap that quietly does not apply, and this one guards a Realtime topic
 * per match rather than a row in a table.
 */
export async function countRunningBattles(
  supabase: Client,
  tenantId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('battles_read_model')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'live'])

  if (error) throw new Error(`Failed to count battles: ${error.message}`)
  return count ?? 0
}

/**
 * One match, with its roster.
 *
 * Null when it does not exist or the caller may not see it - the select policy
 * makes those indistinguishable from here, which is deliberate for the same
 * reason `requireTenant` 404s a non-member.
 */
export async function findBattle(
  supabase: Client,
  battleId: string,
): Promise<BattleView | null> {
  const { data, error } = await supabase
    .from('battles_read_model')
    .select(COLUMNS)
    .eq('id', battleId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load battle: ${error.message}`)
  if (!data) return null

  const [view] = await attachRosters(supabase, [toView(data)])
  return view ?? null
}

/**
 * Fill in each match's roster, and each fighter's handle.
 *
 * Two queries for the whole list rather than two per match. `readUsernames`
 * leaves out ids it could not resolve and `displayNameFrom` turns that into
 * something renderable - which matters more here than in a members list,
 * because a fighter from another space is exactly the case where RLS will not
 * hand over a profile, and a match with an unnamed fighter beats no match.
 */
async function attachRosters(
  supabase: Client,
  views: BattleView[],
): Promise<BattleView[]> {
  if (views.length === 0) return views

  const { data: rows } = await supabase
    .from('battle_participants')
    .select(
      'battle_id, user_id, tenant_id, side, defeated, ready, wants_rematch, finish_place, finish_seconds',
    )
    .in(
      'battle_id',
      views.map((view) => view.id),
    )
    .order('joined_at', { ascending: true })

  const participants = rows ?? []
  const names = await readUsernames(
    supabase,
    participants.map((row) => row.user_id),
  )

  const byBattle = new Map<string, BattleParticipantView[]>()
  for (const row of participants) {
    const list = byBattle.get(row.battle_id) ?? []
    list.push({
      userId: row.user_id,
      tenantId: row.tenant_id,
      side: (row.side as Side | null) ?? null,
      defeated: row.defeated,
      // Null on rows written before the column existed, which means the same as
      // false and is said as false rather than left to a reader.
      ready: row.ready ?? false,
      wantsRematch: row.wants_rematch,
      name: displayNameFrom(names, row.user_id),
      place: row.finish_place,
      seconds: row.finish_seconds,
    })
    byBattle.set(row.battle_id, list)
  }

  return views.map((view) => ({
    ...view,
    participants: byBattle.get(view.id) ?? [],
  }))
}
