import 'server-only'
import { liveStreak, streakAlive, utcDay } from '@/domain/streaks/days'
import type { Client } from '@/es/store'

/**
 * The read side. These only ever touch the read model, and every one takes a
 * tenantId explicitly - a page that has not established which space it is in
 * cannot compile, rather than leaning on RLS to quietly scope it.
 *
 * "Today" is passed in rather than read from the clock inside these functions,
 * so a caller that draws the badge and the leaderboard on one page asks the
 * same day of both. Default to now for the common single call.
 */

export interface StreakView {
  /** The run to show *now* - the stored height if still alive, else 0. */
  current: number
  /** The best run ever, which a cold spell does not erase. */
  longest: number
  /** Distinct days ever seen in this space. */
  total: number
  /** The last UTC day seen, or null for a member with no row yet. */
  lastDay: string | null
  /** Whether today's visit is already on the run (seen today). */
  countedToday: boolean
}

/** Nobody-has-shown-up-yet, the shape a member gets before their first visit. */
const EMPTY_STREAK: StreakView = {
  current: 0,
  longest: 0,
  total: 0,
  lastDay: null,
  countedToday: false,
}

/** One member's streak in one space, resolved against today. */
export async function readStreak(
  supabase: Client,
  tenantId: string,
  userId: string,
  today: string = utcDay(new Date()),
): Promise<StreakView> {
  const { data, error } = await supabase
    .from('login_streaks_read_model')
    .select('current_streak, longest_streak, total_days, last_day')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to read streak: ${error.message}`)
  }
  if (!data) return EMPTY_STREAK

  return {
    current: liveStreak(data.current_streak, data.last_day, today),
    longest: data.longest_streak,
    total: data.total_days,
    lastDay: data.last_day,
    countedToday: data.last_day === today,
  }
}

export interface LeaderboardRow {
  userId: string
  /** The run to show now - stored height while alive, 0 once it has gone cold. */
  streak: number
  /** The best run ever, the tie-breaker and its own small badge of honour. */
  longest: number
  /** Whether the run is still going, so a cold best can read differently. */
  alive: boolean
  lastDay: string
}

/**
 * A space's members ranked by their live streak.
 *
 * The ordering is applied here in TypeScript rather than in SQL because the
 * number people are ranked by - the *live* streak - is not the stored column:
 * a run that has gone cold sorts as zero however tall it once was. So the query
 * gathers the space's rows off the index and this folds today's date over them.
 *
 * A cold row is kept, not dropped: "you had a 12-day run and it lapsed" is worth
 * seeing, and it sits where its zero puts it - below everyone still going, above
 * nobody. Ties break on the best run ever, then the most recent day, so two
 * live 3s are not ordered by a database whim.
 */
export async function readLeaderboard(
  supabase: Client,
  tenantId: string,
  today: string = utcDay(new Date()),
  limit = 100,
): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from('login_streaks_read_model')
    .select('user_id, current_streak, longest_streak, last_day')
    .eq('tenant_id', tenantId)
    .order('current_streak', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to read leaderboard: ${error.message}`)
  }

  return (data ?? [])
    .map((row) => ({
      userId: row.user_id,
      streak: liveStreak(row.current_streak, row.last_day, today),
      longest: row.longest_streak,
      alive: streakAlive(row.last_day, today),
      lastDay: row.last_day,
    }))
    .sort(
      (a, b) =>
        b.streak - a.streak ||
        b.longest - a.longest ||
        b.lastDay.localeCompare(a.lastDay),
    )
}
