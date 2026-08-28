import { type StreakEvent, STREAK_STREAM_TYPE } from '@/domain/streaks/events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * The read side: fold each member's `DayVisited` events into one row per
 * (space, member) that the dashboard badge and the leaderboard read in a single
 * round trip.
 *
 * The handler is a plain upsert, and that is the whole point of the event
 * carrying its snapshot (see events.ts): every value written comes straight off
 * the event, so a replay re-delivering the same day lands on the same row. No
 * `+ 1`, nothing that accumulates - the same idempotency `recount_battle_scores`
 * gets from recomputing, without a function.
 *
 * `tenant_id` and `user_id` come off the stored event, never a session - a
 * projection has no signed-in user and may be replaying a day written by
 * somebody who has since left. `actorId` is who showed up; it is never null
 * here, because a visit is only ever recorded on a real member's behalf.
 */
export const streaksProjection: Projection<StreakEvent> = {
  name: 'login_streaks_read_model',
  streamTypes: [STREAK_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<StreakEvent>): Promise<void> {
    switch (event.type) {
      case 'DayVisited': {
        if (!event.actorId) return

        const { error } = await supabase.from('login_streaks_read_model').upsert(
          {
            tenant_id: event.tenantId,
            user_id: event.actorId,
            stream_id: event.streamId,
            current_streak: event.data.streak,
            longest_streak: event.data.longest,
            total_days: event.data.total,
            last_day: event.data.day,
            updated_at: event.createdAt,
          },
          { onConflict: 'tenant_id,user_id' },
        )

        if (error) {
          throw new Error(
            `streaks projection failed for ${event.actorId}: ${error.message}`,
          )
        }
        return
      }

      default:
        return
    }
  },
}
