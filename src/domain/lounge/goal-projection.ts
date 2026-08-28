import { worldOf } from '@/domain/lounge/events'
import {
  LOUNGE_GOAL_STREAM_TYPE,
  type LoungeGoalEvent,
} from '@/domain/lounge/goal-events'
import type { Projection } from '@/es/projection'
import type { Client } from '@/es/store'
import type { StoredEvent } from '@/es/types'

/**
 * One row per goal.
 *
 * Every handler is an assignment rather than an accumulation, so replaying the
 * log twice lands on the same world - the property both the block and image
 * projections rely on. `GoalRemoved` sets a flag instead of deleting the row: the
 * read model then hides it, while where the goal used to stand stays in the log.
 *
 * `world_id` comes from `worldOf`, the same helper the block projection uses, for
 * the same reason - an event written without one meant the tenant's own lounge,
 * and a projection that guessed differently would file a battlefield's goals into
 * the lounge where the two are indistinguishable afterwards. There are no such
 * events yet, since goals postdate battlefields; using the helper anyway costs
 * nothing and means this cannot be the file that gets it wrong later.
 */
export const loungeGoalsProjection: Projection<LoungeGoalEvent> = {
  name: 'lounge_goals_read_model',
  streamTypes: [LOUNGE_GOAL_STREAM_TYPE],

  async handle(supabase: Client, event: StoredEvent<LoungeGoalEvent>): Promise<void> {
    switch (event.type) {
      case 'GoalPlaced': {
        const { error } = await supabase.from('lounge_goals_read_model').upsert(
          {
            id: event.streamId,
            tenant_id: event.tenantId,
            world_id: worldOf(event.data, event.tenantId),
            // `team` is what this was called before race marks existed, and an
            // event written then carries only that. One column either way.
            kind: event.data.kind ?? event.data.team ?? 'red',
            x: event.data.x,
            y: event.data.y,
            z: event.data.z,
            width: event.data.width,
            height: event.data.height,
            facing: event.data.facing,
            deleted: false,
            // From the event's actor, never a session: a projection may be
            // replaying an arena laid out by somebody who has since left.
            placed_by: event.actorId,
            created_at: event.createdAt,
            updated_at: event.createdAt,
            version: event.version,
          },
          { onConflict: 'id' },
        )

        if (error) {
          throw new Error(`lounge goals projection failed to place: ${error.message}`)
        }
        return
      }

      case 'GoalMoved':
        await patch(supabase, event, {
          x: event.data.x,
          y: event.data.y,
          z: event.data.z,
        })
        return

      case 'GoalResized':
        await patch(supabase, event, {
          width: event.data.width,
          height: event.data.height,
        })
        return

      case 'GoalRotated':
        await patch(supabase, event, { facing: event.data.facing })
        return

      case 'GoalTeamChanged':
        await patch(supabase, event, {
          kind: event.data.kind ?? event.data.team ?? 'red',
        })
        return

      case 'GoalRemoved':
        await patch(supabase, event, { deleted: true })
        return

      default:
        return
    }
  },
}

async function patch(
  supabase: Client,
  event: StoredEvent<LoungeGoalEvent>,
  changes: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('lounge_goals_read_model')
    .update({ ...changes, updated_at: event.createdAt, version: event.version })
    .eq('id', event.streamId)

  if (error) {
    throw new Error(
      `lounge goals projection failed to update ${event.streamId}: ${error.message}`,
    )
  }
}
